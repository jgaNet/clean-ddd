import { client, Client, database, day, Json, Running, sleep, start, stop } from './tally';

/** Request 8: the group's expenses, the latest first, and a member's statement, the earliest first. */
const db = database('history');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

/** Three people in a group: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.history.test`);
  const bob = await api.person(`bob@${tag}.history.test`);
  const cy = await api.person(`cy@${tag}.history.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

const entries = (statement: Json) =>
  (statement.entries as Json[]).map(each => [each.expenseId, each.date, each.paid, each.share, each.balance]);

describe("a group's expenses and a member's statement", () => {
  it("lists the group's expenses, the latest date first, then the most recently recorded first", async () => {
    const { ann, bob, cy, groupId } = await flat('list');
    const all = [ann.id, bob.id, cy.id];
    const oldest = await api.expense(ann, groupId, {
      description: 'Oldest',
      amount: 300,
      date: day(-5),
      splitBetween: all,
    });
    const latest = await api.expense(bob, groupId, {
      description: 'Latest',
      amount: 600,
      date: day(-1),
      splitBetween: all,
    });
    const middle = await api.expense(cy, groupId, {
      description: 'Middle',
      amount: 900,
      date: day(-3),
      splitBetween: all,
    });
    const earlier = await api.expense(ann, groupId, {
      description: 'Same day, earlier',
      amount: 30,
      date: day(-2),
      splitBetween: all,
    });
    await sleep(1100);
    const later = await api.expense(bob, groupId, {
      description: 'Same day, later',
      amount: 60,
      date: day(-2),
      splitBetween: all,
    });
    const gone = await api.expense(cy, groupId, {
      description: 'Deleted',
      amount: 90,
      date: day(-4),
      splitBetween: all,
    });
    await sleep(1100);
    // An edit does not change when an expense was recorded.
    await api.done('PUT', `/expenses/${earlier}`, ann.token, {
      description: 'Same day, earlier, edited',
      amount: 33,
      date: day(-2),
      splitBetween: all,
      version: 1,
    });
    await api.done('DELETE', `/expenses/${gone}`, cy.token);

    const listed = await api.list(`/groups/${groupId}/expenses`, cy.token);
    expect(listed.map(each => each.id)).toEqual([latest, later, earlier, middle, oldest]);
    for (const each of listed) expect(each).toEqual(await api.read(`/expenses/${String(each.id)}`, ann.token));
    expect(listed[2]).toMatchObject({ description: 'Same day, earlier, edited', amount: 33, version: 2 });
  }, 60000);

  it("gives a member's statement, the earliest first, with their balance after each entry", async () => {
    const { ann, bob, cy, groupId } = await flat('statement');
    const second = await api.expense(ann, groupId, {
      description: 'Rent',
      amount: 900,
      date: day(-3),
      splitBetween: [ann.id, bob.id, cy.id],
    });
    const first = await api.expense(bob, groupId, {
      description: 'Taxi',
      amount: 400,
      date: day(-6),
      splitBetween: [bob.id, cy.id],
    });
    const third = await api.expense(cy, groupId, {
      description: 'Wine',
      amount: 1000,
      date: day(-1),
      splitExactly: [
        { memberId: cy.id, amount: 0 },
        { memberId: bob.id, amount: 1000 },
      ],
    });
    await sleep(1100);
    const fourth = await api.expense(cy, groupId, {
      description: 'Bread',
      amount: 300,
      date: day(-1),
      splitBetween: [cy.id, ann.id],
    });
    const notBobs = await api.expense(ann, groupId, {
      description: 'Not Bob',
      amount: 200,
      date: day(-2),
      splitBetween: [ann.id, cy.id],
    });

    const bobs = await api.read(`/groups/${groupId}/members/${bob.id}/statement`, ann.token);
    expect(bobs.memberId).toBe(bob.id);
    expect(entries(bobs)).toEqual([
      [first, day(-6), 400, 200, 200],
      [second, day(-3), 0, 300, -100],
      [third, day(-1), 0, 1000, -1100],
    ]);
    expect((bobs.entries as Json[]).map(each => each.description)).toEqual(['Taxi', 'Rent', 'Wine']);
    expect(bobs.balance).toBe(-1100);

    const cys = await api.read(`/groups/${groupId}/members/${cy.id}/statement`, cy.token);
    expect(entries(cys)).toEqual([
      [first, day(-6), 0, 200, -200],
      [second, day(-3), 0, 300, -500],
      [notBobs, day(-2), 0, 100, -600],
      [third, day(-1), 1000, 0, 400],
      [fourth, day(-1), 300, 150, 550],
    ]);
    expect(cys.balance).toBe(550);
    const balances = await api.balances(groupId, bob.token);
    for (const member of [ann, bob, cy]) {
      const statement = await api.read(`/groups/${groupId}/members/${member.id}/statement`, bob.token);
      const rows = statement.entries as Json[];
      expect(statement.balance).toBe(balances.of[member.id]);
      expect(statement.balance).toBe(rows.length ? rows[rows.length - 1].balance : 0);
    }
  }, 60000);

  it('gives a member with no expense an empty statement, and leaves out what was deleted', async () => {
    const { ann, bob, cy, groupId } = await flat('empty');
    expect(await api.read(`/groups/${groupId}/members/${cy.id}/statement`, ann.token)).toEqual({
      memberId: cy.id,
      balance: 0,
      entries: [],
    });
    const id = await api.expense(bob, groupId, { amount: 500, splitBetween: [bob.id, cy.id] });
    expect((await api.read(`/groups/${groupId}/members/${cy.id}/statement`, cy.token)).balance).toBe(-250);
    await api.done('DELETE', `/expenses/${id}`, bob.token);
    expect(await api.read(`/groups/${groupId}/members/${cy.id}/statement`, ann.token)).toEqual({
      memberId: cy.id,
      balance: 0,
      entries: [],
    });
    expect(await api.list(`/groups/${groupId}/expenses`, ann.token)).toEqual([]);
  }, 60000);

  it('lets the members only read the expenses and the statements', async () => {
    const { ann, groupId } = await flat('who');
    const out = await api.person('out@who.history.test');
    expect(await api.hidden(`/groups/${groupId}/expenses`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/expenses`)).toBe(401);
    expect(await api.hidden(`/groups/${groupId}/members/${ann.id}/statement`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/members/${ann.id}/statement`)).toBe(401);
    expect(await api.hidden(`/groups/${groupId}/members/${out.id}/statement`, ann.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/members/no-such-member/statement`, ann.token)).toBe(404);
  }, 60000);
});
