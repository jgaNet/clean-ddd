import {
  client,
  Client,
  database,
  day,
  Json,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 29: settlements in a member's statement, and the statement as CSV. */
const db = database('csv');
let provider: PaymentProvider;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  server = await start(db.path, await provider.environment());
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const HEADER = 'date,kind,id,description,paid,share,balance';

/** Three people in a group Ann owns and is paid in: Ann, Bob and Cy, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.csv.test`);
  const bob = await api.person(`bob@${tag}.csv.test`);
  const cy = await api.person(`cy@${tag}.csv.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  await payable(api, ann, provider);
  return { ann, bob, cy, groupId };
}

const statementOf = (groupId: string, member: Person, token: string) =>
  api.read(`/groups/${groupId}/members/${member.id}/statement`, token);

/** A statement's entries as `[kind, id, date, description, paid, share, balance]`. */
const rows = (statement: Json) =>
  (statement.entries as Json[]).map(each => [
    each.kind,
    each.kind === 'settlement' ? each.settlementId : each.expenseId,
    each.date,
    each.description,
    each.paid,
    each.share,
    each.balance,
  ]);

/** A provider's settlement the provider says succeeded. */
async function paid(payer: Person, groupId: string, payee: Person, amount: number) {
  const id = await api.payThrough(payer, groupId, payee, amount);
  await provider.webhook(api, provider.paymentFor(id).id, 'succeeded');
  return id;
}

describe('a statement as CSV', () => {
  it('lists the settlements a member paid or received that the balances count, beside their expenses', async () => {
    const { ann, bob, cy, groupId } = await flat('listed');
    const groceries = await api.expense(ann, groupId, {
      description: 'Groceries',
      amount: 900,
      date: day(-3),
      splitBetween: [ann.id, bob.id, cy.id],
    });
    const taxi = await api.expense(bob, groupId, {
      description: 'Taxi',
      amount: 400,
      date: day(-1),
      splitBetween: [bob.id, cy.id],
    });
    // Ann 600, Bob -100, Cy -500.
    const cash = await api.cash(ann, groupId, bob, 100);
    const card = await paid(cy, groupId, ann, 200);
    await api.payThrough(cy, groupId, ann, 50);
    const failed = await api.payThrough(cy, groupId, ann, 30);
    await provider.webhook(api, provider.paymentFor(failed).id, 'failed');
    const refunded = await paid(cy, groupId, ann, 40);
    await api.done('POST', `/settlements/${refunded}/refund`, ann.token);

    expect(rows(await statementOf(groupId, bob, cy.token))).toEqual([
      ['expense', groceries, day(-3), 'Groceries', 0, 300, -300],
      ['expense', taxi, day(-1), 'Taxi', 400, 200, -100],
      ['settlement', cash, day(0), 'Settlement in cash', 100, 0, 0],
    ]);
    // Refunding, a settlement is still counted.
    expect(rows(await statementOf(groupId, ann, bob.token))).toEqual([
      ['expense', groceries, day(-3), 'Groceries', 900, 300, 600],
      ['settlement', cash, day(0), 'Settlement in cash', 0, 100, 500],
      ['settlement', card, day(0), 'Settlement through the provider', 0, 200, 300],
      ['settlement', refunded, day(0), 'Settlement through the provider', 0, 40, 260],
    ]);
    // Refunded, it is no longer.
    await provider.webhook(api, provider.paymentFor(refunded).id, 'refunded');
    expect(rows(await statementOf(groupId, cy, ann.token))).toEqual([
      ['expense', groceries, day(-3), 'Groceries', 0, 300, -300],
      ['expense', taxi, day(-1), 'Taxi', 0, 200, -500],
      ['settlement', card, day(0), 'Settlement through the provider', 200, 0, -300],
    ]);
    const balances = await api.balances(groupId, ann.token);
    for (const member of [ann, bob, cy]) {
      const statement = await statementOf(groupId, member, cy.token);
      expect(statement.balance).toBe(balances.of[member.id]);
      expect(statement).toEqual({ memberId: member.id, balance: statement.balance, entries: statement.entries });
    }
  }, 60000);

  it('exports a statement as CSV, its columns in the stated order, quoted only where they must be', async () => {
    const { ann, bob, cy, groupId } = await flat('exported');
    await api.expense(ann, groupId, {
      description: 'Wine, "the good one"',
      amount: 600,
      date: day(-2),
      splitBetween: [ann.id, bob.id],
    });
    await api.expense(bob, groupId, {
      description: 'Bread',
      amount: 100,
      date: day(-1),
      splitBetween: [bob.id, ann.id],
    });
    await api.cash(ann, groupId, bob, 150);
    const statement = await statementOf(groupId, bob, ann.token);
    expect(statement.entries).toHaveLength(3);
    const field = (value: unknown) =>
      /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
    const expected = [
      HEADER,
      ...rows(statement).map(([kind, id, date, ...rest]) => [date, kind, id, ...rest].map(field).join(',')),
    ];

    const csv = await api.raw(`/groups/${groupId}/members/${bob.id}/statement.csv`, cy.token);
    expect(csv.status).toBe(200);
    expect(csv.type).toMatch(/^text\/csv/);
    expect(csv.text).toBe(expected.map(line => `${line}\r\n`).join(''));
    expect(csv.text.split('\r\n')[1]).toContain(',"Wine, ""the good one""",0,300,-300');
    // A member with no entry: the header alone.
    expect((await api.raw(`/groups/${groupId}/members/${cy.id}/statement.csv`, bob.token)).text).toBe(`${HEADER}\r\n`);
  }, 60000);

  it('orders the entries of a day by when each was recorded, or started to count', async () => {
    const { ann, bob, groupId } = await flat('ordered');
    const lunch = await api.expense(ann, groupId, {
      description: 'Lunch',
      amount: 600,
      splitBetween: [ann.id, bob.id],
    });
    await sleep(1100);
    const cash = await api.cash(ann, groupId, bob, 100);
    await sleep(1100);
    const dinner = await api.expense(bob, groupId, {
      description: 'Dinner',
      amount: 200,
      splitBetween: [bob.id, ann.id],
    });
    const earlier = await api.expense(ann, groupId, {
      description: 'Yesterday',
      amount: 100,
      date: day(-1),
      splitBetween: [ann.id, bob.id],
    });
    expect(rows(await statementOf(groupId, bob, ann.token))).toEqual([
      ['expense', earlier, day(-1), 'Yesterday', 0, 50, -50],
      ['expense', lunch, day(0), 'Lunch', 0, 300, -350],
      ['settlement', cash, day(0), 'Settlement in cash', 100, 0, -250],
      ['expense', dinner, day(0), 'Dinner', 200, 100, -150],
    ]);
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-150);
    const csv = await api.raw(`/groups/${groupId}/members/${bob.id}/statement.csv`, ann.token);
    expect(
      csv.text
        .split('\r\n')
        .slice(1, 5)
        .map(line => line.split(',')[2]),
    ).toEqual([earlier, lunch, cash, dinner]);
  }, 60000);

  it("exports a statement to the group's members only, a former member's included", async () => {
    const { ann, bob, cy, groupId } = await flat('who');
    const out = await api.person('out@who.csv.test');
    await api.expense(bob, groupId, { amount: 300, splitBetween: [bob.id, cy.id] });
    const path = (member: Person) => `/groups/${groupId}/members/${member.id}/statement.csv`;
    expect((await api.raw(path(bob), out.token)).status).toBe(404);
    expect((await api.raw(path(bob))).status).toBe(401);
    expect((await api.raw(path(out), ann.token)).status).toBe(404);
    const before = await api.raw(path(bob), cy.token);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect(await api.raw(path(bob), ann.token)).toEqual(before);
    expect((await api.raw(path(bob), bob.token)).status).toBe(404);
  }, 60000);
});
