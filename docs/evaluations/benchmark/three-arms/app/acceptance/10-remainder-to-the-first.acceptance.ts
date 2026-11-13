import { client, Client, database, day, kill, keepsTheSplit, pairs, previous, Running, start, stop } from './tally';

/** Request 10: from now on, the remainder goes whole to the member listed first in the split, whoever paid. */
const db = database('remainder');
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
  const ann = await api.person(`ann@${tag}.remainder.test`);
  const bob = await api.person(`bob@${tag}.remainder.test`);
  const cy = await api.person(`cy@${tag}.remainder.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

describe('the remainder goes to the first member of the split', () => {
  it('gives the remainder of an equal split whole to the member listed first, whoever paid', async () => {
    const { ann, bob, cy, groupId } = await flat('equal');
    const cases: [number, string[], (string | number)[][]][] = [
      [
        1000,
        [ann.id, bob.id, cy.id],
        [
          [ann.id, 334],
          [bob.id, 333],
          [cy.id, 333],
        ],
      ],
      [
        100,
        [cy.id, ann.id, bob.id],
        [
          [cy.id, 34],
          [ann.id, 33],
          [bob.id, 33],
        ],
      ],
      [
        1,
        [cy.id, bob.id],
        [
          [cy.id, 1],
          [bob.id, 0],
        ],
      ],
      [
        7,
        [ann.id, bob.id],
        [
          [ann.id, 4],
          [bob.id, 3],
        ],
      ],
      [
        1000,
        [bob.id, ann.id, cy.id],
        [
          [bob.id, 334],
          [ann.id, 333],
          [cy.id, 333],
        ],
      ],
    ];
    for (const [amount, members, expected] of cases) {
      const id = await api.expense(bob, groupId, { amount, splitBetween: members });
      const shares = await api.shares(id, ann.token);
      expect(pairs(shares)).toEqual(expected);
      keepsTheSplit(shares, amount, members);
      expect((await api.balances(groupId, cy.token)).sum).toBe(0);
    }
  }, 60000);

  it('gives the remainder of a split by shares whole to the member listed first', async () => {
    const { ann, bob, cy, groupId } = await flat('shares');
    const id = await api.expense(ann, groupId, {
      amount: 1001,
      splitByShares: [
        { memberId: bob.id, shares: 2 },
        { memberId: ann.id, shares: 1 },
      ],
    });
    expect(pairs(await api.shares(id, cy.token))).toEqual([
      [bob.id, 668],
      [ann.id, 333],
    ]);
    const three = await api.expense(cy, groupId, {
      amount: 1000,
      splitByShares: [
        { memberId: ann.id, shares: 1 },
        { memberId: bob.id, shares: 1 },
        { memberId: cy.id, shares: 1 },
      ],
    });
    expect(pairs(await api.shares(three, bob.token))).toEqual([
      [ann.id, 334],
      [bob.id, 333],
      [cy.id, 333],
    ]);
    expect(await api.balances(groupId, ann.token)).toMatchObject({
      of: { [ann.id]: 1001 - 333 - 334, [bob.id]: -668 - 333, [cy.id]: 1000 - 333 },
      sum: 0,
    });
  }, 60000);

  it('splits an edited expense again by the rule in force, and keeps splits by exact amounts as given', async () => {
    const { ann, bob, cy, groupId } = await flat('edited');
    const id = await api.expense(cy, groupId, {
      date: day(-1),
      amount: 1000,
      splitExactly: [
        { memberId: ann.id, amount: 500 },
        { memberId: cy.id, amount: 500 },
      ],
    });
    expect(pairs(await api.shares(id, bob.token))).toEqual([
      [ann.id, 500],
      [cy.id, 500],
    ]);
    await api.done('PUT', `/expenses/${id}`, cy.token, {
      description: 'Groceries',
      amount: 1000,
      date: day(-1),
      splitBetween: [bob.id, cy.id, ann.id],
      version: 1,
    });
    expect(pairs(await api.shares(id, bob.token))).toEqual([
      [bob.id, 334],
      [cy.id, 333],
      [ann.id, 333],
    ]);
    expect(await api.balances(groupId, ann.token)).toMatchObject({
      of: { [ann.id]: -333, [bob.id]: -334, [cy.id]: 667 },
      sum: 0,
    });
  }, 60000);

  it('keeps the shares an expense was given until it is edited, across a restart', async () => {
    // Request 10: an expense keeps the shares it was given; the rule in force splits an expense when it is recorded
    // or edited, never when it is read. (The expenses recorded before the change: the next test.)
    const { ann, bob, cy, groupId } = await flat('kept');
    const id = await api.expense(bob, groupId, { amount: 2000, splitBetween: [cy.id, bob.id, ann.id] });
    const recorded = await api.read(`/expenses/${id}`, ann.token);
    expect(pairs(recorded.shares as never)).toEqual([
      [cy.id, 668],
      [bob.id, 666],
      [ann.id, 666],
    ]);
    await api.expense(cy, groupId, { amount: 5, splitBetween: [ann.id, cy.id] });
    await kill(server);
    server = await start(db.path);
    api = client(server.port);
    const token = await api.login(ann.email);
    expect(await api.read(`/expenses/${id}`, token)).toEqual(recorded);
    expect((await api.balances(groupId, token)).sum).toBe(0);
  }, 90000);

  it('keeps the shares of the expenses recorded before the change, on the same database', async () => {
    // Recorded through the tree as it stood at request 9 (`previous`), then read through this one: "earlier expenses
    // are not computed again". The payer is never listed first, so a tree that splits again at a read, by the rule in
    // force, gives the remainder to someone else than the earlier tree did.
    const upgraded = database('upgraded');
    let running = await start(upgraded.path, {}, previous('remainder-to-the-first'));
    try {
      let through = client(running.port);
      const ann = await through.person('ann@upgraded.remainder.test');
      const bob = await through.person('bob@upgraded.remainder.test');
      const cy = await through.person('cy@upgraded.remainder.test');
      const groupId = await through.groupOf(ann, [bob, cy]);
      const equal = await through.expense(bob, groupId, { amount: 1000, splitBetween: [ann.id, bob.id, cy.id] });
      const byShares = await through.expense(cy, groupId, {
        amount: 1001,
        splitByShares: [
          { memberId: bob.id, shares: 1 },
          { memberId: cy.id, shares: 1 },
        ],
      });
      const recorded = [
        await through.read(`/expenses/${equal}`, ann.token),
        await through.read(`/expenses/${byShares}`, ann.token),
      ];
      const balances = await through.balances(groupId, ann.token);
      await stop(running);
      running = await start(upgraded.path);
      through = client(running.port);
      const token = await through.login(ann.email);
      expect(pairs((await through.read(`/expenses/${equal}`, token)).shares as never)).toEqual(
        pairs(recorded[0].shares as never),
      );
      expect(pairs((await through.read(`/expenses/${byShares}`, token)).shares as never)).toEqual(
        pairs(recorded[1].shares as never),
      );
      expect(await through.balances(groupId, token)).toEqual(balances);
      // And from now on, the new rule, in the same group.
      const later = await through.expense(bob, groupId, { amount: 1000, splitBetween: [ann.id, bob.id, cy.id] });
      expect(pairs(await through.shares(later, token))).toEqual([
        [ann.id, 334],
        [bob.id, 333],
        [cy.id, 333],
      ]);
    } finally {
      await stop(running);
      upgraded.remove();
    }
  }, 120000);
});
