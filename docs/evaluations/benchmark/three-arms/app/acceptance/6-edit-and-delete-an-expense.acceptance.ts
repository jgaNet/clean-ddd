import { client, Client, database, day, Outcome, pairs, Running, start, stop } from './tally';

/** Request 6: an expense edited from the version its author read, or deleted, by its payer or the owner. */
const db = database('edits');
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
  const ann = await api.person(`ann@${tag}.edits.test`);
  const bob = await api.person(`bob@${tag}.edits.test`);
  const cy = await api.person(`cy@${tag}.edits.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;

describe('edit and delete an expense', () => {
  it('lets the payer or the owner edit an expense whole, one version at a time', async () => {
    const { ann, bob, cy, groupId } = await flat('whole');
    const out = await api.person('out@whole.edits.test');
    const id = await api.expense(bob, groupId, {
      description: 'Groceries',
      amount: 900,
      date: day(-3),
      splitBetween: [ann.id, bob.id, cy.id],
    });
    expect((await api.read(`/expenses/${id}`, cy.token)).version).toBe(1);

    const edit = { description: 'Groceries and wine', amount: 1200, date: day(-2), splitBetween: [bob.id, cy.id] };
    await api.done('PUT', `/expenses/${id}`, ann.token, { ...edit, version: 1 });
    const edited = await api.read(`/expenses/${id}`, bob.token);
    expect(edited).toMatchObject({
      id,
      groupId,
      description: 'Groceries and wine',
      amount: 1200,
      date: day(-2),
      paidBy: bob.id,
      version: 2,
    });
    expect(pairs(edited.shares as never)).toEqual([
      [bob.id, 600],
      [cy.id, 600],
    ]);
    expect((await api.balances(groupId, cy.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 600, [cy.id]: -600 });

    expect(await api.refused('PUT', `/expenses/${id}`, cy.token, { ...edit, amount: 300, version: 2 })).toBe(true);
    expect(await api.refused('PUT', `/expenses/${id}`, out.token, { ...edit, amount: 300, version: 2 })).toBe(true);
    expect(await api.refused('PUT', `/expenses/${id}`, bob.token, { ...edit, amount: 300, version: 1 })).toBe(true);
    expect((await api.read(`/expenses/${id}`, ann.token)).amount).toBe(1200);

    await api.done('PUT', `/expenses/${id}`, bob.token, {
      ...edit,
      amount: 1500,
      splitBetween: [cy.id, bob.id],
      version: 2,
    });
    expect(await api.read(`/expenses/${id}`, ann.token)).toMatchObject({ amount: 1500, version: 3, paidBy: bob.id });
    expect((await api.balances(groupId, ann.token)).sum).toBe(0);
    expect(await api.hidden(`/expenses/${id}`, out.token)).toBe(404);
  }, 60000);

  it('refuses an edit that breaks the rules of an expense, and keeps it as it was', async () => {
    const { ann, bob, cy, groupId } = await flat('rules');
    const out = await api.person('out@rules.edits.test');
    const id = await api.expense(bob, groupId, { amount: 600, splitBetween: [bob.id, cy.id] });
    const edit = { description: 'Taxi', amount: 600, date: day(0), splitBetween: [bob.id, cy.id], version: 1 };

    expect(await api.refused('PUT', `/expenses/${id}`, bob.token, { ...edit, splitBetween: [ann.id, cy.id] })).toBe(
      true,
    );
    expect(await api.refused('PUT', `/expenses/${id}`, ann.token, { ...edit, splitBetween: [ann.id, cy.id] })).toBe(
      true,
    );
    expect(await api.refused('PUT', `/expenses/${id}`, bob.token, { ...edit, splitBetween: [bob.id, out.id] })).toBe(
      true,
    );
    expect(await api.refused('PUT', `/expenses/${id}`, bob.token, { ...edit, amount: 0 })).toBe(true);
    expect(await api.refused('PUT', `/expenses/${id}`, bob.token, { ...edit, date: day(1) })).toBe(true);
    expect(await api.read(`/expenses/${id}`, ann.token)).toMatchObject({ amount: 600, version: 1, paidBy: bob.id });
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 300, [cy.id]: -300 });
  }, 60000);

  it('deletes an expense, by its payer or the owner, which then counts in no balance', async () => {
    const { ann, bob, cy, groupId } = await flat('delete');
    const out = await api.person('out@delete.edits.test');
    const bobs = await api.expense(bob, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
    const cys = await api.expense(cy, groupId, { amount: 400, splitBetween: [cy.id, bob.id] });

    expect(await api.refused('DELETE', `/expenses/${bobs}`, cy.token)).toBe(true);
    expect(await api.refused('DELETE', `/expenses/${bobs}`, out.token)).toBe(true);
    await api.done('DELETE', `/expenses/${bobs}`, bob.token);
    expect(await api.hidden(`/expenses/${bobs}`, bob.token)).toBe(404);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: -200, [cy.id]: 200 });
    expect(await api.refused('DELETE', `/expenses/${bobs}`, bob.token)).toBe(true);
    expect(
      await api.refused('PUT', `/expenses/${bobs}`, bob.token, {
        description: 'Back',
        amount: 900,
        date: day(0),
        splitBetween: [bob.id],
        version: 1,
      }),
    ).toBe(true);

    await api.done('DELETE', `/expenses/${cys}`, ann.token);
    expect(await api.hidden(`/expenses/${cys}`, cy.token)).toBe(404);
    expect(await api.balances(groupId, cy.token)).toMatchObject({
      of: { [ann.id]: 0, [bob.id]: 0, [cy.id]: 0 },
      sum: 0,
    });
  }, 60000);

  it("keeps exactly one of two edits of one expense sent at once, and refuses the other by its rule's name", async () => {
    const { ann, bob, cy, groupId } = await flat('race');
    const id = await api.expense(bob, groupId, { amount: 1200, splitBetween: [ann.id, bob.id, cy.id] });
    // The rule's name, when it is answered later: the same rule, refusing an edit from a version already gone.
    await api.done('PUT', `/expenses/${id}`, bob.token, {
      description: 'Groceries',
      amount: 1200,
      date: day(0),
      splitBetween: [ann.id, bob.id, cy.id],
      version: 1,
    });
    const stale = await api.act('PUT', `/expenses/${id}`, bob.token, {
      description: 'Stale',
      amount: 99,
      date: day(0),
      splitBetween: [bob.id],
      version: 1,
    });
    expect(stale.accepted).toBe(false);
    const notPayer = await api.act('PUT', `/expenses/${id}`, cy.token, {
      description: 'Not mine',
      amount: 99,
      date: day(0),
      splitBetween: [bob.id],
      version: 2,
    });
    expect(notPayer.accepted).toBe(false);
    if (stale.later && notPayer.later) expect(stale.error?.type).not.toBe(notPayer.error?.type);

    const second = await start(db.path);
    try {
      const other = client(second.port);
      const owner = await other.login(ann.email);
      let version = 2;
      for (let round = 0; round < 6; round++) {
        // Bob, the payer, and Ann, the owner, from the same version, at once: half the rounds through one server,
        // half through two.
        const through = round % 2 === 0 ? api : other;
        const bobs = {
          description: `Bob ${round}`,
          amount: 3000 + round * 3,
          date: day(0),
          splitBetween: [bob.id, cy.id, ann.id],
          version,
        };
        const anns = {
          description: `Ann ${round}`,
          amount: 6000 + round * 2,
          date: day(-1),
          splitBetween: [ann.id, bob.id],
          version,
        };
        const [byBob, byAnn]: Outcome[] = await Promise.all([
          api.act('PUT', `/expenses/${id}`, bob.token, bobs),
          through.act('PUT', `/expenses/${id}`, through === api ? ann.token : owner, anns),
        ]);
        expect([byBob.accepted, byAnn.accepted].filter(Boolean)).toHaveLength(1);
        const loser = byBob.accepted ? byAnn : byBob;
        if (loser.later) {
          expect(loser.error?.type).toMatch(PASCAL);
          if (stale.later) expect(loser.error?.type).toBe(stale.error?.type);
        } else expect(loser.status).toBeGreaterThanOrEqual(400);

        const winner = byBob.accepted ? bobs : anns;
        const expense = await api.read(`/expenses/${id}`, cy.token);
        expect(expense).toMatchObject({ description: winner.description, amount: winner.amount, version: version + 1 });
        expect((expense.shares as { memberId: string }[]).map(share => share.memberId)).toEqual(winner.splitBetween);
        const balances = await api.balances(groupId, cy.token);
        expect(balances.sum).toBe(0);
        expect(balances.of[bob.id]).toBe(
          winner.amount -
            (expense.shares as { memberId: string; amount: number }[]).find(s => s.memberId === bob.id)!.amount,
        );
        version += 1;
      }
    } finally {
      await stop(second);
    }
  }, 180000);

  it('refuses an edit of the wrong shape at once with 400', async () => {
    const { bob, cy, groupId } = await flat('shape');
    const id = await api.expense(bob, groupId, { amount: 600, splitBetween: [bob.id, cy.id] });
    const edit = { description: 'Taxi', amount: 600, date: day(0), splitBetween: [bob.id, cy.id], version: 1 };
    const bodies: unknown[] = [
      { ...edit, version: undefined },
      { ...edit, version: '1' },
      { ...edit, amount: undefined },
      { ...edit, splitBetween: 'everyone' },
    ];
    const answered: string[] = [];
    for (const body of bodies)
      answered.push(`${JSON.stringify(body)}: ${(await api.call('PUT', `/expenses/${id}`, bob.token, body)).status}`);
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
    expect((await api.read(`/expenses/${id}`, cy.token)).version).toBe(1);
  }, 60000);
});
