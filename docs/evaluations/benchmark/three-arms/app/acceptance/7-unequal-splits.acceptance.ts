import { client, Client, database, day, keepsTheSplit, pairs, reached, Running, start, stop } from './tally';

/** Request 7: splits by exact amounts and by shares, which add up; an expense says how it was split. */
const db = database('splits');
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
  const ann = await api.person(`ann@${tag}.splits.test`);
  const bob = await api.person(`bob@${tag}.splits.test`);
  const cy = await api.person(`cy@${tag}.splits.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

describe('unequal splits', () => {
  it('splits by exact amounts that add up, and refuses ones that do not', async () => {
    const { ann, bob, cy, groupId } = await flat('exact');
    const id = await api.expense(ann, groupId, {
      amount: 1000,
      splitExactly: [
        { memberId: bob.id, amount: 600 },
        { memberId: ann.id, amount: 400 },
      ],
    });
    const expense = await api.read(`/expenses/${id}`, cy.token);
    expect(expense).toMatchObject({ amount: 1000, paidBy: ann.id, splitKind: 'exact' });
    expect(pairs(expense.shares as never)).toEqual([
      [bob.id, 600],
      [ann.id, 400],
    ]);

    const refusedWith = (splitExactly: { memberId: string; amount: number }[]) =>
      api.refused('POST', `/groups/${groupId}/expenses`, ann.token, {
        description: 'Dinner',
        amount: 1000,
        date: day(0),
        splitExactly,
      });
    expect(
      await refusedWith([
        { memberId: bob.id, amount: 600 },
        { memberId: ann.id, amount: 300 },
      ]),
    ).toBe(true);
    expect(
      await refusedWith([
        { memberId: bob.id, amount: 600 },
        { memberId: ann.id, amount: 500 },
      ]),
    ).toBe(true);
    expect(
      await refusedWith([
        { memberId: bob.id, amount: 1100 },
        { memberId: ann.id, amount: -100 },
      ]),
    ).toBe(true);
    expect(
      await refusedWith([
        { memberId: bob.id, amount: 600 },
        { memberId: cy.id, amount: 400 },
      ]),
    ).toBe(true);
    expect(
      await refusedWith([
        { memberId: ann.id, amount: 500 },
        { memberId: ann.id, amount: 500 },
      ]),
    ).toBe(true);

    // The payer may take nothing, as long as they are in the split.
    const gift = await api.expense(ann, groupId, {
      amount: 1000,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: cy.id, amount: 1000 },
      ],
    });
    expect(pairs(await api.shares(gift, bob.token))).toEqual([
      [ann.id, 0],
      [cy.id, 1000],
    ]);
    expect(await api.balances(groupId, bob.token)).toMatchObject({
      of: { [ann.id]: 1600, [bob.id]: -600, [cy.id]: -1000 },
      sum: 0,
    });
  }, 60000);

  it('splits by shares, rounding down, the remainder whole to the payer', async () => {
    const { ann, bob, cy, groupId } = await flat('shares');
    // The payer listed first: the same shares whoever takes the remainder.
    const first = await api.expense(ann, groupId, {
      amount: 1001,
      splitByShares: [
        { memberId: ann.id, shares: 1 },
        { memberId: bob.id, shares: 2 },
      ],
    });
    const read = await api.read(`/expenses/${first}`, cy.token);
    expect(read.splitKind).toBe('shares');
    expect(pairs(read.shares as never)).toEqual([
      [ann.id, 334],
      [bob.id, 667],
    ]);
    const even = await api.expense(bob, groupId, {
      amount: 1200,
      splitByShares: [
        { memberId: cy.id, shares: 3 },
        { memberId: bob.id, shares: 1 },
        { memberId: ann.id, shares: 2 },
      ],
    });
    expect(pairs(await api.shares(even, ann.token))).toEqual([
      [cy.id, 600],
      [bob.id, 200],
      [ann.id, 400],
    ]);

    // The payer listed elsewhere: superseded from request 10 (the README), which keeps what keepsTheSplit holds.
    const cases: [number, { memberId: string; shares: number }[], (string | number)[][]][] = [
      [
        1001,
        [
          { memberId: bob.id, shares: 2 },
          { memberId: ann.id, shares: 1 },
        ],
        [
          [bob.id, 667],
          [ann.id, 334],
        ],
      ],
      [
        100,
        [
          { memberId: cy.id, shares: 1 },
          { memberId: bob.id, shares: 1 },
          { memberId: ann.id, shares: 1 },
        ],
        [
          [cy.id, 33],
          [bob.id, 33],
          [ann.id, 34],
        ],
      ],
    ];
    for (const [amount, splitByShares, expected] of cases) {
      const shares = await api.shares(await api.expense(ann, groupId, { amount, splitByShares }), bob.token);
      keepsTheSplit(
        shares,
        amount,
        splitByShares.map(each => each.memberId),
        splitByShares.map(each => each.shares),
      );
      if (!reached(10)) expect(pairs(shares)).toEqual(expected);
    }
    expect((await api.balances(groupId, cy.token)).sum).toBe(0);
  }, 60000);

  it('refuses shares that are not allowed, and a payer outside the split, whatever its kind', async () => {
    const { ann, bob, cy, groupId } = await flat('refused');
    const out = await api.person('out@refused.splits.test');
    const post = (body: Record<string, unknown>) =>
      api.refused('POST', `/groups/${groupId}/expenses`, ann.token, {
        description: 'Cottage',
        amount: 900,
        date: day(0),
        ...body,
      });
    expect(
      await post({
        splitByShares: [
          { memberId: ann.id, shares: 0 },
          { memberId: bob.id, shares: 2 },
        ],
      }),
    ).toBe(true);
    expect(
      await post({
        splitByShares: [
          { memberId: ann.id, shares: -1 },
          { memberId: bob.id, shares: 2 },
        ],
      }),
    ).toBe(true);
    expect(
      await post({
        splitByShares: [
          { memberId: bob.id, shares: 1 },
          { memberId: cy.id, shares: 2 },
        ],
      }),
    ).toBe(true);
    expect(
      await post({
        splitByShares: [
          { memberId: ann.id, shares: 1 },
          { memberId: out.id, shares: 2 },
        ],
      }),
    ).toBe(true);
    expect(await post({ splitExactly: [{ memberId: bob.id, amount: 900 }] })).toBe(true);
    expect(await api.list(`/groups/${groupId}/balances`, ann.token)).toEqual([
      { memberId: ann.id, balance: 0 },
      { memberId: bob.id, balance: 0 },
      { memberId: cy.id, balance: 0 },
    ]);
  }, 60000);

  it('says how each expense was split, edits one from a kind to another, and counts every kind in the balances', async () => {
    const { ann, bob, cy, groupId } = await flat('kinds');
    const equal = await api.expense(bob, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
    expect((await api.read(`/expenses/${equal}`, ann.token)).splitKind).toBe('equal');

    await api.done('PUT', `/expenses/${equal}`, bob.token, {
      description: 'Groceries',
      amount: 900,
      date: day(0),
      splitExactly: [
        { memberId: cy.id, amount: 500 },
        { memberId: bob.id, amount: 400 },
      ],
      version: 1,
    });
    const exact = await api.read(`/expenses/${equal}`, ann.token);
    expect(exact).toMatchObject({ splitKind: 'exact', version: 2 });
    expect(pairs(exact.shares as never)).toEqual([
      [cy.id, 500],
      [bob.id, 400],
    ]);

    await api.done('PUT', `/expenses/${equal}`, ann.token, {
      description: 'Groceries',
      amount: 900,
      date: day(0),
      splitByShares: [
        { memberId: bob.id, shares: 1 },
        { memberId: ann.id, shares: 2 },
      ],
      version: 2,
    });
    const byShares = await api.read(`/expenses/${equal}`, cy.token);
    expect(byShares).toMatchObject({ splitKind: 'shares', version: 3, paidBy: bob.id });
    expect(pairs(byShares.shares as never)).toEqual([
      [bob.id, 300],
      [ann.id, 600],
    ]);
    expect(await api.balances(groupId, cy.token)).toMatchObject({
      of: { [ann.id]: -600, [bob.id]: 600, [cy.id]: 0 },
      sum: 0,
    });
  }, 60000);

  it('refuses a body with none or more than one of the three splits, or a split of the wrong shape, at once with 400', async () => {
    const { ann, bob, groupId } = await flat('shape');
    const base = { description: 'Dinner', amount: 1000, date: day(0) };
    const bodies: unknown[] = [
      base,
      { ...base, splitBetween: [ann.id, bob.id], splitExactly: [{ memberId: ann.id, amount: 1000 }] },
      { ...base, splitBetween: [ann.id], splitByShares: [{ memberId: ann.id, shares: 1 }] },
      { ...base, splitExactly: 'all' },
      { ...base, splitExactly: [{ memberId: ann.id }] },
      { ...base, splitByShares: [{ memberId: ann.id, shares: '1' }] },
      { ...base, splitByShares: [{ shares: 1 }] },
    ];
    const answered: string[] = [];
    for (const body of bodies)
      answered.push(
        `${JSON.stringify(body)}: ${(await api.call('POST', `/groups/${groupId}/expenses`, ann.token, body)).status}`,
      );
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
  }, 60000);
});
