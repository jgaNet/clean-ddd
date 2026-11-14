import {
  bySweep,
  client,
  Client,
  database,
  eventually,
  Json,
  ms,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 18: a reminder, made by the background job, for a debt over 2000 that lasted a period, once a period. */
const PERIOD = 3;
const db = database('reminders');
let provider: PaymentProvider;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  server = await start(db.path, { ...(await provider.environment()), REMINDER_PERIOD_SECONDS: String(PERIOD) });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

/** A group Ann owns, where Ann paid 5000: Bob owes 3000, Cy 2000 exactly. */
async function flat(tag: string, through = api) {
  const ann = await through.person(`ann@${tag}.reminders.test`);
  const bob = await through.person(`bob@${tag}.reminders.test`);
  const cy = await through.person(`cy@${tag}.reminders.test`);
  const groupId = await through.groupOf(ann, [bob, cy]);
  await through.expense(ann, groupId, {
    amount: 5000,
    splitExactly: [
      { memberId: ann.id, amount: 0 },
      { memberId: bob.id, amount: 3000 },
      { memberId: cy.id, amount: 2000 },
    ],
  });
  return { ann, bob, cy, groupId };
}

/** A person's reminders for a group, the most recent first. */
const reminders = async (who: Person, groupId: string, through = api) =>
  (await through.notices(who.token)).filter(each => each.kind === 'reminder' && each.groupId === groupId);

describe('reminders', () => {
  it('reminds a member who has owed more than 2000 for a period, at the sweep, and again each period while it lasts', async () => {
    const { ann, bob, cy, groupId } = await flat('lasting');
    const since = Date.now();
    expect(await reminders(bob, groupId)).toEqual([]);

    const first = await eventually(
      () => reminders(bob, groupId),
      each => each.length >= 1,
      bySweep(PERIOD),
    );
    expect(first).toHaveLength(1);
    // Not before a period has passed since a run first saw the debt.
    expect(ms(first[0].at) - since).toBeGreaterThanOrEqual((PERIOD - 1) * 1000);
    expect(first[0]).toMatchObject({ kind: 'reminder', groupId, amount: 3000 });
    expect(typeof first[0].id).toBe('string');
    expect(first[0].at).toMatch(TIME);
    expect(first[0].expenseId).toBeUndefined();

    const two = await eventually(
      () => reminders(bob, groupId),
      each => each.length >= 2,
      bySweep(PERIOD),
    );
    expect(two[1]).toEqual(first[0]);
    expect(ms(two[0].at) - ms(two[1].at)).toBeGreaterThanOrEqual((PERIOD - 1) * 1000);
    expect(two[0]).toMatchObject({ kind: 'reminder', groupId, amount: 3000 });
    // 2000 exactly is not more than 2000; and the owed are never reminded.
    expect(await reminders(cy, groupId)).toEqual([]);
    expect(await reminders(ann, groupId)).toEqual([]);
  }, 60000);

  it('stops reminding once what is still owed is 2000 or less, and starts again, a period later, when it comes back', async () => {
    const { ann, bob, groupId } = await flat('back');
    await payable(api, ann, provider);
    await eventually(
      () => reminders(bob, groupId),
      each => each.length >= 1,
      bySweep(PERIOD),
    );
    // A payment waiting at the provider counts as paid: Bob still owes 2000.
    const waiting = await api.payThrough(bob, groupId, ann, 1000);
    const quiet = (await reminders(bob, groupId)).length;
    await sleep(2 * PERIOD * 1000 + 2000);
    expect(await reminders(bob, groupId)).toHaveLength(quiet);

    // It fails: Bob owes 3000 again, noted again from the next run, and reminded a period after it.
    const failedAt = Date.now();
    await provider.webhook(api, provider.paymentFor(waiting).id, 'failed');
    const again = await eventually(
      () => reminders(bob, groupId),
      each => each.length > quiet,
      bySweep(PERIOD),
    );
    expect(again).toHaveLength(quiet + 1);
    expect(ms(again[0].at) - failedAt).toBeGreaterThanOrEqual((PERIOD - 1) * 1000);
    expect(again[0]).toMatchObject({ kind: 'reminder', groupId, amount: 3000 });
  }, 90000);

  it('reminds at most once a period, however many servers run on the database', async () => {
    const second = await start(db.path, { ...(await provider.environment()), REMINDER_PERIOD_SECONDS: String(PERIOD) });
    try {
      const { bob, groupId } = await flat('servers');
      const three = await eventually(
        () => reminders(bob, groupId),
        each => each.length >= 3,
        bySweep(3 * PERIOD),
      );
      const times = three.map(each => ms(each.at)).reverse();
      const gaps = times.slice(1).map((at, n) => at - times[n]);
      expect(gaps.filter(gap => gap < (PERIOD - 1) * 1000)).toEqual([]);
    } finally {
      await stop(second);
    }
  }, 90000);

  it('never reminds because someone read, only at a run of the background job', async () => {
    // A server whose job runs once an hour, with a period of a second: a debt read again and again is never reminded.
    const idle = database('reminders-idle');
    const hourly = await start(idle.path, { JOBS_INTERVAL_SECONDS: '3600', REMINDER_PERIOD_SECONDS: '1' });
    try {
      const through = client(hourly.port);
      const { bob, groupId } = await flat('read', through);
      const seen: Json[][] = [];
      for (let read = 0; read < 8; read++) {
        await through.balances(groupId, bob.token);
        await through.list(`/groups/${groupId}/settlements/suggested`, bob.token);
        seen.push(await reminders(bob, groupId, through));
        await sleep(500);
      }
      expect(seen.filter(each => each.length > 0)).toEqual([]);
    } finally {
      await stop(hourly);
      idle.remove();
    }
  }, 60000);
});
