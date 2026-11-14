import { client, Client, database, Running, start, stop } from './tally';

/** Request 37: what a person spent across their groups, by month, currency and category. */
const db = database('insights');
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

/** The `dayOfMonth` of the month `back` months before this one, in UTC: a day already passed. */
const dayIn = (back: number, dayOfMonth: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, dayOfMonth)).toISOString().slice(0, 10);
};

describe('spending insights', () => {
  it("sums one's shares across one's groups by month, currency and category, in a stated order", async () => {
    const ann = await api.person('ann@sums.insights.test');
    const bob = await api.person('bob@sums.insights.test');
    const [early, late] = [dayIn(2, 10), dayIn(1, 12)];
    const flat = await api.groupOf(ann, [bob]);
    const trip = await api.create('/groups', ann.token, { name: 'Zurich', currency: 'CHF' });
    await api.join(bob, await api.invite(ann, trip));
    const old = await api.groupOf(bob, [ann]);
    const spend = (group: string, date: string, category: string, body: object) =>
      api.expense(bob, group, { date, category, ...body });

    // The flat, in euros.
    await spend(flat, early, 'groceries', { amount: 800, splitBetween: [ann.id, bob.id] });
    await spend(flat, late, 'groceries', { amount: 700, splitBetween: [bob.id, ann.id] });
    await spend(flat, late, 'rent', {
      amount: 1000,
      splitExactly: [
        { memberId: bob.id, amount: 400 },
        { memberId: ann.id, amount: 600 },
      ],
    });
    // A share of 0 makes no line, and a deleted expense counts for nothing.
    await spend(flat, late, 'utilities', {
      amount: 500,
      splitExactly: [
        { memberId: bob.id, amount: 500 },
        { memberId: ann.id, amount: 0 },
      ],
    });
    const deleted = await spend(flat, late, 'leisure', { amount: 300, splitBetween: [bob.id, ann.id] });
    await api.done('DELETE', `/expenses/${deleted}`, bob.token);
    // The trip, in Swiss francs; a dinner paid in euros counts in francs.
    await spend(trip, late, 'travel', { amount: 5000, splitBetween: [bob.id, ann.id] });
    await api.expense(bob, trip, {
      date: late,
      category: 'food',
      original: { currency: 'EUR', amount: 1000, rate: '0.9' },
      splitBetween: [bob.id, ann.id],
    });
    // A group Ann has left counts for nothing for her, and still does for Bob.
    await spend(old, late, 'leisure', { amount: 600, splitBetween: [bob.id, ann.id] });
    await api.done('POST', `/groups/${old}/leave`, ann.token);

    const [m1, m2] = [early.slice(0, 7), late.slice(0, 7)];
    expect(await api.list('/accounts/me/insights', ann.token)).toEqual([
      { month: m1, currency: 'EUR', category: 'groceries', amount: 400 },
      { month: m2, currency: 'CHF', category: 'food', amount: 450 },
      { month: m2, currency: 'CHF', category: 'travel', amount: 2500 },
      { month: m2, currency: 'EUR', category: 'groceries', amount: 350 },
      { month: m2, currency: 'EUR', category: 'rent', amount: 600 },
    ]);
    expect(await api.list('/accounts/me/insights', bob.token)).toEqual([
      { month: m1, currency: 'EUR', category: 'groceries', amount: 400 },
      { month: m2, currency: 'CHF', category: 'food', amount: 450 },
      { month: m2, currency: 'CHF', category: 'travel', amount: 2500 },
      { month: m2, currency: 'EUR', category: 'groceries', amount: 350 },
      { month: m2, currency: 'EUR', category: 'rent', amount: 400 },
      { month: m2, currency: 'EUR', category: 'utilities', amount: 500 },
      { month: m2, currency: 'EUR', category: 'leisure', amount: 300 },
    ]);
  }, 60000);

  it('reads each person their own insights only', async () => {
    const cy = await api.person('cy@own.insights.test');
    const dan = await api.person('dan@own.insights.test');
    const groupId = await api.groupOf(cy, [dan]);
    await api.expense(cy, groupId, { amount: 400, splitBetween: [cy.id] });
    expect(await api.list('/accounts/me/insights', dan.token)).toEqual([]);
    expect((await api.list('/accounts/me/insights', cy.token)).map(each => each.amount)).toEqual([400]);
    expect(await api.hidden('/accounts/me/insights')).toBe(401);
    expect(await api.hidden('/accounts/me/insights', 'not-a-token')).toBe(401);
  }, 60000);
});
