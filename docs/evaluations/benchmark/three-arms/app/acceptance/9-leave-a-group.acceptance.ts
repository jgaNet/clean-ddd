import { client, Client, database, day, reached, Running, sleep, start, stop } from './tally';

/** Request 9: leaving a group once one's balance is 0; the owner stays; what concerns a former member is kept. */
const db = database('leave');
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

/** Three people in a group: Ann owns it, Bob and Cy joined, in that order; and the invitation they used. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.leave.test`);
  const bob = await api.person(`bob@${tag}.leave.test`);
  const cy = await api.person(`cy@${tag}.leave.test`);
  const groupId = await api.group(ann);
  const invitation = await api.invite(ann, groupId);
  await api.join(bob, invitation);
  await api.join(cy, invitation);
  return { ann, bob, cy, groupId, invitation };
}

describe('leave a group', () => {
  it('refuses to let a member leave while their balance is not zero, and lets them leave once it is', async () => {
    const { ann, bob, cy, groupId } = await flat('even');
    await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
    // Request 20 lets a member leave with a balance, which passes to the owner: from then on, these two leaves are
    // not refused (the README's superseded cases), and nothing else here changes.
    if (!reached(20)) {
      expect(await api.refused('POST', `/groups/${groupId}/leave`, bob.token)).toBe(true);
      expect(await api.refused('POST', `/groups/${groupId}/leave`, cy.token)).toBe(true);
    }

    // Bob evens it out: he pays Ann back what he owes, as an expense that is all hers.
    await api.expense(bob, groupId, {
      description: 'Paying Ann back',
      amount: 300,
      splitExactly: [
        { memberId: bob.id, amount: 0 },
        { memberId: ann.id, amount: 300 },
      ],
    });
    expect((await api.balances(groupId, bob.token)).of[bob.id]).toBe(0);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);

    expect((await api.list(`/groups/${groupId}/members`, ann.token)).map(each => each.memberId)).toEqual([
      ann.id,
      cy.id,
    ]);
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, cy.id],
      of: { [ann.id]: 300, [cy.id]: -300 },
      sum: 0,
    });
    expect(await api.hidden(`/groups/${groupId}`, bob.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/balances`, bob.token)).toBe(404);
    expect(await api.list('/groups/mine', bob.token)).toEqual([]);
    expect(await api.refused('POST', `/groups/${groupId}/leave`, bob.token)).toBe(true);
  }, 60000);

  it('keeps the owner in the group', async () => {
    const { ann, groupId } = await flat('owner');
    expect((await api.balances(groupId, ann.token)).of[ann.id]).toBe(0);
    expect(await api.refused('POST', `/groups/${groupId}/leave`, ann.token)).toBe(true);
    expect((await api.read(`/groups/${groupId}`, ann.token)).ownerId).toBe(ann.id);
  }, 60000);

  it('keeps the expenses of a member who left as they were, unchangeable, and their statement readable', async () => {
    const { ann, bob, cy, groupId } = await flat('kept');
    const shared = await api.expense(bob, groupId, {
      description: 'Bob and Cy',
      amount: 600,
      date: day(-2),
      splitExactly: [
        { memberId: bob.id, amount: 300 },
        { memberId: cy.id, amount: 300 },
      ],
    });
    // Cy evens it out with Bob, then leaves.
    const back = await api.expense(cy, groupId, {
      description: 'Cy pays Bob back',
      amount: 300,
      date: day(-1),
      splitExactly: [
        { memberId: cy.id, amount: 0 },
        { memberId: bob.id, amount: 300 },
      ],
    });
    const before = await api.read(`/expenses/${shared}`, ann.token);
    await api.done('POST', `/groups/${groupId}/leave`, cy.token);

    expect(await api.read(`/expenses/${shared}`, ann.token)).toEqual(before);
    expect(await api.hidden(`/expenses/${shared}`, cy.token)).toBe(404);
    const edit = {
      description: 'Bob alone',
      amount: 600,
      date: day(-2),
      splitBetween: [bob.id],
      version: before.version,
    };
    expect(await api.refused('PUT', `/expenses/${shared}`, bob.token, edit)).toBe(true);
    expect(await api.refused('PUT', `/expenses/${shared}`, ann.token, edit)).toBe(true);
    expect(await api.refused('DELETE', `/expenses/${shared}`, bob.token)).toBe(true);
    expect(await api.refused('DELETE', `/expenses/${back}`, ann.token)).toBe(true);
    expect(await api.read(`/expenses/${shared}`, bob.token)).toEqual(before);

    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, bob.token, {
        description: 'With Cy',
        amount: 100,
        date: day(0),
        splitBetween: [bob.id, cy.id],
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, cy.token, {
        description: 'From Cy',
        amount: 100,
        date: day(0),
        splitBetween: [cy.id],
      }),
    ).toBe(true);

    const statement = await api.read(`/groups/${groupId}/members/${cy.id}/statement`, ann.token);
    expect(statement).toMatchObject({ memberId: cy.id, balance: 0 });
    expect((statement.entries as { expenseId: string }[]).map(each => each.expenseId)).toEqual([shared, back]);
    expect(await api.hidden(`/groups/${groupId}/members/${cy.id}/statement`, cy.token)).toBe(404);
    expect(await api.balances(groupId, bob.token)).toMatchObject({ of: { [ann.id]: 0, [bob.id]: 0 }, sum: 0 });
  }, 60000);

  it('lets a member who left join again, last, with a balance of zero', async () => {
    const { ann, bob, cy, groupId, invitation } = await flat('back');
    const dan = await api.person('dan@back.leave.test');
    await api.join(dan, invitation);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    await sleep(1100);
    await api.join(bob, invitation);

    const members = await api.list(`/groups/${groupId}/members`, ann.token);
    expect(members.map(each => [each.memberId, each.role])).toEqual([
      [ann.id, 'owner'],
      [cy.id, 'member'],
      [dan.id, 'member'],
      [bob.id, 'member'],
    ]);
    expect(await api.balances(groupId, bob.token)).toMatchObject({
      order: [ann.id, cy.id, dan.id, bob.id],
      of: { [bob.id]: 0 },
      sum: 0,
    });
    expect((await api.list('/groups/mine', bob.token)).map(each => each.id)).toEqual([groupId]);
    await api.expense(bob, groupId, { amount: 400, splitBetween: [bob.id, dan.id] });
    expect((await api.balances(groupId, dan.token)).of).toEqual({
      [ann.id]: 0,
      [cy.id]: 0,
      [dan.id]: -200,
      [bob.id]: 200,
    });
  }, 60000);

  it('refuses leaving to anyone who is not a member', async () => {
    const { groupId } = await flat('outsider');
    const out = await api.person('out@outsider.leave.test');
    expect(await api.refused('POST', `/groups/${groupId}/leave`, out.token)).toBe(true);
    expect((await api.call('POST', `/groups/${groupId}/leave`)).status).toBe(401);
  }, 60000);
});
