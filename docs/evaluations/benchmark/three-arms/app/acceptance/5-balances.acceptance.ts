import { client, Client, database, day, Person, Running, sleep, start, stop } from './tally';

/** Request 5: every member's balance, in the order they joined; the zero sum, whatever happens at once. */
const db = database('balances');
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

/** What each expense's shares, as read, make of the balances: paid minus shares, for every member. */
async function fromExpenses(ids: string[], token: string) {
  const balance: Record<string, number> = {};
  for (const id of ids) {
    const expense = await api.read(`/expenses/${id}`, token);
    const paidBy = String(expense.paidBy);
    balance[paidBy] = (balance[paidBy] ?? 0) + Number(expense.amount);
    for (const share of expense.shares as { memberId: string; amount: number }[])
      balance[share.memberId] = (balance[share.memberId] ?? 0) - share.amount;
  }
  return balance;
}

describe("a group's balances", () => {
  it('gives each member what they paid minus their shares, in the order they joined, adding up to zero', async () => {
    const ann = await api.person('ann@balances.test');
    const bob = await api.person('bob@balances.test');
    const cy = await api.person('cy@balances.test');
    const dan = await api.person('dan@balances.test');
    const groupId = await api.group(ann);
    const invitation = await api.invite(ann, groupId);
    await sleep(1100);
    await api.join(bob, invitation);
    await sleep(1100);
    await api.join(cy, invitation);

    expect(await api.balances(groupId, ann.token)).toEqual({
      order: [ann.id, bob.id, cy.id],
      of: { [ann.id]: 0, [bob.id]: 0, [cy.id]: 0 },
      sum: 0,
    });
    await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
    expect(await api.balances(groupId, bob.token)).toMatchObject({
      of: { [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 },
      sum: 0,
    });
    await api.expense(bob, groupId, { amount: 300, splitBetween: [cy.id, bob.id] });
    expect(await api.balances(groupId, cy.token)).toMatchObject({
      of: { [ann.id]: 600, [bob.id]: -150, [cy.id]: -450 },
      sum: 0,
    });

    await sleep(1100);
    await api.join(dan, invitation);
    const now = await api.balances(groupId, dan.token);
    expect(now.order).toEqual([ann.id, bob.id, cy.id, dan.id]);
    expect(now.of[dan.id]).toBe(0);
    expect(now.sum).toBe(0);
    const rows = await api.list(`/groups/${groupId}/balances`, ann.token);
    expect(rows.map(each => [each.memberId, each.balance])).toEqual([
      [ann.id, 600],
      [bob.id, -150],
      [cy.id, -450],
      [dan.id, 0],
    ]);
  }, 60000);

  it('keeps the zero sum after every expense, whatever the remainders', async () => {
    const people: Person[] = [];
    for (const name of ['ann', 'bob', 'cy', 'dan']) people.push(await api.person(`${name}2@balances.test`));
    const [ann, bob, cy, dan] = people;
    const groupId = await api.groupOf(ann, [bob, cy, dan]);
    const plan: [Person, number, Person[]][] = [
      [ann, 1001, [ann, bob, cy]],
      [bob, 7, [cy, dan, bob]],
      [cy, 99_999, [dan, cy, ann, bob]],
      [dan, 1, [ann, dan]],
      [ann, 333, [bob, cy, dan, ann]],
      [bob, 50_000, [bob]],
    ];
    const ids: string[] = [];
    for (const [payer, amount, members] of plan) {
      ids.push(
        await api.expense(payer, groupId, {
          amount,
          date: day(-ids.length),
          splitBetween: members.map(each => each.id),
        }),
      );
      const balances = await api.balances(groupId, payer.token);
      expect(balances.sum).toBe(0);
      const expected = await fromExpenses(ids, payer.token);
      for (const person of people) expect(balances.of[person.id]).toBe(expected[person.id] ?? 0);
    }
  }, 60000);

  it('reads the balances to the members only', async () => {
    const ann = await api.person('ann3@balances.test');
    const out = await api.person('out3@balances.test');
    const groupId = await api.group(ann);
    expect(await api.hidden(`/groups/${groupId}/balances`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/balances`)).toBe(401);
    expect(await api.hidden('/groups/no-such-group/balances', ann.token)).toBe(404);
  }, 60000);

  it('counts once each of twenty expenses sent at once to two servers on one database, and keeps the zero sum', async () => {
    const people: Person[] = [];
    for (const name of ['ann', 'bob', 'cy', 'dan']) people.push(await api.person(`${name}4@balances.test`));
    const [ann, bob, cy, dan] = people;
    const groupId = await api.groupOf(ann, [bob, cy, dan]);
    const second = await start(db.path);
    try {
      const other = client(second.port);
      const tokens = new Map<string, string>();
      for (const person of people) tokens.set(person.id, await other.login(person.email));
      // Each expense split between all four, a multiple of 4: no remainder, so the balances are known exactly.
      const sent = Array.from({ length: 20 }, (_, n) => ({
        payer: people[n % 4],
        amount: 400 * (n + 1),
        through: n % 2 === 0 ? api : other,
      }));
      const outcomes = await Promise.all(
        sent.map(each =>
          each.through.act(
            'POST',
            `/groups/${groupId}/expenses`,
            each.through === api ? each.payer.token : tokens.get(each.payer.id),
            { description: 'At once', amount: each.amount, date: day(0), splitBetween: people.map(p => p.id) },
          ),
        ),
      );
      expect(outcomes.filter(outcome => !outcome.accepted)).toEqual([]);

      const expected: Record<string, number> = { [ann.id]: 0, [bob.id]: 0, [cy.id]: 0, [dan.id]: 0 };
      for (const each of sent) {
        expected[each.payer.id] += each.amount;
        for (const person of people) expected[person.id] -= each.amount / 4;
      }
      for (const [through, token] of [
        [api, ann.token],
        [other, tokens.get(dan.id)],
      ] as const) {
        const balances = await through.balances(groupId, String(token));
        expect(balances.of).toEqual(expected);
        expect(balances.sum).toBe(0);
      }
    } finally {
      await stop(second);
    }
  }, 180000);
});
