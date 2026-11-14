import { randomBytes } from 'crypto';
import {
  client,
  Client,
  database,
  day,
  Json,
  PASSWORD,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  start,
  stop,
} from './tally';

/** Request 35: a person deletes their account; their name and email are erased everywhere, their balances kept. */
const db = database('deletion');
let provider: PaymentProvider;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  server = await start(db.path, { ...(await provider.environment()), ADMIN_EMAILS: 'admin@deletion.test' });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/**
 * Ann, Bob and Cy, Cy with a name and an email found nowhere else: in the flat, which Ann owns, Cy paid 900 for the
 * three (Cy 600, Ann -300, Bob -300); in the trip, which Bob owns, Bob paid 400 for Cy and himself (Bob 200, Cy -200).
 */
async function two(tag: string) {
  const unique = randomBytes(4).toString('hex');
  const ann = await api.person(`ann@${tag}.deletion.test`);
  const bob = await api.person(`bob@${tag}.deletion.test`);
  const cy = await api.person(`cyprian.${unique}@${tag}.deletion.test`, `Cyprian Quellmalz-${unique}`);
  const flat = await api.groupOf(ann, [bob, cy]);
  const dinner = await api.expense(cy, flat, { amount: 900, splitBetween: [cy.id, ann.id, bob.id] });
  const trip = await api.groupOf(bob, [cy]);
  await api.expense(bob, trip, { amount: 400, splitBetween: [bob.id, cy.id] });
  return { ann, bob, cy, flat, trip, dinner };
}

describe('delete an account', () => {
  it('anonymises a deleted account in every group it was in, and keeps its balances', async () => {
    const { ann, bob, cy, flat, trip, dinner } = await two('kept');
    await payable(api, cy, provider);
    const reads = (group: string, as: Person) =>
      Promise.all(
        [
          `/groups/${group}/balances`,
          `/groups/${group}/expenses`,
          `/groups/${group}/audit`,
          `/groups/${group}/settlements`,
          `/groups/${group}/members/${cy.id}/statement`,
        ].map(path => api.read(path, as.token)),
      );
    const before = [await reads(flat, ann), await reads(trip, bob)];
    const members = [
      await api.list(`/groups/${flat}/members`, ann.token),
      await api.list(`/groups/${trip}/members`, bob.token),
    ];

    await api.done('DELETE', '/accounts/me', cy.token);

    // Nobody signs in as Cy any more, as if no account had the email, and Cy's token proves nothing.
    expect((await api.call('POST', '/accounts/login', undefined, { email: cy.email, password: PASSWORD })).status).toBe(
      401,
    );
    expect((await api.call('GET', '/accounts/me', cy.token)).status).toBe(401);
    expect((await api.call('GET', `/groups/${flat}`, cy.token)).status).toBe(401);
    // Cy stays, at his place, as a deleted account; everything else reads as it did.
    expect([await reads(flat, ann), await reads(trip, bob)]).toEqual(before);
    const anonymous = (list: Json[]) =>
      list.map(each => (each.memberId === cy.id ? { ...each, name: 'Deleted account' } : each));
    expect(await api.list(`/groups/${flat}/members`, bob.token)).toEqual(anonymous(members[0]));
    expect(await api.list(`/groups/${trip}/members`, bob.token)).toEqual(anonymous(members[1]));
    expect((await api.read(`/expenses/${dinner}`, ann.token)).paidBy).toBe(cy.id);
    expect((await api.balances(flat, bob.token)).sum).toBe(0);

    // Cy is in no new split, is paid nothing through the provider, and is netted with nobody.
    const refusals = [
      await api.act('POST', `/groups/${flat}/expenses`, ann.token, {
        description: 'Late',
        amount: 300,
        date: day(0),
        splitBetween: [ann.id, cy.id],
      }),
      await api.act('POST', `/groups/${flat}/settlements/provider`, ann.token, { to: cy.id, amount: 100 }),
      await api.act('POST', '/nettings', bob.token, { with: cy.id, currency: 'EUR' }),
    ];
    expect(refusals.map(each => each.accepted)).toEqual([false, false, false]);
    // What Bob received from Cy in cash is still recorded: the trip is even.
    await api.cash(bob, trip, cy, 200);
    expect((await api.balances(trip, bob.token)).of).toEqual({ [bob.id]: 0, [cy.id]: 0 });

    // The email is free: a new account, which is someone else.
    const again = await api.person(cy.email, 'Someone else');
    expect(again.id).not.toBe(cy.id);
    expect(await api.list('/groups/mine', again.token)).toEqual([]);
    expect(await api.read('/accounts/me', again.token)).toMatchObject({
      id: again.id,
      email: cy.email,
      name: 'Someone else',
    });
    expect(await api.hidden(`/groups/${flat}`, again.token)).toBe(404);
  }, 90000);

  it('erases the name and the email of a deleted account from everything Tally keeps', async () => {
    const { ann, cy, flat } = await two('erased');
    await payable(api, cy, provider);
    await api.done('PUT', '/accounts/me/notice-preferences/budget', cy.token, { enabled: false });
    await api.expense(ann, flat, { amount: 300, splitBetween: [ann.id, cy.id] });
    await api.cash(cy, flat, ann, 100);
    const email = cy.email;
    const name = cy.name;
    expect(db.holds(email)).toBeGreaterThan(0);
    expect(db.holds(name)).toBeGreaterThan(0);

    await api.done('DELETE', '/accounts/me', cy.token);
    expect(db.holds(email)).toBe(0);
    expect(db.holds(name)).toBe(0);
    // Its id stays where it was.
    expect(db.holds(cy.id)).toBeGreaterThan(0);
    expect((await api.list(`/groups/${flat}/audit`, ann.token)).map(each => each.by)).toContain(cy.id);
  }, 60000);

  it('refuses to delete an account that owns a group with another member, or has a payment waiting at the provider', async () => {
    const { ann, bob, cy, flat } = await two('refused');
    await payable(api, cy, provider);
    expect(await api.refused('DELETE', '/accounts/me', ann.token)).toBe(true);
    // Bob pays Cy 100 through the provider, and waits.
    const waiting = await api.payThrough(bob, flat, cy, 100);
    expect(await api.refused('DELETE', '/accounts/me', cy.token)).toBe(true);
    expect(await api.refused('DELETE', '/accounts/me', bob.token)).toBe(true);
    expect((await api.read('/accounts/me', cy.token)).name).toBe(cy.name);
    expect((await api.list(`/groups/${flat}/members`, ann.token)).map(each => each.name)).toEqual([
      ann.name,
      bob.name,
      cy.name,
    ]);
    await provider.webhook(api, provider.paymentFor(waiting).id, 'succeeded');
    await api.done('DELETE', '/accounts/me', cy.token);
    // An account that owns a group of its own alone is deleted.
    const dan = await api.person('dan@refused.deletion.test');
    await api.group(dan, 'Alone');
    await api.done('DELETE', '/accounts/me', dan.token);
    expect((await api.call('DELETE', '/accounts/me')).status).toBe(401);
    expect(
      (await client(server.port).call('POST', '/accounts/login', undefined, { email: dan.email, password: PASSWORD }))
        .status,
    ).toBe(401);
  }, 60000);
});
