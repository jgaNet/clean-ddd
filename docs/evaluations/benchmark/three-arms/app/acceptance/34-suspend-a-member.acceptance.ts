import {
  bySweep,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  monthly,
  Outcome,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 34: an account suspended by an administrator, and reinstated. */
const ADMIN_EMAILS = 'admin@suspend.test';
const db = database('suspend');
let provider: PaymentProvider;
let server: Running;
let api: Client;
let admin: Person;
beforeAll(async () => {
  provider = paymentProvider();
  server = await start(db.path, { ...(await provider.environment()), ADMIN_EMAILS });
  api = client(server.port);
  admin = await api.person('admin@suspend.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const suspend = (who: Person, by = admin) => api.act('PUT', `/admin/accounts/${who.id}/suspension`, by.token);
const reinstate = (who: Person, by = admin) => api.act('DELETE', `/admin/accounts/${who.id}/suspension`, by.token);

/**
 * Ann, Bob and Cy: in the flat, which Ann owns, Ann paid 900 for the three (Ann 600, Bob -300, Cy -300); in the trip,
 * which Bob owns, Bob paid 400 for Ann and himself (Bob 200, Ann -200). Ann and Bob are paid through the provider.
 */
async function two(tag: string) {
  const [ann, bob, cy] = await Promise.all(['ann', 'bob', 'cy'].map(name => api.person(`${name}@${tag}.suspend.test`)));
  const flat = await api.groupOf(ann, [bob, cy]);
  await api.expense(ann, flat, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  const trip = await api.groupOf(bob, [ann]);
  const bobs = await api.expense(bob, trip, { amount: 400, splitBetween: [bob.id, ann.id] });
  await payable(api, ann, provider);
  await payable(api, bob, provider);
  return { ann, bob, cy, flat, trip, bobs };
}

describe('suspend a member', () => {
  it("refuses every expense and settlement a suspended account starts, by one rule's name, in every group, until reinstated", async () => {
    const { ann, bob, cy, flat, trip, bobs } = await two('refused');
    expect((await suspend(bob)).accepted).toBe(true);
    const asked = provider.payments.length;
    const starts: [string, () => Promise<Outcome>][] = [
      [
        'record an expense in the flat',
        () =>
          api.act('POST', `/groups/${flat}/expenses`, bob.token, {
            description: 'Invented',
            amount: 3000,
            date: day(0),
            splitBetween: [bob.id, cy.id],
          }),
      ],
      [
        'record an expense in the trip',
        () =>
          api.act('POST', `/groups/${trip}/expenses`, bob.token, {
            description: 'Invented',
            amount: 3000,
            date: day(0),
            splitBetween: [bob.id, ann.id],
          }),
      ],
      [
        'set up a recurring expense',
        () =>
          api.act('POST', `/groups/${trip}/recurring`, bob.token, {
            description: 'Invented',
            amount: 3000,
            startsOn: monthly(-10).startsOn,
            splitBetween: [bob.id, ann.id],
          }),
      ],
      [
        'record a settlement in cash',
        () => api.act('POST', `/groups/${trip}/settlements/cash`, bob.token, { from: ann.id, amount: 100 }),
      ],
      [
        'pay through the provider',
        () => api.act('POST', `/groups/${flat}/settlements/provider`, bob.token, { to: ann.id, amount: 100 }),
      ],
      ['ask for a netting', () => api.act('POST', '/nettings', bob.token, { with: ann.id, currency: 'EUR' })],
    ];
    const outcomes: [string, Outcome][] = [];
    for (const [what, act] of starts) outcomes.push([what, await act()]);
    expect(outcomes.filter(([, outcome]) => outcome.accepted).map(([what]) => what)).toEqual([]);
    const names = new Set(outcomes.filter(([, outcome]) => outcome.later).map(([, outcome]) => outcome.error?.type));
    expect(names.size).toBeLessThanOrEqual(1);
    expect(provider.payments.length).toBe(asked);
    expect((await api.balances(flat, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });
    expect((await api.balances(trip, ann.token)).of).toEqual({ [bob.id]: 200, [ann.id]: -200 });
    expect(await api.list(`/groups/${trip}/recurring`, ann.token)).toEqual([]);

    // Everything else, Bob still does; and the others go on with him.
    expect((await api.read('/accounts/me', bob.token)).id).toBe(bob.id);
    await api.done('PUT', `/expenses/${bobs}`, bob.token, {
      description: 'Petrol',
      amount: 400,
      date: day(0),
      splitBetween: [bob.id, ann.id],
      version: 1,
    });
    await api.expense(ann, flat, { amount: 300, splitBetween: [ann.id, bob.id, cy.id] });
    await api.cash(ann, flat, bob, 100);
    const toBob = await api.payThrough(ann, trip, bob, 100);
    await provider.webhook(api, provider.paymentFor(toBob).id, 'succeeded');
    expect((await api.balances(flat, ann.token)).of).toEqual({ [ann.id]: 700, [bob.id]: -300, [cy.id]: -400 });
    expect((await api.balances(trip, ann.token)).of).toEqual({ [bob.id]: 100, [ann.id]: -100 });

    // Reinstated, Bob starts again.
    expect((await reinstate(bob)).accepted).toBe(true);
    await api.expense(bob, trip, { amount: 200, splitBetween: [bob.id, ann.id] });
    const netting = await api.create('/nettings', bob.token, { with: ann.id, currency: 'EUR' });
    expect((await api.read(`/nettings/${netting}`, bob.token)).amount).toBe(200);
  }, 90000);

  it('writes nothing in a group when an account is suspended or reinstated, and logs each to the administrators', async () => {
    const { ann, bob, flat, trip } = await two('logged');
    const reads = [
      `/groups/${flat}`,
      `/groups/${flat}/members`,
      `/groups/${flat}/balances`,
      `/groups/${flat}/expenses`,
      `/groups/${flat}/settlements`,
      `/groups/${flat}/audit`,
      `/groups/${trip}/members`,
      `/groups/${trip}/audit`,
      `/groups/${flat}/members/${bob.id}/statement`,
    ];
    const read = () => Promise.all(reads.map(path => api.read(path, ann.token)));
    const before = await read();
    const logged = (await api.list('/admin/log', admin.token)).length;

    expect((await suspend(bob)).accepted).toBe(true);
    expect(await read()).toEqual(before);
    // Suspended again, or reinstated twice: nothing changes, and nothing more is logged.
    expect((await suspend(bob)).accepted).toBe(true);
    expect((await reinstate(bob)).accepted).toBe(true);
    expect((await reinstate(bob)).accepted).toBe(true);
    expect(await read()).toEqual(before);

    const log = await api.list('/admin/log', admin.token);
    expect(log).toHaveLength(logged + 2);
    expect(log.slice(logged).map(each => [each.by, each.action, each.subjectId])).toEqual([
      [admin.id, 'suspended', bob.id],
      [admin.id, 'reinstated', bob.id],
    ]);
    const times = log.map(each => new Date(String(each.at)).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // Only an administrator suspends, reinstates, or reads the log.
    expect((await suspend(ann, bob)).accepted).toBe(false);
    expect((await reinstate(ann, bob)).accepted).toBe(false);
    expect((await api.act('PUT', '/admin/accounts/no-such-account/suspension', admin.token)).accepted).toBe(false);
    expect((await api.call('PUT', `/admin/accounts/${ann.id}/suspension`)).status).toBe(401);
    expect(await api.hidden('/admin/log', ann.token)).toBe(404);
    expect(await api.hidden('/admin/log')).toBe(401);
    expect(await api.list('/admin/log', admin.token)).toHaveLength(logged + 2);
    await api.expense(ann, flat, { amount: 300, splitBetween: [ann.id, bob.id] });
  }, 90000);

  it('records the recurring expense of a suspended payer at the first run after they are reinstated', async () => {
    // Set up on a server whose job runs once an hour, then left to one whose job runs every second.
    const idle = database('suspend-idle');
    const hourly = await start(idle.path, { ADMIN_EMAILS, JOBS_INTERVAL_SECONDS: '3600' });
    let running: Running | undefined;
    try {
      const through = client(hourly.port);
      const root = await through.person('admin@suspend.test');
      const ann = await through.person('ann@recurring.suspend.test');
      const bob = await through.person('bob@recurring.suspend.test');
      const groupId = await through.groupOf(ann, [bob]);
      const { startsOn, passed } = monthly(-40);
      const id = await through.create(`/groups/${groupId}/recurring`, bob.token, {
        description: 'Rent',
        amount: 1000,
        startsOn,
        splitBetween: [bob.id, ann.id],
      });
      await through.done('PUT', `/admin/accounts/${bob.id}/suspension`, root.token);
      await stop(hourly);

      running = await start(idle.path, { ADMIN_EMAILS });
      const after = client(running.port);
      const [annToken, rootToken] = [await after.login(ann.email), await after.login(root.email)];
      await sleep(bySweep(0));
      expect(await after.list(`/groups/${groupId}/expenses`, annToken)).toEqual([]);
      expect((await after.read(`/recurring/${id}`, annToken)).next).toBe(startsOn);

      await after.done('DELETE', `/admin/accounts/${bob.id}/suspension`, rootToken);
      const recorded: Json[] = await eventually(
        () => after.list(`/groups/${groupId}/expenses`, annToken),
        each => each.length >= passed.length,
        bySweep(0),
      );
      expect(recorded.map(each => each.date).sort()).toEqual(passed);
      expect(recorded.every(each => each.paidBy === bob.id)).toBe(true);
      expect((await after.balances(groupId, annToken)).of).toEqual({
        [ann.id]: -500 * passed.length,
        [bob.id]: 500 * passed.length,
      });
    } finally {
      if (running) await stop(running);
      else await stop(hourly);
      idle.remove();
    }
  }, 90000);
});
