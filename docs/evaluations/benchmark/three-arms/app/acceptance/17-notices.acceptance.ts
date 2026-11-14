import { client, Client, database, day, eventually, Json, kill, Person, Running, sleep, start, stop } from './tally';

/** Request 17: a notice to each member of an expense's split but its payer; a person's notices, the most recent first. */
const db = database('notices');
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

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

/** Three people in a group: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.notices.test`);
  const bob = await api.person(`bob@${tag}.notices.test`);
  const cy = await api.person(`cy@${tag}.notices.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

/** A person's notices about one expense. */
const about = async (who: Person, expenseId: string) =>
  (await api.notices(who.token)).filter(each => each.expenseId === expenseId);

describe('notices', () => {
  it('tells each member of a split but its payer, soon, with their share', async () => {
    const { ann, bob, cy, groupId } = await flat('told');
    const id = await api.expense(ann, groupId, { amount: 1000, splitBetween: [bob.id, ann.id, cy.id] });
    const bobs = await eventually(
      () => about(bob, id),
      notices => notices.length > 0,
    );
    expect(bobs).toHaveLength(1);
    expect(bobs[0]).toMatchObject({ kind: 'expense', groupId, expenseId: id, amount: 334 });
    expect(typeof bobs[0].id).toBe('string');
    expect(bobs[0].at).toMatch(TIME);
    const cys = await eventually(
      () => about(cy, id),
      notices => notices.length > 0,
    );
    expect(cys).toEqual([expect.objectContaining({ kind: 'expense', groupId, expenseId: id, amount: 333 })]);
    await sleep(2500);
    expect(await about(ann, id)).toEqual([]);
    expect(await about(bob, id)).toEqual(bobs);
    expect(await about(cy, id)).toEqual(cys);
  }, 60000);

  it("lists a person's notices, the most recent first, to them alone, and makes none for an edit or a deletion", async () => {
    const { ann, bob, cy, groupId } = await flat('mine');
    const first = await api.expense(ann, groupId, { amount: 600, splitBetween: [ann.id, cy.id], date: day(-1) });
    await eventually(
      () => about(cy, first),
      notices => notices.length > 0,
    );
    await sleep(1100);
    const second = await api.expense(bob, groupId, { amount: 400, splitBetween: [bob.id, cy.id], date: day(-3) });
    const listed = await eventually(
      () => api.notices(cy.token),
      notices => notices.length >= 2,
    );
    expect(listed.map(each => each.expenseId)).toEqual([second, first]);
    expect(listed.map(each => each.amount)).toEqual([200, 300]);
    expect(await api.notices(bob.token)).toEqual([]);
    expect(await api.hidden('/notices')).toBe(401);

    await api.done('PUT', `/expenses/${first}`, ann.token, {
      description: 'Groceries',
      amount: 900,
      date: day(-1),
      splitBetween: [ann.id, cy.id, bob.id],
      version: 1,
    });
    await api.done('DELETE', `/expenses/${second}`, bob.token);
    await sleep(2500);
    expect(await api.notices(cy.token)).toEqual(listed);
    expect(await api.notices(bob.token)).toEqual([]);

    // A notice stays theirs after they leave: Cy evens out with an expense of her own, and leaves.
    await api.expense(cy, groupId, {
      description: 'Paying Ann back',
      amount: 300,
      splitExactly: [
        { memberId: cy.id, amount: 0 },
        { memberId: ann.id, amount: 300 },
      ],
    });
    expect((await api.balances(groupId, cy.token)).of[cy.id]).toBe(0);
    await api.done('POST', `/groups/${groupId}/leave`, cy.token);
    expect(await api.notices(cy.token)).toEqual(listed);
  }, 60000);

  it('makes one notice per member and expense, even when the server is killed and started again', async () => {
    const { ann, bob, cy, groupId } = await flat('killed');
    const ids: string[] = [];
    for (let round = 0; round < 4; round++) {
      ids.push(await api.expense(ann, groupId, { amount: 300 + round, splitBetween: [ann.id, bob.id, cy.id] }));
      await kill(server);
      server = await start(db.path);
      api = client(server.port);
    }
    const tokens = { bob: await api.login(bob.email), cy: await api.login(cy.email), ann: await api.login(ann.email) };
    const all = (token: string) => api.notices(token);
    const complete = (notices: Json[]) => ids.every(id => notices.some(each => each.expenseId === id));
    await eventually(() => all(tokens.bob), complete, 30000);
    await eventually(() => all(tokens.cy), complete, 30000);
    await sleep(3000);
    for (const token of [tokens.bob, tokens.cy]) {
      const notices = await all(token);
      expect(ids.map(id => notices.filter(each => each.expenseId === id).length)).toEqual([1, 1, 1, 1]);
    }
    expect(await all(tokens.ann)).toEqual([]);
  }, 180000);
});
