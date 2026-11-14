import {
  client,
  Client,
  database,
  Json,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  start,
  stop,
} from './tally';

/** Request 33: a settlement through the provider contested by its payee, held until an administrator decides. */
const db = database('contest');
let provider: PaymentProvider;
let server: Running;
let api: Client;
let admin: Person;
let root: Person;
beforeAll(async () => {
  provider = paymentProvider();
  // Two administrators, the second written in another case than the email it signs up with.
  server = await start(db.path, {
    ...(await provider.environment()),
    ADMIN_EMAILS: 'admin@contest.test, Root@Contest.test',
  });
  api = client(server.port);
  admin = await api.person('admin@contest.test');
  root = await api.person('root@contest.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

/** Ann paid 900 for Ann, Bob and Cy, and is paid through the provider: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string) {
  const [ann, bob, cy] = await Promise.all(['ann', 'bob', 'cy'].map(name => api.person(`${name}@${tag}.contest.test`)));
  const groupId = await api.groupOf(ann, [bob, cy]);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  await payable(api, ann, provider);
  return { ann, bob, cy, groupId };
}

/** `payer` pays Ann 300 through the provider, and the provider says it succeeded. */
async function paid(groupId: string, payer: Person, ann: Person) {
  const id = await api.payThrough(payer, groupId, ann, 300);
  await provider.webhook(api, provider.paymentFor(id).id, 'succeeded');
  return id;
}

const statuses = (settlement: Json) => (settlement.history as Json[]).map(each => each.status);

describe('contest a settlement', () => {
  it("holds a contested settlement's effect on the balances until an administrator decides it was paid", async () => {
    const { ann, bob, cy, groupId } = await flat('held');
    const id = await paid(groupId, bob, ann);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 });
    expect(await api.refused('POST', `/settlements/${id}/contest`, bob.token)).toBe(true);
    expect(await api.refused('POST', `/settlements/${id}/contest`, cy.token)).toBe(true);
    expect((await api.call('POST', `/settlements/${id}/contest`)).status).toBe(401);

    await api.done('POST', `/settlements/${id}/contest`, ann.token);
    const contested = await api.settlement(id, cy.token);
    expect(contested).toMatchObject({
      id,
      method: 'provider',
      status: 'contested',
      amount: 300,
      from: bob.id,
      to: ann.id,
    });
    expect(statuses(contested)).toEqual(['pending', 'paid', 'contested']);
    // Not counted, and still waiting: Bob owes 300 again, which he is not asked twice.
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });
    expect(await api.list(`/groups/${groupId}/settlements/suggested`, bob.token)).toEqual([
      { from: cy.id, to: ann.id, amount: 300 },
    ]);
    expect(
      await api.refused('POST', `/groups/${groupId}/settlements/cash`, ann.token, { from: bob.id, amount: 1 }),
    ).toBe(true);
    expect(await api.refused('POST', `/groups/${groupId}/leave`, bob.token)).toBe(true);
    expect(await api.refused('POST', `/settlements/${id}/refund`, ann.token)).toBe(true);
    expect(await api.refused('POST', `/settlements/${id}/contest`, ann.token)).toBe(true);
    const audit = await api.list(`/groups/${groupId}/audit`, cy.token);
    expect(audit.at(-1)).toMatchObject({ action: 'settlement-contested', by: ann.id, subjectId: id, amount: 300 });
    // A webhook about its payment changes nothing while it is contested.
    expect((await provider.webhook(api, provider.paymentFor(id).id, 'refunded')).accepted).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('contested');

    // Only administrators read the contests, and decide them.
    const contests = await api.list('/admin/contests', admin.token);
    expect(contests.find(each => each.id === id)).toEqual(await api.settlement(id, ann.token));
    expect(await api.hidden('/admin/contests', ann.token)).toBe(404);
    expect(await api.hidden('/admin/contests')).toBe(401);
    expect(await api.refused('POST', `/admin/settlements/${id}/decision`, ann.token, { paid: false })).toBe(true);
    expect((await api.call('POST', `/admin/settlements/${id}/decision`, admin.token, { paid: 'yes' })).status).toBe(
      400,
    );
    expect((await api.settlement(id, ann.token)).status).toBe('contested');

    await api.done('POST', `/admin/settlements/${id}/decision`, admin.token, { paid: true });
    const decided = await api.settlement(id, bob.token);
    expect(decided.status).toBe('paid');
    expect(statuses(decided)).toEqual(['pending', 'paid', 'contested', 'paid']);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 });
    expect((await api.list(`/groups/${groupId}/audit`, cy.token)).at(-1)).toMatchObject({
      action: 'settlement-paid',
      by: admin.id,
      subjectId: id,
      amount: 300,
    });
    expect((await api.list('/admin/contests', root.token)).find(each => each.id === id)).toBeUndefined();
    // Decided once, contested once.
    expect(await api.refused('POST', `/admin/settlements/${id}/decision`, admin.token, { paid: false })).toBe(true);
    expect(await api.refused('POST', `/settlements/${id}/contest`, ann.token)).toBe(true);

    const log = await api.list('/admin/log', root.token);
    const entry = log.find(each => each.subjectId === id);
    expect(entry).toMatchObject({ by: admin.id, action: 'decided-paid', subjectId: id });
    expect(typeof entry?.id).toBe('string');
    expect(entry?.at).toMatch(TIME);
    expect(await api.hidden('/admin/log', ann.token)).toBe(404);
  }, 90000);

  it('annuls a settlement an administrator decides was not paid, and what was owed is owed again', async () => {
    const { ann, cy, bob, groupId } = await flat('annulled');
    const id = await paid(groupId, cy, ann);
    await api.done('POST', `/settlements/${id}/contest`, ann.token);
    await api.done('POST', `/admin/settlements/${id}/decision`, root.token, { paid: false });

    const annulled = await api.settlement(id, cy.token);
    expect(annulled).toMatchObject({ id, status: 'annulled', amount: 300 });
    expect(statuses(annulled)).toEqual(['pending', 'paid', 'contested', 'annulled']);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });
    // No longer waiting: Cy is asked the 300 again, and pays it.
    expect(await api.list(`/groups/${groupId}/settlements/suggested`, ann.token)).toEqual([
      { from: bob.id, to: ann.id, amount: 300 },
      { from: cy.id, to: ann.id, amount: 300 },
    ]);
    const again = await paid(groupId, cy, ann);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: -300, [cy.id]: 0 });
    // Nothing changes it any more.
    await provider.webhook(api, provider.paymentFor(id).id, 'succeeded');
    expect(await api.refused('POST', `/admin/settlements/${id}/decision`, admin.token, { paid: true })).toBe(true);
    expect(await api.refused('POST', `/settlements/${id}/refund`, ann.token)).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('annulled');
    expect((await api.settlement(again, ann.token)).status).toBe('paid');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: -300, [cy.id]: 0 });

    const audit = (await api.list(`/groups/${groupId}/audit`, ann.token)).filter(each => each.subjectId === id);
    expect(audit.map(each => each.action)).toEqual(['settlement-paid', 'settlement-contested']);
    expect((await api.list('/admin/log', admin.token)).find(each => each.subjectId === id)).toMatchObject({
      by: root.id,
      action: 'decided-annulled',
    });
  }, 90000);

  it('lets only the payee contest a paid settlement through the provider', async () => {
    const { ann, bob, cy, groupId } = await flat('refused');
    const cash = await api.cash(ann, groupId, bob, 100);
    const pending = await api.payThrough(cy, groupId, ann, 100);
    // Bob has 200 left to pay; he pays it through the provider, and Ann refunds it.
    const refund = await api.payThrough(bob, groupId, ann, 200);
    await provider.webhook(api, provider.paymentFor(refund).id, 'succeeded');
    await api.done('POST', `/settlements/${refund}/refund`, ann.token);
    for (const id of [cash, pending, refund])
      expect(await api.refused('POST', `/settlements/${id}/contest`, ann.token)).toBe(true);
    expect((await api.settlement(cash, ann.token)).status).toBe('paid');
    expect((await api.settlement(pending, ann.token)).status).toBe('pending');
    expect((await api.settlement(refund, ann.token)).status).toBe('refunding');
    const out = await api.person('out@refused.contest.test');
    expect(await api.refused('POST', `/settlements/${pending}/contest`, out.token)).toBe(true);
    expect(
      await api.refused('POST', '/admin/settlements/no-such-settlement/decision', admin.token, { paid: true }),
    ).toBe(true);
    expect(await api.hidden('/admin/log', out.token)).toBe(404);
  }, 90000);
});
