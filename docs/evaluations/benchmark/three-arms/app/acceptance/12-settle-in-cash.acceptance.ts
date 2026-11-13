import { client, Client, database, Outcome, Running, start, stop } from './tally';

/** Request 12: a settlement in cash, recorded by its payee, never more than is owed, counted by the balances at once. */
const db = database('cash');
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

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

/** Three people in a group, Ann owns it; Ann paid 900 for the three of them: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.cash.test`);
  const bob = await api.person(`bob@${tag}.cash.test`);
  const cy = await api.person(`cy@${tag}.cash.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  return { ann, bob, cy, groupId };
}

describe('settle up in cash', () => {
  it('records a settlement in cash by its payee, read whole, and counts it in the balances at once', async () => {
    const { ann, bob, cy, groupId } = await flat('whole');
    const id = await api.cash(ann, groupId, bob, 300);

    const read = await api.settlement(id, cy.token);
    expect(read).toMatchObject({ id, groupId, from: bob.id, to: ann.id, amount: 300, method: 'cash', status: 'paid' });
    expect(read.at).toMatch(TIME);
    expect(await api.settlement(id, bob.token)).toEqual(read);
    expect(await api.balances(groupId, bob.token)).toEqual({
      order: [ann.id, bob.id, cy.id],
      of: { [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 },
      sum: 0,
    });
    // Everything that reads a balance counts it: the suggestions, and leaving.
    expect(
      (await api.list(`/groups/${groupId}/settlements/suggested`, cy.token)).map(each => [
        each.from,
        each.to,
        each.amount,
      ]),
    ).toEqual([[cy.id, ann.id, 300]]);
    // Bob is even now, and leaves (request 9).
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);

    const out = await api.person('out@whole.cash.test');
    expect(await api.hidden(`/settlements/${id}`, out.token)).toBe(404);
    expect(await api.hidden(`/settlements/${id}`, bob.token)).toBe(404);
    expect(await api.hidden(`/settlements/${id}`)).toBe(401);
    expect(await api.hidden('/settlements/no-such-settlement', ann.token)).toBe(404);
  }, 60000);

  it('refuses a settlement of more than is owed, or between the wrong members, and changes nothing', async () => {
    const { ann, bob, cy, groupId } = await flat('rules');
    const out = await api.person('out@rules.cash.test');
    const path = `/groups/${groupId}/settlements/cash`;
    const before = await api.balances(groupId, ann.token);

    const tooMuch = await api.act('POST', path, ann.token, { from: bob.id, amount: 301 });
    expect(tooMuch.accepted).toBe(false);
    const refusals: [string, string, unknown][] = [
      ['a payee who is owed nothing', cy.token, { from: bob.id, amount: 100 }],
      ['to oneself', ann.token, { from: ann.id, amount: 100 }],
      ['from someone outside the group', ann.token, { from: out.id, amount: 100 }],
      ['by someone outside the group', out.token, { from: bob.id, amount: 100 }],
      ['an amount of 0', ann.token, { from: bob.id, amount: 0 }],
      ['a negative amount', ann.token, { from: bob.id, amount: -100 }],
      ['an amount that is not whole', ann.token, { from: bob.id, amount: 100.5 }],
    ];
    const accepted: string[] = [];
    for (const [what, token, body] of refusals) {
      const outcome = await api.act('POST', path, token, body);
      if (outcome.accepted) accepted.push(what);
      if (outcome.later) expect(outcome.error?.type).toMatch(PASCAL);
    }
    expect(accepted).toEqual([]);
    const notMember = await api.act('POST', path, ann.token, { from: out.id, amount: 100 });
    if (tooMuch.later && notMember.later) expect(tooMuch.error?.type).not.toBe(notMember.error?.type);
    expect((await api.call('POST', path, undefined, { from: bob.id, amount: 100 })).status).toBe(401);

    // Never more than the payee is owed, either: Dan owes 500, Ann is owed 200 of it, Bob 300.
    const dan = await api.person('dan@rules.cash.test');
    const other = await api.groupOf(ann, [bob, dan]);
    await api.expense(ann, other, {
      amount: 200,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: dan.id, amount: 200 },
      ],
    });
    await api.expense(bob, other, {
      amount: 300,
      splitExactly: [
        { memberId: bob.id, amount: 0 },
        { memberId: dan.id, amount: 300 },
      ],
    });
    expect(
      await api.refused('POST', `/groups/${other}/settlements/cash`, ann.token, { from: dan.id, amount: 300 }),
    ).toBe(true);
    await api.cash(ann, other, dan, 200);
    expect((await api.balances(other, dan.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 300, [dan.id]: -300 });

    expect(await api.balances(groupId, ann.token)).toEqual(before);
  }, 60000);

  it('refuses a settlement of the wrong shape at once with 400', async () => {
    const { ann, bob, groupId } = await flat('shape');
    const bodies: unknown[] = [
      { amount: 100 },
      { from: bob.id },
      { from: 42, amount: 100 },
      { from: bob.id, amount: '100' },
    ];
    const answered: string[] = [];
    for (const body of bodies)
      answered.push(
        `${JSON.stringify(body)}: ${(await api.call('POST', `/groups/${groupId}/settlements/cash`, ann.token, body)).status}`,
      );
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-300);
  }, 60000);

  it('keeps one of two settlements sent at once that together would pay more than is owed', async () => {
    const second = await start(db.path);
    try {
      const other = client(second.port);
      for (let round = 0; round < 6; round++) {
        const { ann, bob, cy, groupId } = await flat(`race${round}`);
        const through = round % 2 === 0 ? api : other;
        const token = through === api ? ann.token : await other.login(ann.email);
        const amounts = round < 3 ? [300, 300] : [200, 200];
        const [first, next]: Outcome[] = await Promise.all([
          api.act('POST', `/groups/${groupId}/settlements/cash`, ann.token, { from: bob.id, amount: amounts[0] }),
          through.act('POST', `/groups/${groupId}/settlements/cash`, token, { from: bob.id, amount: amounts[1] }),
        ]);
        expect([first.accepted, next.accepted].filter(Boolean)).toHaveLength(1);
        const balances = await api.balances(groupId, cy.token);
        expect(balances.sum).toBe(0);
        expect(balances.of[bob.id]).toBe(-300 + amounts[0]);
        expect(balances.of[ann.id]).toBe(600 - amounts[0]);
      }
    } finally {
      await stop(second);
    }
  }, 180000);

  it("keeps a member's statement to their expenses, while the balances count the settlements", async () => {
    const { ann, bob, groupId } = await flat('statement');
    const expenses = await api.list(`/groups/${groupId}/expenses`, ann.token);
    await api.cash(ann, groupId, bob, 200);
    const statement = await api.read(`/groups/${groupId}/members/${bob.id}/statement`, ann.token);
    expect(statement.balance).toBe(-300);
    expect((statement.entries as { expenseId: string }[]).map(each => each.expenseId)).toEqual(
      expenses.map(each => each.id),
    );
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-100);
  }, 60000);
});
