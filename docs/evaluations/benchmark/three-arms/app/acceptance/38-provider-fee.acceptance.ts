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

/** Request 38: who bears the provider's fee, as the group's owner decides; a settlement keeps the fee it was asked with. */
const db = database('fee');
let provider: PaymentProvider;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  server = await start(db.path, await provider.environment());
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});
afterEach(() => {
  provider.state.fee = 0;
});

/** A group Ann owns and is paid in, where Bob owes her 300: Ann paid 600 for the two of them. */
async function owing(ann: Person, bob: Person) {
  const groupId = await api.groupOf(ann, [bob]);
  await api.expense(ann, groupId, { amount: 600, splitBetween: [ann.id, bob.id] });
  return groupId;
}

/** Ann and Bob, Ann paid through the provider. */
async function two(tag: string) {
  const ann = await api.person(`ann@${tag}.fee.test`);
  const bob = await api.person(`bob@${tag}.fee.test`);
  await payable(api, ann, provider);
  return { ann, bob };
}

describe("who bears the provider's fee", () => {
  it("lets the group's owner decide who bears the provider's fee, the payee until then", async () => {
    const { ann, bob } = await two('policy');
    const groupId = await owing(ann, bob);
    const policy = `/groups/${groupId}/fee-policy`;
    expect(await api.read(policy, bob.token)).toEqual({ borneBy: 'payee' });
    expect(await api.refused('PUT', policy, bob.token, { borneBy: 'payer' })).toBe(true);
    for (const borneBy of ['payer', 'shared', 'payee', 'shared']) {
      await api.done('PUT', policy, ann.token, { borneBy });
      expect(await api.read(policy, bob.token)).toEqual({ borneBy });
    }
    expect(await api.refused('PUT', policy, ann.token, { borneBy: 'nobody' })).toBe(true);
    expect((await api.call('PUT', policy, ann.token, { borneBy: 42 })).status).toBe(400);
    expect((await api.call('PUT', policy, ann.token, {})).status).toBe(400);
    expect(await api.read(policy, ann.token)).toEqual({ borneBy: 'shared' });
    const out = await api.person('out@policy.fee.test');
    expect(await api.hidden(policy, out.token)).toBe(404);
    expect(await api.hidden(policy)).toBe(401);
    expect(await api.refused('PUT', policy, out.token, { borneBy: 'payer' })).toBe(true);
  }, 60000);

  it('settles a payment through the provider by its amount less the part of the fee its payer bears', async () => {
    const { ann, bob } = await two('settles');
    provider.state.fee = 31;
    const cases: [string, number][] = [
      ['payee', 300],
      ['payer', 269],
      ['shared', 285],
    ];
    for (const [borneBy, settles] of cases) {
      const groupId = await owing(ann, bob);
      await api.done('PUT', `/groups/${groupId}/fee-policy`, ann.token, { borneBy });
      const id = await api.payThrough(bob, groupId, ann, 300);
      // The provider is asked for the amount; while it waits, what Bob still owes is what it will not settle.
      expect(provider.paymentFor(id).body).toMatchObject({ reference: id, amount: 300, currency: 'EUR' });
      const pending = await api.settlement(id, bob.token);
      expect(pending).toMatchObject({ amount: 300, status: 'pending', fee: { amount: 31, borneBy } });
      expect(await api.list(`/groups/${groupId}/settlements/suggested`, ann.token)).toEqual(
        settles === 300 ? [] : [{ from: bob.id, to: ann.id, amount: 300 - settles }],
      );
      await provider.webhook(api, provider.paymentFor(id).id, 'succeeded');
      expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300 - settles, [bob.id]: settles - 300 });
      expect(await api.settlement(id, ann.token)).toMatchObject({
        amount: 300,
        status: 'paid',
        fee: { amount: 31, borneBy },
      });
      expect((await api.list(`/groups/${groupId}/audit`, ann.token)).at(-1)).toMatchObject({
        action: 'settlement-paid',
        subjectId: id,
        amount: settles,
      });
      const statement = await api.read(`/groups/${groupId}/members/${bob.id}/statement`, ann.token);
      expect((statement.entries as Json[]).at(-1)).toMatchObject({ settlementId: id, paid: settles, share: 0 });
      // A refund gives back what it settled.
      await api.done('POST', `/settlements/${id}/refund`, ann.token);
      await provider.webhook(api, provider.paymentFor(id).id, 'refunded');
      expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: -300 });
    }
    // A settlement in cash has no fee.
    const groupId = await owing(ann, bob);
    const cash = await api.cash(ann, groupId, bob, 300);
    expect((await api.settlement(cash, ann.token)).fee).toBeUndefined();
  }, 90000);

  it('keeps on a settlement the fee and who bore it when it was asked for', async () => {
    const { ann, bob } = await two('kept');
    const groupId = await owing(ann, bob);
    await api.done('PUT', `/groups/${groupId}/fee-policy`, ann.token, { borneBy: 'payer' });
    provider.state.fee = 20;
    const id = await api.payThrough(bob, groupId, ann, 200);
    await api.done('PUT', `/groups/${groupId}/fee-policy`, ann.token, { borneBy: 'payee' });
    provider.state.fee = 50;
    await provider.webhook(api, provider.paymentFor(id).id, 'succeeded');
    expect(await api.settlement(id, bob.token)).toMatchObject({ amount: 200, fee: { amount: 20, borneBy: 'payer' } });
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 120, [bob.id]: -120 });
    // A payment asked for now, Ann bearing the fee, settles what it asks.
    const next = await api.payThrough(bob, groupId, ann, 120);
    await provider.webhook(api, provider.paymentFor(next).id, 'succeeded');
    expect(await api.settlement(next, bob.token)).toMatchObject({ amount: 120, fee: { amount: 50, borneBy: 'payee' } });
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0 });
  }, 60000);

  it('refuses a payment when the provider says no fee, or a fee not less than the amount, and keeps nothing', async () => {
    const { ann, bob } = await two('refused');
    const groupId = await owing(ann, bob);
    for (const fee of [null, 300, 301]) {
      provider.state.fee = fee;
      expect(
        await api.refused('POST', `/groups/${groupId}/settlements/provider`, bob.token, { to: ann.id, amount: 300 }),
      ).toBe(true);
    }
    expect(await api.list(`/groups/${groupId}/settlements`, ann.token)).toEqual([]);
    provider.state.fee = 299;
    const id = await api.payThrough(bob, groupId, ann, 300);
    expect((await api.settlement(id, ann.token)).fee).toEqual({ amount: 299, borneBy: 'payee' });
  }, 60000);
});
