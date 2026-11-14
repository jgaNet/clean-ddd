import { bySweep, client, Client, database, eventually, Json, Person, Running, sleep, start, stop } from './tally';

/** Request 36: each kind of notice, on or off, for each person. */
const PERIOD = 3;
const db = database('preferences');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { REMINDER_PERIOD_SECONDS: String(PERIOD) });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const ALL_ON = [
  { kind: 'expense', enabled: true },
  { kind: 'reminder', enabled: true },
  { kind: 'budget', enabled: true },
];
const turn = (who: Person, kind: string, enabled: boolean) =>
  api.done('PUT', `/accounts/me/notice-preferences/${kind}`, who.token, { enabled });
const preferences = (who: Person) => api.list('/accounts/me/notice-preferences', who.token);
const ofKind = async (who: Person, kind: string, groupId: string) =>
  (await api.notices(who.token)).filter(each => each.kind === kind && each.groupId === groupId);

describe('notice preferences', () => {
  it('reads every kind of notice on until a person turns it off, to that person only', async () => {
    const ann = await api.person('ann@read.preferences.test');
    const bob = await api.person('bob@read.preferences.test');
    expect(await preferences(ann)).toEqual(ALL_ON);
    await turn(ann, 'budget', false);
    await turn(ann, 'expense', false);
    expect(await preferences(ann)).toEqual([
      { kind: 'expense', enabled: false },
      { kind: 'reminder', enabled: true },
      { kind: 'budget', enabled: false },
    ]);
    await turn(ann, 'expense', true);
    expect((await preferences(ann)).map(each => each.enabled)).toEqual([true, true, false]);
    expect(await preferences(bob)).toEqual(ALL_ON);
    expect(await api.refused('PUT', '/accounts/me/notice-preferences/settlement', ann.token, { enabled: false })).toBe(
      true,
    );
    expect((await api.call('PUT', '/accounts/me/notice-preferences/budget', ann.token, { enabled: 'no' })).status).toBe(
      400,
    );
    expect((await api.call('PUT', '/accounts/me/notice-preferences/budget', ann.token, {})).status).toBe(400);
    expect((await api.call('PUT', '/accounts/me/notice-preferences/budget', undefined, { enabled: true })).status).toBe(
      401,
    );
    expect(await api.hidden('/accounts/me/notice-preferences')).toBe(401);
    expect((await preferences(ann)).map(each => each.enabled)).toEqual([true, true, false]);
  }, 60000);

  it('makes no notice of a kind a person turned off, and makes them again once it is on', async () => {
    const [ann, bob, cy] = await Promise.all(
      ['ann', 'bob', 'cy'].map(name => api.person(`${name}@kinds.preferences.test`)),
    );
    const groupId = await api.groupOf(ann, [bob, cy]);
    await turn(bob, 'expense', false);
    const first = await api.expense(ann, groupId, { amount: 300, splitBetween: [ann.id, bob.id, cy.id] });
    // Cy is told; Bob, who turned expenses off, is not.
    await eventually(
      () => ofKind(cy, 'expense', groupId),
      each => each.length === 1,
    );
    await sleep(2000);
    expect(await ofKind(bob, 'expense', groupId)).toEqual([]);
    await turn(bob, 'expense', true);
    const second = await api.expense(ann, groupId, { amount: 600, splitBetween: [ann.id, bob.id, cy.id] });
    const bobs = await eventually(
      () => ofKind(bob, 'expense', groupId),
      each => each.length === 1,
    );
    expect(bobs.map(each => each.expenseId)).toEqual([second]);
    expect((await ofKind(cy, 'expense', groupId)).map(each => each.expenseId)).toEqual([second, first]);

    // A budget passed: Cy turned budgets off, so Ann and Bob are told, and Cy is not.
    await turn(cy, 'budget', false);
    await api.done('PUT', `/groups/${groupId}/budgets/groceries`, ann.token, { amount: 100 });
    await api.expense(bob, groupId, { amount: 300, category: 'groceries', splitBetween: [bob.id, cy.id] });
    for (const who of [ann, bob])
      expect(
        await eventually(
          () => ofKind(who, 'budget', groupId),
          each => each.length === 1,
        ),
      ).toHaveLength(1);
    await sleep(2000);
    expect(await ofKind(cy, 'budget', groupId)).toEqual([]);
    // Turned on again in the same month, Cy is not told what was missed, and the month is told once.
    await turn(cy, 'budget', true);
    await api.expense(bob, groupId, { amount: 300, category: 'groceries', splitBetween: [bob.id, cy.id] });
    await sleep(3000);
    expect(await ofKind(cy, 'budget', groupId)).toEqual([]);
    expect(await ofKind(ann, 'budget', groupId)).toHaveLength(1);
  }, 90000);

  it('reminds nobody who turned reminders off, and reminds them at a later run once they are on', async () => {
    const [ann, bob, cy] = await Promise.all(
      ['ann', 'bob', 'cy'].map(name => api.person(`${name}@reminders.preferences.test`)),
    );
    const groupId = await api.groupOf(ann, [bob, cy]);
    await turn(bob, 'reminder', false);
    // Bob and Cy each owe 2500, more than 2000.
    await api.expense(ann, groupId, {
      amount: 5000,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: bob.id, amount: 2500 },
        { memberId: cy.id, amount: 2500 },
      ],
    });
    // Cy is reminded, and again a period later; Bob never, while it is off.
    const cys: Json[] = await eventually(
      () => ofKind(cy, 'reminder', groupId),
      each => each.length >= 2,
      bySweep(2 * PERIOD),
    );
    expect(cys.length).toBeGreaterThanOrEqual(2);
    expect(await ofKind(bob, 'reminder', groupId)).toEqual([]);
    const since = Date.now();
    await turn(bob, 'reminder', true);
    const bobs = await eventually(
      () => ofKind(bob, 'reminder', groupId),
      each => each.length >= 1,
      bySweep(0),
    );
    expect(bobs).toHaveLength(1);
    expect(bobs[0]).toMatchObject({ kind: 'reminder', groupId, amount: 2500 });
    expect(new Date(String(bobs[0].at)).getTime()).toBeGreaterThanOrEqual(since - 1000);
    // Turned off by Ann, nothing changes for the others.
    await turn(ann, 'reminder', false);
    const more = await eventually(
      () => ofKind(cy, 'reminder', groupId),
      each => each.length > cys.length,
      bySweep(PERIOD),
    );
    expect(more.length).toBeGreaterThan(cys.length);
  }, 90000);
});
