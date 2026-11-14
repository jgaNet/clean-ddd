import {
  client,
  Client,
  database,
  day,
  eventually,
  idOf,
  Json,
  monthly,
  Outcome,
  payable,
  PaymentProvider,
  paymentProvider,
  Running,
  start,
  stop,
} from './tally';

/** Request 31: a group merged into another of the same currency, by the owner of both. */
const db = database('merge');
let provider: PaymentProvider;
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  environment = await provider.environment();
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;
const ids = (list: Json[]) => list.map(each => each.id as string);
/** Whether two maps of balances are the same, whatever the order of their keys. */
const same = (a: Record<string, number>, b: Record<string, number>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

describe('merge two groups', () => {
  it('merges a group into another of the same currency: its members, expenses, settlements and balances, the zero sum kept', async () => {
    const [ann, bob, cy, dan, eve] = await Promise.all(
      ['ann', 'bob', 'cy', 'dan', 'eve'].map(name => api.person(`${name}@moved.merge.test`)),
    );
    // The flat: Ann, Bob, Dan. Bob paid 600 for Ann and himself: Ann -300, Bob 300.
    const kept = await api.group(ann, 'The flat');
    const toKept = await api.invite(ann, kept);
    await api.join(bob, toKept);
    await api.join(dan, toKept);
    const flatsOwn = await api.expense(bob, kept, { amount: 600, splitBetween: [ann.id, bob.id] });
    // The house: Ann, Cy, Bob, Eve. Cy paid 900 for Ann, Bob and himself; Eve paid 200 for herself and Cy, and left
    // (her 100 passed to Ann); Bob paid Cy 100 in cash. Ann -200, Bob -200, Cy 400.
    const merged = await api.group(ann, 'The house');
    const toMerged = await api.invite(ann, merged);
    for (const who of [cy, bob, eve]) await api.join(who, toMerged);
    const dinner = await api.expense(cy, merged, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
    const eves = await api.expense(eve, merged, { amount: 200, splitBetween: [eve.id, cy.id] });
    await api.done('POST', `/groups/${merged}/leave`, eve.token);
    const cash = await api.cash(cy, merged, bob, 100);
    const rent = await api.create(`/groups/${merged}/recurring`, cy.token, {
      description: 'Rent',
      amount: 1000,
      startsOn: monthly(30).startsOn,
      splitBetween: [cy.id, ann.id],
    });
    await api.done('PUT', `/groups/${merged}/budgets/groceries`, ann.token, { amount: 5000 });
    await api.create(`/groups/${merged}/templates`, cy.token, { name: 'Cy and Bob', splitBetween: [cy.id, bob.id] });
    expect((await api.balances(merged, ann.token)).of).toEqual({ [ann.id]: -200, [cy.id]: 400, [bob.id]: -200 });
    const housesAudit = await api.list(`/groups/${merged}/audit`, ann.token);
    const eveBefore = await api.read(`/groups/${merged}/members/${eve.id}/statement`, cy.token);
    const membersBefore = await api.list(`/groups/${kept}/members`, ann.token);

    await api.done('POST', `/groups/${kept}/merge`, ann.token, { from: merged });

    // The group merged is gone at once, for everyone, and its invitations let nobody join.
    expect(await api.hidden(`/groups/${merged}`, ann.token)).toBe(404);
    expect(await api.hidden(`/groups/${merged}`, cy.token)).toBe(404);
    expect(await api.hidden(`/groups/${merged}/balances`, cy.token)).toBe(404);
    const fay = await api.person('fay@moved.merge.test');
    expect(await api.refused('POST', `/invitations/${toMerged}/accept`, fay.token)).toBe(true);
    expect(await api.list('/groups/mine', fay.token)).toEqual([]);

    // Everything it held is the group kept's within a few seconds.
    const settled = { [ann.id]: -500, [bob.id]: 100, [dan.id]: 0, [cy.id]: 400 };
    const balances = await eventually(
      () => api.balances(kept, dan.token),
      each => same(each.of, settled),
    );
    expect(balances).toEqual({ order: [ann.id, bob.id, dan.id, cy.id], of: settled, sum: 0 });
    const members = await api.list(`/groups/${kept}/members`, cy.token);
    expect(members.slice(0, 3)).toEqual(membersBefore);
    expect(members[3]).toMatchObject({ memberId: cy.id, name: cy.name, role: 'member' });
    expect(members[3].joinedAt).toMatch(TIME);
    expect((await api.list('/groups/mine', cy.token)).map(each => each.id)).toEqual([kept]);

    const expenses = await eventually(
      () => api.list(`/groups/${kept}/expenses`, dan.token),
      each => each.length === 3,
    );
    expect(new Set(ids(expenses))).toEqual(new Set([flatsOwn, dinner, eves]));
    expect(await api.read(`/expenses/${dinner}`, dan.token)).toMatchObject({
      id: dinner,
      groupId: kept,
      amount: 900,
      paidBy: cy.id,
      version: 1,
      shares: [
        { memberId: ann.id, amount: 300 },
        { memberId: bob.id, amount: 300 },
        { memberId: cy.id, amount: 300 },
      ],
    });
    expect(await api.read(`/settlements/${cash}`, dan.token)).toMatchObject({
      id: cash,
      groupId: kept,
      from: bob.id,
      to: cy.id,
      amount: 100,
      method: 'cash',
      status: 'paid',
    });
    expect(ids(await api.list(`/groups/${kept}/settlements`, ann.token))).toEqual([cash]);
    expect(await api.read(`/recurring/${rent}`, dan.token)).toMatchObject({ id: rent, groupId: kept, paidBy: cy.id });
    expect(ids(await api.list(`/groups/${kept}/recurring`, ann.token))).toEqual([rent]);
    // Its budgets and templates do not move.
    expect(await api.list(`/groups/${kept}/budgets`, ann.token)).toEqual([]);
    expect(await api.list(`/groups/${kept}/templates`, ann.token)).toEqual([]);
    // Eve, who had left the group merged, is a former member of the group kept: her statement is read there.
    expect(await api.read(`/groups/${kept}/members/${eve.id}/statement`, dan.token)).toEqual(eveBefore);
    expect(await api.hidden(`/groups/${kept}`, eve.token)).toBe(404);
    // Its audit's entries are the group kept's, the oldest first.
    const audit = await api.list(`/groups/${kept}/audit`, ann.token);
    expect(ids(audit)).toEqual(expect.arrayContaining(ids(housesAudit)));
    const times = audit.map(each => new Date(String(each.at)).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // Nothing recorded since is lost: a new expense with Cy in the group kept.
    await api.expense(cy, kept, { amount: 400, splitBetween: [cy.id, dan.id] });
    expect((await api.balances(kept, ann.token)).sum).toBe(0);
  }, 90000);

  it('refuses to merge groups of two currencies, a group into itself, by anyone but the owner of both, while a payment waits, and an archived group by the rule that keeps it read only', async () => {
    const [ann, bob, cy] = await Promise.all(
      ['ann', 'bob', 'cy'].map(name => api.person(`${name}@refused.merge.test`)),
    );
    const flat = await api.groupOf(ann, [bob]);
    const dollars = await api.create('/groups', ann.token, { name: 'New York', currency: 'USD' });
    const bobs = await api.groupOf(bob, [ann]);
    const house = await api.groupOf(ann, [cy]);
    await api.expense(ann, house, { amount: 600, splitBetween: [ann.id, cy.id] });
    await payable(api, ann, provider);
    const merge = (into: string, from: string, token = ann.token) =>
      api.act('POST', `/groups/${into}/merge`, token, { from });

    expect((await merge(flat, dollars)).accepted).toBe(false);
    expect((await merge(flat, flat)).accepted).toBe(false);
    expect((await merge(flat, bobs)).accepted).toBe(false);
    expect((await merge(bobs, flat, bob.token)).accepted).toBe(false);
    expect((await merge(flat, house, cy.token)).accepted).toBe(false);
    // A payment of Cy's waits at the provider in the house.
    const waiting = await api.payThrough(cy, house, ann, 100);
    expect((await merge(flat, house)).accepted).toBe(false);
    expect((await api.call('POST', `/groups/${flat}/merge`, ann.token, {})).status).toBe(400);
    // Nothing was merged: every group is still there.
    for (const group of [flat, dollars, bobs, house])
      expect((await api.read(`/groups/${group}`, ann.token)).id).toBe(group);

    // An archived group is not merged, either way, by the rule that refuses any change in it.
    const old = await api.group(ann, 'Old trip');
    await api.done('POST', `/groups/${old}/archive`, ann.token);
    const merging: Outcome = await merge(flat, old);
    const inviting: Outcome = await api.act('POST', `/groups/${old}/invitations`, ann.token);
    expect(merging.accepted).toBe(false);
    expect(inviting.accepted).toBe(false);
    if (merging.later && inviting.later) expect(merging.error?.type).toBe(inviting.error?.type);
    expect((await merge(old, flat)).accepted).toBe(false);
    expect((await api.read(`/groups/${old}`, ann.token)).archivedAt).toMatch(TIME);

    // Once the payment has landed, the house merges.
    await provider.webhook(api, provider.paymentFor(waiting).id, 'succeeded');
    await api.done('POST', `/groups/${flat}/merge`, ann.token, { from: house });
    const settled = { [ann.id]: 200, [bob.id]: 0, [cy.id]: -200 };
    expect(
      (
        await eventually(
          () => api.balances(flat, ann.token),
          each => same(each.of, settled),
        )
      ).of,
    ).toEqual(settled);
    expect(
      (
        await eventually(
          () => api.read(`/settlements/${waiting}`, cy.token),
          each => each.groupId === flat,
        )
      ).status,
    ).toBe('paid');
  }, 90000);

  it('counts once every expense recorded in the group merged while it is merged, through two servers', async () => {
    const second = await start(db.path, environment);
    try {
      const other = client(second.port);
      const [ann, bob, cy] = await Promise.all(['ann', 'bob', 'cy'].map(name => api.person(`${name}@race.merge.test`)));
      const kept = await api.groupOf(ann, [bob]);
      const merged = await api.groupOf(ann, [cy, bob]);
      const cyThere = await other.login(cy.email);
      const annThere = await other.login(ann.email);
      // Twelve expenses Cy pays for Bob and himself, half each, sent with the merge, through both servers.
      const sent: Promise<Outcome>[] = Array.from({ length: 12 }, (_, n) =>
        (n % 2 === 0 ? api : other).act('POST', `/groups/${merged}/expenses`, n % 2 === 0 ? cy.token : cyThere, {
          description: `Round ${n}`,
          amount: 200 + 2 * n,
          date: day(0),
          splitBetween: [cy.id, bob.id],
        }),
      );
      const [merging, ...outcomes] = await Promise.all([
        other.act('POST', `/groups/${kept}/merge`, annThere, { from: merged }),
        ...sent,
      ]);
      expect(merging.accepted).toBe(true);
      const accepted = outcomes.flatMap((outcome, n) => (outcome.accepted ? [{ id: idOf(outcome.result), n }] : []));
      const total = accepted.reduce((sum, { n }) => sum + 200 + 2 * n, 0);
      const expected = { [ann.id]: 0, [bob.id]: -total / 2, [cy.id]: total / 2 };
      const balances = await eventually(
        () => api.balances(kept, bob.token),
        each => same(each.of, expected),
      );
      expect(balances.of).toEqual(expected);
      expect(balances.sum).toBe(0);
      const listed = ids(await api.list(`/groups/${kept}/expenses`, ann.token));
      expect(listed).toHaveLength(accepted.length);
      expect(new Set(listed)).toEqual(new Set(accepted.map(each => each.id)));
      expect(await other.hidden(`/groups/${merged}`, cyThere)).toBe(404);
    } finally {
      await stop(second);
    }
  }, 120000);
});
