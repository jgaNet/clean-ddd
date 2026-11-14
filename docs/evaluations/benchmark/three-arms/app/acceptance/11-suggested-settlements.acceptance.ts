import { client, Client, database, Person, Running, start, stop } from './tally';

/** Request 11: the transfers that would bring every balance to 0, by the stated algorithm, in the order made. */
const db = database('suggested');
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

type Transfer = [string, string, number];

/** The request's algorithm, as the test reads it: the most owing pays the most owed, ties to the earlier member. */
function algorithm(balances: [string, number][]): Transfer[] {
  const left = balances.map(([member, balance]) => ({ member, balance }));
  const transfers: Transfer[] = [];
  for (;;) {
    const debtor = left.reduce<(typeof left)[number] | undefined>(
      (most, each) => (each.balance < 0 && (!most || each.balance < most.balance) ? each : most),
      undefined,
    );
    const creditor = left.reduce<(typeof left)[number] | undefined>(
      (most, each) => (each.balance > 0 && (!most || each.balance > most.balance) ? each : most),
      undefined,
    );
    if (!debtor || !creditor) return transfers;
    const amount = Math.min(-debtor.balance, creditor.balance);
    transfers.push([debtor.member, creditor.member, amount]);
    debtor.balance += amount;
    creditor.balance -= amount;
  }
}

const suggested = async (groupId: string, token: string) =>
  (await api.list(`/groups/${groupId}/settlements/suggested`, token)).map(
    each => [each.from, each.to, each.amount] as Transfer,
  );

/** Four people in a group, joined in that order: Ann owns it. */
async function four(tag: string) {
  const people: Person[] = [];
  for (const name of ['ann', 'bob', 'cy', 'dan']) people.push(await api.person(`${name}@${tag}.suggested.test`));
  const [ann, bob, cy, dan] = people;
  const groupId = await api.groupOf(ann, [bob, cy, dan]);
  return { ann, bob, cy, dan, people, groupId };
}

describe('suggested settlements', () => {
  it('suggests the transfers of the stated algorithm, in the order made, ties to whoever joined first', async () => {
    // The request's example: Ann 500, Bob 100, Cy -300, Dan -300.
    const { ann, bob, cy, dan, groupId } = await four('example');
    await api.expense(ann, groupId, {
      amount: 600,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: cy.id, amount: 300 },
        { memberId: dan.id, amount: 300 },
      ],
    });
    await api.expense(bob, groupId, {
      amount: 100,
      splitExactly: [
        { memberId: bob.id, amount: 0 },
        { memberId: ann.id, amount: 100 },
      ],
    });
    expect((await api.balances(groupId, cy.token)).of).toEqual({
      [ann.id]: 500,
      [bob.id]: 100,
      [cy.id]: -300,
      [dan.id]: -300,
    });
    const expected: Transfer[] = [
      [cy.id, ann.id, 300],
      [dan.id, ann.id, 200],
      [dan.id, bob.id, 100],
    ];
    expect(await suggested(groupId, dan.token)).toEqual(expected);
    expect(await suggested(groupId, ann.token)).toEqual(expected);
    const rows = await api.list(`/groups/${groupId}/settlements/suggested`, bob.token);
    expect(rows[0]).toEqual({ from: cy.id, to: ann.id, amount: 300 });

    // Ties among the owed, too: the one who joined first is paid first.
    const other = await four('ties');
    await api.expense(other.dan, other.groupId, {
      amount: 600,
      splitExactly: [
        { memberId: other.dan.id, amount: 0 },
        { memberId: other.bob.id, amount: 300 },
        { memberId: other.ann.id, amount: 300 },
      ],
    });
    await api.expense(other.cy, other.groupId, {
      amount: 600,
      splitExactly: [
        { memberId: other.cy.id, amount: 0 },
        { memberId: other.ann.id, amount: 300 },
        { memberId: other.bob.id, amount: 300 },
      ],
    });
    // Ann -600, Bob -600, Cy 600, Dan 600.
    expect(await suggested(other.groupId, other.cy.token)).toEqual([
      [other.ann.id, other.cy.id, 600],
      [other.bob.id, other.dan.id, 600],
    ]);
  }, 60000);

  it('makes the transfers that bring every balance to zero, never more than one fewer than the members not even', async () => {
    const people: Person[] = [];
    for (const name of ['ann', 'bob', 'cy', 'dan', 'eve', 'fay'])
      people.push(await api.person(`${name}@many.suggested.test`));
    const [ann, ...others] = people;
    const groupId = await api.groupOf(ann, others);
    const plan: [number, number, number[]][] = [
      [0, 1234, [0, 1, 2]],
      [3, 999, [3, 4, 5, 1]],
      [5, 50, [2, 5]],
      [1, 7777, [1, 3, 4]],
      [4, 101, [4, 0, 5, 2, 3]],
    ];
    for (const [payer, amount, members] of plan) {
      await api.expense(people[payer], groupId, { amount, splitBetween: members.map(each => people[each].id) });
      const balances = await api.balances(groupId, ann.token);
      const transfers = await suggested(groupId, people[payer].token);
      expect(transfers).toEqual(algorithm(balances.order.map(member => [member, balances.of[member]])));
      const after = { ...balances.of };
      for (const [from, to, each] of transfers) {
        expect(each).toBeGreaterThan(0);
        after[from] += each;
        after[to] -= each;
      }
      expect(Object.values(after).every(each => each === 0)).toBe(true);
      const notEven = Object.values(balances.of).filter(each => each !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, notEven - 1));
    }
  }, 60000);

  it('suggests nothing when every balance is zero, and changes nothing by being read', async () => {
    const { ann, bob, cy, groupId } = await four('nothing');
    expect(await suggested(groupId, ann.token)).toEqual([]);
    await api.expense(bob, groupId, { amount: 900, splitBetween: [bob.id, cy.id, ann.id] });
    const before = await api.balances(groupId, ann.token);
    const first = await suggested(groupId, cy.token);
    // Ann and Cy owe the same: Ann, who joined first, pays first.
    expect(first).toEqual([
      [ann.id, bob.id, 300],
      [cy.id, bob.id, 300],
    ]);
    expect(await suggested(groupId, cy.token)).toEqual(first);
    expect(await api.balances(groupId, ann.token)).toEqual(before);
  }, 60000);

  it('reads the suggestion to the members only', async () => {
    const { ann, groupId } = await four('members');
    const out = await api.person('out@members.suggested.test');
    expect(await api.hidden(`/groups/${groupId}/settlements/suggested`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/settlements/suggested`)).toBe(401);
    expect(await api.hidden('/groups/no-such-group/settlements/suggested', ann.token)).toBe(404);
  }, 60000);
});
