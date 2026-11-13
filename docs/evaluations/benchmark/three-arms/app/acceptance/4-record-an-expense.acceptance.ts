import { client, Client, database, day, keepsTheSplit, pairs, reached, Running, start, stop } from './tally';

/** Request 4: an expense split equally, the remainder to the payer; the split adds up. */
const db = database('expenses');
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
  const ann = await api.person(`ann@${tag}.expenses.test`);
  const bob = await api.person(`bob@${tag}.expenses.test`);
  const cy = await api.person(`cy@${tag}.expenses.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

describe('record an expense', () => {
  it('records an expense split equally, its shares in the order given, read whole by the members only', async () => {
    const { ann, bob, cy, groupId } = await flat('read');
    const out = await api.person('out@read.expenses.test');
    const id = await api.expense(ann, groupId, {
      description: 'Groceries',
      amount: 900,
      date: day(-2),
      splitBetween: [cy.id, ann.id, bob.id],
    });

    const expense = await api.read(`/expenses/${id}`, bob.token);
    expect(expense).toMatchObject({
      id,
      groupId,
      description: 'Groceries',
      amount: 900,
      date: day(-2),
      paidBy: ann.id,
    });
    expect(pairs(expense.shares as never)).toEqual([
      [cy.id, 300],
      [ann.id, 300],
      [bob.id, 300],
    ]);
    expect(await api.hidden(`/expenses/${id}`, out.token)).toBe(404);
    expect(await api.hidden(`/expenses/${id}`)).toBe(401);
    expect(await api.hidden('/expenses/no-such-expense', ann.token)).toBe(404);
  }, 60000);

  it('gives the remainder of an equal split whole to the payer, and the shares add up to the amount', async () => {
    const { ann, bob, cy, groupId } = await flat('remainder');
    // The payer listed first: the same shares whoever takes the remainder.
    const first = await api.expense(bob, groupId, { amount: 1000, splitBetween: [bob.id, ann.id, cy.id] });
    expect(pairs(await api.shares(first, ann.token))).toEqual([
      [bob.id, 334],
      [ann.id, 333],
      [cy.id, 333],
    ]);

    // The payer listed elsewhere. Request 10 gives the remainder to the member listed first from then on: graded
    // from request 10, this case holds what request 10 keeps of it (the README's superseded cases).
    const cases: [number, string[], (string | number)[][]][] = [
      [
        1000,
        [ann.id, bob.id, cy.id],
        [
          [ann.id, 333],
          [bob.id, 334],
          [cy.id, 333],
        ],
      ],
      [
        100,
        [cy.id, ann.id, bob.id],
        [
          [cy.id, 33],
          [ann.id, 33],
          [bob.id, 34],
        ],
      ],
      [
        1,
        [ann.id, bob.id],
        [
          [ann.id, 0],
          [bob.id, 1],
        ],
      ],
      [
        7,
        [cy.id, bob.id],
        [
          [cy.id, 3],
          [bob.id, 4],
        ],
      ],
    ];
    for (const [amount, members, expected] of cases) {
      const shares = await api.shares(await api.expense(bob, groupId, { amount, splitBetween: members }), cy.token);
      keepsTheSplit(shares, amount, members);
      if (!reached(10)) expect(pairs(shares)).toEqual(expected);
    }
  }, 60000);

  it('refuses an expense whose values or split are not allowed', async () => {
    const { ann, bob, cy, groupId } = await flat('values');
    const out = await api.person('out@values.expenses.test');
    const valid = { description: 'Dinner', amount: 3000, date: day(-1), splitBetween: [ann.id, bob.id, cy.id] };
    const refusedWith = (change: Record<string, unknown>) =>
      api.refused('POST', `/groups/${groupId}/expenses`, ann.token, { ...valid, ...change });

    expect(await refusedWith({ description: '   ' })).toBe(true);
    expect(await refusedWith({ description: '' })).toBe(true);
    expect(await refusedWith({ description: 'x'.repeat(101) })).toBe(true);
    expect(await refusedWith({ amount: 0 })).toBe(true);
    expect(await refusedWith({ amount: -500 })).toBe(true);
    expect(await refusedWith({ amount: 100_000_001 })).toBe(true);
    expect(await refusedWith({ date: day(1) })).toBe(true);
    expect(await refusedWith({ date: '2026-02-30' })).toBe(true);
    expect(await refusedWith({ date: 'yesterday' })).toBe(true);
    expect(await refusedWith({ splitBetween: [ann.id, out.id] })).toBe(true);
    expect(await refusedWith({ splitBetween: [ann.id, bob.id, ann.id] })).toBe(true);
    expect(await refusedWith({ splitBetween: [bob.id, cy.id] })).toBe(true);
    expect(await refusedWith({ splitBetween: [] })).toBe(true);
    expect(await api.list(`/groups/${groupId}/members`, ann.token)).toHaveLength(3);

    const id = await api.expense(ann, groupId, {
      ...valid,
      description: 'x'.repeat(100),
      amount: 100_000_000,
      date: day(0),
    });
    expect(await api.read(`/expenses/${id}`, cy.token)).toMatchObject({ amount: 100_000_000, date: day(0) });
  }, 60000);

  it('refuses an expense to anyone who is not a member', async () => {
    const { ann, groupId } = await flat('outsider');
    const out = await api.person('out@outsider.expenses.test');
    const body = { description: 'Taxi', amount: 1200, date: day(0), splitBetween: [out.id] };
    expect(await api.refused('POST', `/groups/${groupId}/expenses`, out.token, body)).toBe(true);
    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, out.token, { ...body, splitBetween: [out.id, ann.id] }),
    ).toBe(true);
    expect((await api.call('POST', `/groups/${groupId}/expenses`, undefined, body)).status).toBe(401);
  }, 60000);

  it('refuses an expense of the wrong shape at once with 400', async () => {
    const { ann, bob, groupId } = await flat('shape');
    const valid = { description: 'Dinner', amount: 3000, date: day(-1), splitBetween: [ann.id, bob.id] };
    const bodies: unknown[] = [
      { ...valid, amount: '3000' },
      { ...valid, description: undefined },
      { ...valid, date: undefined },
      { ...valid, splitBetween: undefined },
      { ...valid, splitBetween: ann.id },
      { ...valid, splitBetween: [42] },
    ];
    const answered: string[] = [];
    for (const body of bodies)
      answered.push(
        `${JSON.stringify(body)}: ${(await api.call('POST', `/groups/${groupId}/expenses`, ann.token, body)).status}`,
      );
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
  }, 60000);
});
