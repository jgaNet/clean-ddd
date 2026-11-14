import {
  client,
  Client,
  database,
  day,
  Json,
  kill,
  monthly,
  payable,
  PaymentProvider,
  paymentProvider,
  previous,
  Running,
  start,
  stop,
} from './tally';

/**
 * Request 30: the state kept in PostgreSQL, across kills and two servers, and what a tree kept in its SQLite file
 * moved into it, a payment waiting at the provider included. It needs a PostgreSQL 16 server the tests create
 * databases on (`TALLY_POSTGRES`, 127.0.0.1:55432 when not set) and `psql` on the PATH (tally.ts, `database`).
 */
const db = database('postgresql');
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

/** Three people in a group Ann owns and is paid in; Ann paid 900 for the three: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string, through = api) {
  const ann = await through.person(`ann@${tag}.postgresql.test`);
  const bob = await through.person(`bob@${tag}.postgresql.test`);
  const cy = await through.person(`cy@${tag}.postgresql.test`);
  const groupId = await through.groupOf(ann, [bob, cy]);
  const expenseId = await through.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  await payable(through, ann, provider);
  return { ann, bob, cy, groupId, expenseId };
}

describe('storage on PostgreSQL', () => {
  it('keeps its state in PostgreSQL, and finds it after a kill, whatever DATABASE_PATH says', async () => {
    const { ann, bob, groupId, expenseId } = await flat('kept');
    const expense = await api.read(`/expenses/${expenseId}`, bob.token);
    const balances = await api.balances(groupId, ann.token);
    expect(db.rows()).toBeGreaterThan(0);

    await kill(server);
    // Another file, never written: what the server finds can only come from PostgreSQL.
    const elsewhere = await start(`${db.path}-not-read`, { ...environment, DATABASE_URL: db.url });
    try {
      const other = client(elsewhere.port);
      const token = await other.login(bob.email);
      expect(await other.read(`/expenses/${expenseId}`, token)).toEqual(expense);
      expect(await other.balances(groupId, token)).toEqual(balances);
      expect((await other.list('/groups/mine', token)).map(each => each.id)).toEqual([groupId]);
    } finally {
      await stop(elsewhere);
    }
    server = await start(db.path, environment);
    api = client(server.port);
  }, 90000);

  it('prepares an empty database and serves at once', async () => {
    const empty = database('postgresql-empty');
    const fresh = await start(empty.path);
    try {
      const other = client(fresh.port);
      const ivy = await other.person('ivy@empty.postgresql.test');
      expect((await other.read('/accounts/me', ivy.token)).email).toBe(ivy.email);
      expect(empty.rows()).toBeGreaterThan(0);
    } finally {
      await stop(fresh);
      empty.remove();
    }
  }, 90000);

  it('counts every expense once and keeps one of two settlements that would pay too much, with two servers', async () => {
    const second = await start(db.path, environment);
    try {
      const other = client(second.port);
      const { ann, bob, cy, groupId } = await flat('servers');
      const tokens = { ann: await other.login(ann.email), bob: await other.login(bob.email) };
      await Promise.all(
        Array.from({ length: 20 }, (_, n) =>
          n % 2 === 0
            ? api.expense(bob, groupId, { amount: 300 + n, splitBetween: [ann.id, bob.id, cy.id] })
            : other.create(`/groups/${groupId}/expenses`, tokens.ann, {
                description: 'Groceries',
                amount: 300 + n,
                date: day(0),
                splitBetween: [cy.id, ann.id, bob.id],
              }),
        ),
      );
      expect(await other.list(`/groups/${groupId}/expenses`, tokens.bob)).toHaveLength(21);
      const balances = await api.balances(groupId, cy.token);
      expect(balances.sum).toBe(0);
      // Two settlements at once, each of all Cy can pay Ann: one is kept.
      const amount = Math.min(-balances.of[cy.id], balances.of[ann.id]);
      const [first, next] = await Promise.all([
        api.act('POST', `/groups/${groupId}/settlements/cash`, ann.token, { from: cy.id, amount }),
        other.act('POST', `/groups/${groupId}/settlements/cash`, tokens.ann, { from: cy.id, amount }),
      ]);
      expect([first.accepted, next.accepted].filter(Boolean)).toHaveLength(1);
      expect(await api.balances(groupId, cy.token)).toMatchObject({
        of: { [cy.id]: balances.of[cy.id] + amount, [ann.id]: balances.of[ann.id] - amount },
        sum: 0,
      });
    } finally {
      await stop(second);
    }
  }, 180000);

  it('moves what the tree before it kept, and a payment waiting at the provider when it changed counts once', async () => {
    // Recorded through the tree as it stood before request 30 (`previous`), on its SQLite file, then read through this
    // one, started on that file and an empty PostgreSQL database.
    const moved = database('postgresql-moved');
    let running = await start(moved.path, environment, previous('postgresql'));
    try {
      // The tree before the change answers as the requests before it did: its answers are not held to the API now.
      let through = client(running.port, false);
      const { ann, bob, cy, groupId, expenseId } = await flat('moved', through);
      await through.done('PUT', `/expenses/${expenseId}`, ann.token, {
        description: 'Groceries',
        amount: 900,
        date: day(0),
        category: 'groceries',
        splitBetween: [ann.id, bob.id, cy.id],
        version: 1,
      });
      const cash = await through.cash(ann, groupId, cy, 100);
      const landed = await through.payThrough(bob, groupId, ann, 200);
      const landedPayment = provider.paymentFor(landed).id;
      await provider.webhook(through, landedPayment, 'succeeded', 'wh-landed');
      // Ann 300, Bob -100, Cy -200; Bob's last 100 waits at the provider.
      const waiting = await through.payThrough(bob, groupId, ann, 100);
      const waitingPayment = provider.paymentFor(waiting).id;
      await through.done('PUT', `/groups/${groupId}/budgets/groceries`, ann.token, { amount: 5000 });
      const template = await through.create(`/groups/${groupId}/templates`, bob.token, {
        name: 'Bob and Cy',
        splitBetween: [bob.id, cy.id],
      });
      const rent = await through.create(`/groups/${groupId}/recurring`, cy.token, {
        description: 'Rent',
        amount: 1000,
        startsOn: monthly(30).startsOn,
        splitBetween: [cy.id, ann.id],
      });
      const old = await through.group(ann, 'Old trip');
      await through.done('POST', `/groups/${old}/archive`, ann.token);

      const reads = [
        '/groups/mine',
        `/groups/${groupId}`,
        `/groups/${old}`,
        `/groups/${groupId}/members`,
        `/groups/${groupId}/balances`,
        `/groups/${groupId}/expenses`,
        `/expenses/${expenseId}`,
        `/groups/${groupId}/members/${bob.id}/statement`,
        `/groups/${groupId}/members/${ann.id}/statement`,
        `/groups/${groupId}/settlements`,
        `/settlements/${waiting}`,
        `/groups/${groupId}/settlements/suggested`,
        `/groups/${groupId}/budgets`,
        `/groups/${groupId}/templates`,
        `/recurring/${rent}`,
        `/groups/${groupId}/audit`,
        '/notices',
        '/accounts/me/payout-account',
      ];
      const read = async (as: Client, token: string) => Promise.all(reads.map(path => as.read(path, token)));
      const before = await read(through, ann.token);
      const bobsNotices = await through.notices(bob.token);
      await stop(running);

      running = await start(moved.path, environment);
      through = client(running.port);
      const tokens = { ann: await through.login(ann.email), bob: await through.login(bob.email) };
      expect(await read(through, tokens.ann)).toEqual(before);
      expect(await through.notices(tokens.bob)).toEqual(bobsNotices);
      expect(moved.rows()).toBeGreaterThan(0);

      // The payment that waited lands now, once, however the provider says it.
      expect((await provider.webhook(through, waitingPayment, 'succeeded', 'wh-waiting')).accepted).toBe(true);
      const settled = { [ann.id]: 200, [bob.id]: 0, [cy.id]: -200 };
      expect((await through.balances(groupId, tokens.ann)).of).toEqual(settled);
      await provider.webhook(through, waitingPayment, 'succeeded', 'wh-waiting');
      await provider.webhook(through, waitingPayment, 'succeeded');
      await provider.webhook(through, waitingPayment, 'pending');
      // And the payment that landed before the change, said again, changes nothing.
      await provider.webhook(through, landedPayment, 'succeeded', 'wh-landed');
      const once = async (as: Client, token: string) => {
        expect((await as.balances(groupId, token)).of).toEqual(settled);
        const settlement = await as.read(`/settlements/${waiting}`, token);
        expect(settlement.status).toBe('paid');
        expect((settlement.history as Json[]).map(each => each.status)).toEqual(['pending', 'paid']);
        expect((await as.list(`/groups/${groupId}/settlements`, token)).map(each => each.id)).toEqual([
          waiting,
          landed,
          cash,
        ]);
        const paid = (await as.list(`/groups/${groupId}/audit`, token)).filter(
          each => each.action === 'settlement-paid',
        );
        expect(paid.map(each => each.subjectId)).toEqual([cash, landed, waiting]);
      };
      await once(through, tokens.ann);

      // Started again on the same file and database: nothing is moved twice, nothing counted twice.
      await kill(running);
      running = await start(moved.path, environment);
      through = client(running.port);
      const token = await through.login(ann.email);
      await provider.webhook(through, waitingPayment, 'succeeded');
      await once(through, token);
      expect((await through.list(`/groups/${groupId}/templates`, token)).map(each => each.id)).toEqual([template]);
      // An edit from the version read before the change is refused; from the one it is at, accepted.
      const edit = (version: number) =>
        through.act('PUT', `/expenses/${expenseId}`, token, {
          description: 'Groceries',
          amount: 600,
          date: day(0),
          category: 'groceries',
          splitBetween: [ann.id, bob.id, cy.id],
          version,
        });
      expect((await edit(1)).accepted).toBe(false);
      expect((await edit(2)).accepted).toBe(true);
      expect(await through.refused('POST', `/groups/${old}/invitations`, token)).toBe(true);
      await stop(running);

      // It is all in PostgreSQL: a server on another file finds it.
      running = await start(`${moved.path}-not-read`, { ...environment, DATABASE_URL: moved.url });
      through = client(running.port);
      const again = await through.login(bob.email);
      expect((await through.balances(groupId, again)).of).toEqual({ [ann.id]: 0, [bob.id]: 100, [cy.id]: -100 });
    } finally {
      await stop(running);
      moved.remove();
    }
  }, 180000);
});
