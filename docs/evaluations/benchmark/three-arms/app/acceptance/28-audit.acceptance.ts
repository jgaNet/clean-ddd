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
  ms,
  payable,
  PaymentProvider,
  paymentProvider,
  Running,
  start,
  stop,
} from './tally';

/** Request 28: a group's audit, every change of money, the oldest first. */
const db = database('audit');
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

/** Four people in a group Ann owns and is paid in: Ann, Bob, Cy and Dan, in that order. */
async function flat(tag: string, through = api) {
  const ann = await through.person(`ann@${tag}.audit.test`);
  const bob = await through.person(`bob@${tag}.audit.test`);
  const cy = await through.person(`cy@${tag}.audit.test`);
  const dan = await through.person(`dan@${tag}.audit.test`);
  const groupId = await through.groupOf(ann, [bob, cy, dan]);
  await payable(through, ann, provider);
  return { ann, bob, cy, dan, groupId };
}

/** The group's audit, each entry as `[action, by, subjectId, amount]`, checking its id and time. */
async function entries(groupId: string, token: string, through = api) {
  const audit = await through.list(`/groups/${groupId}/audit`, token);
  for (const each of audit) {
    expect(typeof each.id).toBe('string');
    expect(each.at).toMatch(TIME);
  }
  expect(new Set(audit.map(each => each.id)).size).toBe(audit.length);
  const times = audit.map(each => ms(each.at));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  return audit.map(each => [each.action, each.by, each.subjectId, each.amount]);
}

describe('an audit of money changes', () => {
  it('writes an entry for every change of money: who made it, when, what and how much, the oldest first', async () => {
    const { ann, bob, cy, dan, groupId } = await flat('changes');
    await payable(api, bob, provider);
    expect(await api.list(`/groups/${groupId}/audit`, ann.token)).toEqual([]);
    const dinner = await api.expense(bob, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
    const edit = (version: number, amount: number, token: string) =>
      api.act('PUT', `/expenses/${dinner}`, token, {
        description: 'Dinner',
        amount,
        date: day(0),
        splitBetween: [ann.id, bob.id, cy.id],
        version,
      });
    expect((await edit(1, 1200, ann.token)).accepted).toBe(true);
    // Refused: a stale version, a settlement of more than is owed. No entry.
    expect((await edit(1, 600, bob.token)).accepted).toBe(false);
    const taxi = await api.expense(cy, groupId, { amount: 300, splitBetween: [cy.id, ann.id] });
    await api.done('DELETE', `/expenses/${taxi}`, cy.token);
    // Bob 800, Ann -400, Cy -400.
    const cash = await api.cash(bob, groupId, cy, 100);
    expect(
      await api.refused('POST', `/groups/${groupId}/settlements/cash`, bob.token, { from: cy.id, amount: 1000 }),
    ).toBe(true);
    // Through the provider: counted when it succeeds, once; a failed payment and a refund asked for change nothing.
    const card = await api.payThrough(cy, groupId, bob, 200);
    const payment = provider.paymentFor(card).id;
    await provider.webhook(api, payment, 'succeeded');
    await provider.webhook(api, payment, 'succeeded');
    const failed = await api.payThrough(ann, groupId, bob, 100);
    await provider.webhook(api, provider.paymentFor(failed).id, 'failed');
    await api.done('POST', `/settlements/${card}/refund`, bob.token);
    await provider.webhook(api, payment, 'refunded');
    await provider.webhook(api, payment, 'refunded');
    // Dan leaves owed 50, which passes to Ann.
    const bread = await api.expense(dan, groupId, { amount: 100, splitBetween: [dan.id, ann.id] });
    await api.done('POST', `/groups/${groupId}/leave`, dan.token);

    expect(await entries(groupId, cy.token)).toEqual([
      ['expense-recorded', bob.id, dinner, 900],
      ['expense-edited', ann.id, dinner, 1200],
      ['expense-recorded', cy.id, taxi, 300],
      ['expense-deleted', cy.id, taxi, 300],
      ['settlement-paid', bob.id, cash, 100],
      ['settlement-paid', cy.id, card, 200],
      ['settlement-refunded', bob.id, card, 200],
      ['expense-recorded', dan.id, bread, 100],
      ['balance-passed', dan.id, dan.id, 50],
    ]);
  }, 60000);

  it('writes an entry for each expense a recurring expense records, by its payer', async () => {
    const { ann, bob, groupId } = await flat('recurring');
    const { startsOn, passed } = monthly(-40);
    await api.create(`/groups/${groupId}/recurring`, bob.token, {
      description: 'Rent',
      amount: 400,
      startsOn,
      splitBetween: [bob.id, ann.id],
    });
    const listed = await eventually(
      () => api.list(`/groups/${groupId}/expenses`, ann.token),
      each => each.length >= passed.length,
      bySweep(0),
    );
    expect((await entries(groupId, ann.token)).sort()).toEqual(
      listed.map(each => ['expense-recorded', bob.id, each.id, 400]).sort(),
    );
  }, 60000);

  it('keeps every entry when its expense is deleted, its member leaves, or the server is killed right after', async () => {
    const { ann, bob, cy, groupId } = await flat('kept');
    const id = await api.expense(cy, groupId, { amount: 300, splitBetween: [cy.id, bob.id, ann.id] });
    await kill(server);
    server = await start(db.path, environment);
    api = client(server.port);
    const token = await api.login(ann.email);
    expect(await entries(groupId, token)).toEqual([['expense-recorded', cy.id, id, 300]]);
    await api.done('DELETE', `/expenses/${id}`, token);
    await api.done('POST', `/groups/${groupId}/leave`, await api.login(cy.email));
    expect(await entries(groupId, token)).toEqual([
      ['expense-recorded', cy.id, id, 300],
      ['expense-deleted', ann.id, id, 300],
    ]);
  }, 90000);

  it('writes one entry for each change, with two servers on one database', async () => {
    const second = await start(db.path, environment);
    try {
      const other = client(second.port);
      const { ann, bob, cy, groupId } = await flat('servers');
      await payable(api, bob, provider);
      const id = await api.expense(bob, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
      const body = (amount: number) => ({
        description: 'Dinner',
        amount,
        date: day(0),
        splitBetween: [ann.id, bob.id, cy.id],
        version: 1,
      });
      const [first, next] = await Promise.all([
        api.act('PUT', `/expenses/${id}`, bob.token, body(600)),
        other.act('PUT', `/expenses/${id}`, await other.login(ann.email), body(1200)),
      ]);
      expect([first.accepted, next.accepted].filter(Boolean)).toHaveLength(1);
      const card = await api.payThrough(cy, groupId, bob, 200);
      const payment = provider.paymentFor(card).id;
      await Promise.all([
        provider.webhook(api, payment, 'succeeded', 'wh-at-once'),
        provider.webhook(other, payment, 'succeeded', 'wh-at-once'),
      ]);
      const audit = await entries(groupId, ann.token);
      expect(audit.filter(each => each[0] === 'expense-edited')).toEqual([
        ['expense-edited', first.accepted ? bob.id : ann.id, id, first.accepted ? 600 : 1200],
      ]);
      expect(audit.filter(each => each[0] === 'settlement-paid')).toEqual([['settlement-paid', cy.id, card, 200]]);
    } finally {
      await stop(second);
    }
  }, 90000);

  it('lets the members only read the audit', async () => {
    const { ann, bob, groupId } = await flat('who');
    const out = await api.person('out@who.audit.test');
    const id = await api.expense(bob, groupId, { amount: 100, splitBetween: [bob.id, ann.id] });
    expect(await api.hidden(`/groups/${groupId}/audit`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/audit`)).toBe(401);
    expect(await api.hidden('/groups/no-such-group/audit', ann.token)).toBe(404);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect(await api.hidden(`/groups/${groupId}/audit`, bob.token)).toBe(404);
    const audit: Json[] = await api.list(`/groups/${groupId}/audit`, ann.token);
    expect(audit.map(each => [each.action, each.by, each.subjectId])).toEqual([
      ['expense-recorded', bob.id, id],
      ['balance-passed', bob.id, bob.id],
    ]);
  }, 60000);
});
