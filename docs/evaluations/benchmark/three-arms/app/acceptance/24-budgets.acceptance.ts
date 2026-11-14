import {
  bySweep,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  monthly,
  monthsFrom,
  Person,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 24: an expense's category, a monthly budget per category, and a notice when a month passes one. */
const db = database('budgets');
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
const MONTH = day(0).slice(0, 7);
/** The 15th of the month before this one. */
const lastMonth = () => monthsFrom(`${MONTH}-15`, -1);

/** Three people in a group: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.budgets.test`);
  const bob = await api.person(`bob@${tag}.budgets.test`);
  const cy = await api.person(`cy@${tag}.budgets.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

/** A person's budget notices for a group, the most recent first. */
const told = async (who: Person, groupId: string) =>
  (await api.notices(who.token)).filter(each => each.kind === 'budget' && each.groupId === groupId);

const budget = (owner: Person, groupId: string, category: string, amount: number) =>
  api.done('PUT', `/groups/${groupId}/budgets/${category}`, owner.token, { amount });

describe('budgets', () => {
  it("tells every member once when a month's spending in a category passes its budget", async () => {
    const { ann, bob, cy, groupId } = await flat('passed');
    await budget(ann, groupId, 'groceries', 1000);
    const first = await api.expense(bob, groupId, {
      amount: 600,
      category: 'groceries',
      splitBetween: [bob.id, cy.id],
    });
    expect((await api.read(`/expenses/${first}`, cy.token)).category).toBe('groceries');
    await sleep(2500);
    for (const member of [ann, bob, cy]) expect(await told(member, groupId)).toEqual([]);

    await api.expense(cy, groupId, { amount: 500, category: 'groceries', splitBetween: [cy.id, ann.id] });
    for (const member of [ann, bob, cy]) {
      const notices = await eventually(
        () => told(member, groupId),
        each => each.length > 0,
      );
      expect(notices).toHaveLength(1);
      expect(notices[0]).toEqual({
        id: expect.any(String),
        kind: 'budget',
        groupId,
        category: 'groceries',
        month: MONTH,
        budget: 1000,
        amount: 1100,
        at: expect.stringMatching(TIME),
      });
    }
    // Further over, or in a category without a budget: no other notice.
    await api.expense(ann, groupId, { amount: 100, category: 'groceries', splitBetween: [ann.id] });
    await api.expense(bob, groupId, { amount: 5000, category: 'rent', splitBetween: [bob.id, ann.id] });
    await sleep(2500);
    for (const member of [ann, bob, cy]) expect(await told(member, groupId)).toHaveLength(1);
    expect(await api.list(`/groups/${groupId}/budgets`, cy.token)).toEqual([
      { category: 'groceries', amount: 1000, spent: 1200 },
    ]);
  }, 60000);

  it("counts a month by its expenses' dates, edits and deletions, in the category each expense keeps", async () => {
    const { ann, bob, cy, groupId } = await flat('month');
    const plain = await api.expense(ann, groupId, { amount: 100, splitBetween: [ann.id] });
    expect((await api.read(`/expenses/${plain}`, bob.token)).category).toBe('other');
    await budget(ann, groupId, 'food', 500);

    // An expense of last month passes last month's budget, and spends nothing of this month's.
    await api.expense(bob, groupId, { amount: 600, category: 'food', date: lastMonth(), splitBetween: [bob.id] });
    const late = await eventually(
      () => told(cy, groupId),
      each => each.length > 0,
    );
    expect(late).toEqual([
      expect.objectContaining({ category: 'food', month: lastMonth().slice(0, 7), budget: 500, amount: 600 }),
    ]);
    expect(await api.list(`/groups/${groupId}/budgets`, cy.token)).toEqual([
      { category: 'food', amount: 500, spent: 0 },
    ]);

    // This month: an edit that passes it tells; a deletion counts.
    const edited = await api.expense(cy, groupId, { amount: 300, category: 'food', splitBetween: [cy.id] });
    const gone = await api.expense(cy, groupId, { amount: 150, category: 'travel', splitBetween: [cy.id] });
    const edit = (amount: number, version: number, category = 'food') =>
      api.done('PUT', `/expenses/${edited}`, cy.token, {
        description: 'Groceries',
        amount,
        date: day(0),
        category,
        splitBetween: [cy.id],
        version,
      });
    await edit(450, 1);
    await sleep(2500);
    expect(await told(ann, groupId)).toHaveLength(1);
    await edit(650, 2);
    const now = await eventually(
      () => told(ann, groupId),
      each => each.length > 1,
    );
    expect(now[0]).toMatchObject({ category: 'food', month: MONTH, budget: 500, amount: 650 });
    await api.done('PUT', `/expenses/${gone}`, cy.token, {
      description: 'Groceries',
      amount: 150,
      date: day(0),
      category: 'food',
      splitBetween: [cy.id],
      version: 1,
    });
    expect(await api.list(`/groups/${groupId}/budgets`, bob.token)).toEqual([
      { category: 'food', amount: 500, spent: 800 },
    ]);
    await api.done('DELETE', `/expenses/${gone}`, cy.token);
    await edit(200, 3, 'leisure');
    expect(await api.list(`/groups/${groupId}/budgets`, bob.token)).toEqual([
      { category: 'food', amount: 500, spent: 0 },
    ]);
    await sleep(2500);
    expect(await told(bob, groupId)).toHaveLength(2);
  }, 60000);

  it('lets the owner alone set or remove a budget, for a category Tally has and an amount allowed', async () => {
    const { ann, bob, cy, groupId } = await flat('owner');
    const out = await api.person('out@owner.budgets.test');
    const path = (category: string) => `/groups/${groupId}/budgets/${category}`;
    const refusals: [string, string, string, Json][] = [
      ['by a member', bob.token, 'food', { amount: 100 }],
      ['by someone outside the group', out.token, 'food', { amount: 100 }],
      ['a category Tally has not', ann.token, 'snacks', { amount: 100 }],
      ['an amount of 0', ann.token, 'food', { amount: 0 }],
      ['an amount over 100 000 000', ann.token, 'food', { amount: 100_000_001 }],
    ];
    const accepted: string[] = [];
    for (const [what, token, category, body] of refusals)
      if ((await api.act('PUT', path(category), token, body)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    expect((await api.call('PUT', path('food'), ann.token, { amount: '100' })).status).toBe(400);
    expect(await api.list(`/groups/${groupId}/budgets`, ann.token)).toEqual([]);

    await budget(ann, groupId, 'travel', 900);
    await budget(ann, groupId, 'groceries', 400);
    await budget(ann, groupId, 'rent', 80000);
    await budget(ann, groupId, 'groceries', 450);
    expect((await api.list(`/groups/${groupId}/budgets`, cy.token)).map(each => [each.category, each.amount])).toEqual([
      ['groceries', 450],
      ['rent', 80000],
      ['travel', 900],
    ]);
    expect(await api.refused('DELETE', path('rent'), bob.token)).toBe(true);
    await api.done('DELETE', path('rent'), ann.token);
    expect((await api.list(`/groups/${groupId}/budgets`, cy.token)).map(each => each.category)).toEqual([
      'groceries',
      'travel',
    ]);
    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, bob.token, {
        description: 'Crisps',
        amount: 100,
        date: day(0),
        category: 'snacks',
        splitBetween: [bob.id],
      }),
    ).toBe(true);
    expect(
      (
        await api.call('POST', `/groups/${groupId}/expenses`, bob.token, {
          description: 'Crisps',
          amount: 100,
          date: day(0),
          category: 7,
          splitBetween: [bob.id],
        })
      ).status,
    ).toBe(400);
    expect(await api.hidden(`/groups/${groupId}/budgets`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/budgets`)).toBe(401);
  }, 60000);

  it("gives a recurring expense's category to its expenses, and tells each month that passes", async () => {
    const { ann, bob, groupId } = await flat('recurring');
    await budget(ann, groupId, 'rent', 1000);
    const { startsOn, passed } = monthly(-40);
    const id = await api.create(`/groups/${groupId}/recurring`, ann.token, {
      description: 'Rent',
      amount: 1200,
      category: 'rent',
      startsOn,
      splitBetween: [ann.id, bob.id],
    });
    expect((await api.read(`/recurring/${id}`, bob.token)).category).toBe('rent');
    const listed = await eventually(
      () => api.list(`/groups/${groupId}/expenses`, bob.token),
      each => each.length >= passed.length,
      bySweep(0),
    );
    expect(listed.map(each => each.category)).toEqual(passed.map(() => 'rent'));
    const notices = await eventually(
      () => told(bob, groupId),
      each => each.length >= new Set(passed.map(date => date.slice(0, 7))).size,
    );
    expect(notices.map(each => each.month).sort()).toEqual([...new Set(passed.map(date => date.slice(0, 7)))].sort());
  }, 60000);

  it('makes one budget notice per member and month, even when the server is killed and started again', async () => {
    const { ann, bob, cy, groupId } = await flat('killed');
    await budget(ann, groupId, 'groceries', 100);
    for (let round = 0; round < 3; round++) {
      await api.expense(ann, groupId, { amount: 50, category: 'groceries', splitBetween: [ann.id, bob.id] });
      await kill(server);
      server = await start(db.path);
      api = client(server.port);
    }
    const tokens = [await api.login(ann.email), await api.login(bob.email), await api.login(cy.email)];
    for (const token of tokens)
      await eventually(
        async () => (await api.notices(token)).filter(each => each.kind === 'budget'),
        each => each.length > 0,
        30000,
      );
    await sleep(3000);
    for (const token of tokens) {
      const notices = (await api.notices(token)).filter(each => each.kind === 'budget');
      expect(notices.map(each => [each.month, each.amount])).toEqual([[MONTH, 150]]);
    }
  }, 180000);
});
