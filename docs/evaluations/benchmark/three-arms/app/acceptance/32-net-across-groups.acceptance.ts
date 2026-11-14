import {
  client,
  Client,
  database,
  Json,
  Outcome,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  start,
  stop,
} from './tally';

/** Request 32: what two people owe each other across their groups, netted at once as settlements. */
const db = database('netting');
let provider: PaymentProvider;
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  environment = await provider.environment();
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** A group `owner` creates in `currency`, `others` join, and `payer` paid `amount` for the two of `split`. */
async function owing(
  owner: Person,
  others: Person[],
  payer: Person,
  amount: number,
  split: Person[],
  currency = 'EUR',
) {
  const groupId = await api.create('/groups', owner.token, { name: 'Shared', currency });
  const invitation = await api.invite(owner, groupId);
  for (const other of others) await api.join(other, invitation);
  await api.expense(payer, groupId, { amount, splitBetween: split.map(each => each.id) });
  return groupId;
}

/**
 * Ann and Bob, in four groups created in this order: the flat (Ann owes Bob 300, Cy there too), the club (Bob owes Ann
 * 400), the trip (Ann owes Bob 200), and a group in dollars (Bob owes Ann 100).
 */
async function four(tag: string) {
  const [ann, bob, cy] = await Promise.all(['ann', 'bob', 'cy'].map(name => api.person(`${name}@${tag}.netting.test`)));
  const flat = await owing(ann, [bob, cy], bob, 600, [ann, bob]);
  const club = await owing(bob, [ann], ann, 800, [ann, bob]);
  const trip = await owing(ann, [bob], bob, 400, [ann, bob]);
  const dollars = await owing(ann, [bob], ann, 200, [ann, bob], 'USD');
  return { ann, bob, cy, flat, club, trip, dollars };
}

describe('net what two people owe each other across their groups', () => {
  it('nets what two people owe each other across the groups they share, as settlements that count at once', async () => {
    const { ann, bob, cy, flat, club, trip, dollars } = await four('netted');
    const id = await api.create('/nettings', ann.token, { with: bob.id, currency: 'EUR' });

    const netting = await api.read(`/nettings/${id}`, bob.token);
    expect(netting).toMatchObject({ id, by: ann.id, with: bob.id, currency: 'EUR', amount: 400 });
    expect(await api.read(`/nettings/${id}`, ann.token)).toEqual(netting);
    expect(await api.hidden(`/nettings/${id}`, cy.token)).toBe(404);
    expect(await api.hidden(`/nettings/${id}`)).toBe(401);

    // Ann can pay 500 (300 in the flat, 200 in the trip), Bob 400 (in the club): 400 is netted, the earliest group first.
    const settlements = netting.settlements as string[];
    expect(settlements).toHaveLength(3);
    const read: Json[] = [];
    for (const settlement of settlements) read.push(await api.settlement(settlement, ann.token));
    expect(read.map(each => [each.groupId, each.from, each.to, each.amount])).toEqual([
      [flat, ann.id, bob.id, 300],
      [trip, ann.id, bob.id, 100],
      [club, bob.id, ann.id, 400],
    ]);
    for (const each of read) {
      expect(each).toMatchObject({ method: 'net', status: 'paid' });
      expect((each.history as Json[]).map(one => one.status)).toEqual(['paid']);
    }

    // Counted at once, by everything that counts a settlement.
    expect((await api.balances(flat, cy.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0, [cy.id]: 0 });
    expect((await api.balances(club, ann.token)).of).toEqual({ [bob.id]: 0, [ann.id]: 0 });
    expect((await api.balances(trip, ann.token)).of).toEqual({ [ann.id]: -100, [bob.id]: 100 });
    expect((await api.balances(dollars, ann.token)).of).toEqual({ [ann.id]: 100, [bob.id]: -100 });
    expect(await api.list(`/groups/${trip}/settlements/suggested`, bob.token)).toEqual([
      { from: ann.id, to: bob.id, amount: 100 },
    ]);
    const statement = await api.read(`/groups/${flat}/members/${ann.id}/statement`, cy.token);
    expect((statement.entries as Json[]).at(-1)).toMatchObject({
      kind: 'settlement',
      settlementId: settlements[0],
      description: 'Settlement by netting',
      paid: 300,
      share: 0,
      balance: 0,
    });
    const audit = await api.list(`/groups/${club}/audit`, bob.token);
    expect(audit.at(-1)).toMatchObject({
      action: 'settlement-paid',
      by: ann.id,
      subjectId: settlements[2],
      amount: 400,
    });
    expect(await api.list(`/groups/${flat}/settlements`, cy.token)).toEqual([read[0]]);
    // A netting is never refunded.
    expect(await api.refused('POST', `/settlements/${settlements[2]}/refund`, ann.token)).toBe(true);

    // Nothing is left to net: Bob owes Ann nothing more in euros.
    expect(await api.refused('POST', '/nettings', bob.token, { with: ann.id, currency: 'EUR' })).toBe(true);
    expect((await api.balances(trip, ann.token)).of).toEqual({ [ann.id]: -100, [bob.id]: 100 });
  }, 90000);

  it('counts a payment waiting at the provider as paid, and nets in one currency only', async () => {
    const { ann, bob, flat, club, trip, dollars } = await four('waiting');
    await payable(api, bob, provider);
    // Ann's 150 to Bob in the trip waits at the provider: she can pay him 350, he can pay her 400.
    const waiting = await api.payThrough(ann, trip, bob, 150);
    const id = await api.create('/nettings', bob.token, { with: ann.id, currency: 'EUR' });
    const netting = await api.read(`/nettings/${id}`, ann.token);
    expect(netting).toMatchObject({ by: bob.id, with: ann.id, currency: 'EUR', amount: 350 });
    const read: Json[] = [];
    for (const settlement of netting.settlements as string[]) read.push(await api.settlement(settlement, bob.token));
    expect(read.map(each => [each.groupId, each.from, each.to, each.amount])).toEqual([
      [club, bob.id, ann.id, 350],
      [flat, ann.id, bob.id, 300],
      [trip, ann.id, bob.id, 50],
    ]);
    await provider.webhook(api, provider.paymentFor(waiting).id, 'succeeded');
    expect((await api.balances(trip, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0 });
    expect((await api.balances(club, ann.token)).of).toEqual({ [bob.id]: -50, [ann.id]: 50 });
    // The dollars are netted apart, and there Bob owes and Ann is owed only.
    expect(await api.refused('POST', '/nettings', bob.token, { with: ann.id, currency: 'USD' })).toBe(true);
    expect((await api.balances(dollars, ann.token)).of).toEqual({ [ann.id]: 100, [bob.id]: -100 });
  }, 90000);

  it('refuses a netting with oneself, in a currency Tally does not count in, with nothing to net, and keeps nothing', async () => {
    const { ann, bob, cy, flat, club } = await four('refused');
    const before = [await api.balances(flat, ann.token), await api.balances(club, ann.token)];
    const asks: [string, Person, Json][] = [
      ['with oneself', ann, { with: ann.id, currency: 'EUR' }],
      ['in a currency Tally does not count in', ann, { with: bob.id, currency: 'XYZ' }],
      ['with someone owed nothing back', cy, { with: ann.id, currency: 'EUR' }],
      [
        'with someone sharing no group',
        cy,
        { with: (await api.person('dan@refused.netting.test')).id, currency: 'EUR' },
      ],
      ['with no account', ann, { with: 'no-such-account', currency: 'EUR' }],
    ];
    const accepted: string[] = [];
    for (const [what, who, body] of asks)
      if ((await api.act('POST', '/nettings', who.token, body)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    for (const body of [{ with: bob.id }, { currency: 'EUR' }, { with: 42, currency: 'EUR' }])
      expect((await api.call('POST', '/nettings', ann.token, body)).status).toBe(400);
    expect((await api.call('POST', '/nettings', undefined, { with: bob.id, currency: 'EUR' })).status).toBe(401);
    expect([await api.balances(flat, ann.token), await api.balances(club, ann.token)]).toEqual(before);
    expect(await api.list(`/groups/${flat}/settlements`, ann.token)).toEqual([]);
  }, 60000);

  it('nets once when the two people ask at the same moment, through two servers', async () => {
    const second = await start(db.path, environment);
    try {
      const other = client(second.port);
      for (let round = 0; round < 3; round++) {
        const { ann, bob, flat, club, trip } = await four(`race${round}`);
        const bobThere = await other.login(bob.email);
        const outcomes: Outcome[] = await Promise.all([
          api.act('POST', '/nettings', ann.token, { with: bob.id, currency: 'EUR' }),
          other.act('POST', '/nettings', bobThere, { with: ann.id, currency: 'EUR' }),
        ]);
        expect(outcomes.filter(each => each.accepted)).toHaveLength(1);
        // Whoever asked, 400 is netted once: the trip's 200 or the flat's 300 first, in the order of the groups.
        expect((await api.balances(club, ann.token)).of).toEqual({ [bob.id]: 0, [ann.id]: 0 });
        const flatOf = (await api.balances(flat, ann.token)).of;
        const tripOf = (await api.balances(trip, ann.token)).of;
        expect(flatOf[ann.id] + tripOf[ann.id]).toBe(-100);
        expect(flatOf[ann.id]).toBe(0);
        expect((await api.balances(flat, bob.token)).sum + (await api.balances(trip, bob.token)).sum).toBe(0);
      }
    } finally {
      await stop(second);
    }
  }, 120000);
});
