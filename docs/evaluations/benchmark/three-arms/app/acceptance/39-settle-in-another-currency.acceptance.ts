import {
  client,
  Client,
  database,
  day,
  idOf,
  Json,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  RatesService,
  ratesService,
  Running,
  start,
  stop,
} from './tally';

/** Request 39: a settlement paid in another currency, at the rate offered when it is decided, kept on it. */
const db = database('settle-currency');
let provider: PaymentProvider;
let rates: RatesService;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  rates = ratesService();
  server = await start(db.path, { ...(await provider.environment()), ...(await rates.environment()) });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  await rates.close();
  db.remove();
});

/** A euro group Ann owns and is paid in, where Bob owes her `owed`: Ann paid twice that for the two of them. */
async function owing(tag: string, owed: number) {
  const ann = await api.person(`ann@${tag}.settle-currency.test`);
  const bob = await api.person(`bob@${tag}.settle-currency.test`);
  const groupId = await api.groupOf(ann, [bob]);
  await api.expense(ann, groupId, { amount: 2 * owed, splitBetween: [ann.id, bob.id] });
  await payable(api, ann, provider);
  return { ann, bob, groupId };
}

const cashIn = (payee: Person, groupId: string, from: Person, currency: string, amount: number) =>
  api.act('POST', `/groups/${groupId}/settlements/cash`, payee.token, {
    from: from.id,
    original: { currency, amount },
  });

describe('settle up in another currency', () => {
  it('settles in cash in another currency at the rate offered when it is recorded, and keeps the rate and both amounts', async () => {
    const { ann, bob, groupId } = await owing('cash', 2000);
    rates.set('CHF', 'EUR', '0.9542', day(0));
    const asked = rates.asked.length;
    const first = await cashIn(ann, groupId, bob, 'CHF', 300);
    expect(first.accepted).toBe(true);
    expect(rates.asked.slice(asked)).toContainEqual({ from: 'CHF', to: 'EUR', date: day(0) });
    // 300 at 0.9542 is 286.26: 286.
    const id = idOf(first.result);
    const read = await api.settlement(id, bob.token);
    expect(read).toMatchObject({
      id,
      groupId,
      from: bob.id,
      to: ann.id,
      amount: 286,
      method: 'cash',
      status: 'paid',
      original: { currency: 'CHF', amount: 300, rate: '0.9542' },
    });
    // The day's rate changes: the next settlement takes it, the first keeps its own. 1000 at 0.9545 is 954.5: 955.
    rates.set('CHF', 'EUR', '0.9545', day(0));
    const second = await cashIn(ann, groupId, bob, 'CHF', 1000);
    expect(second.accepted).toBe(true);
    expect((await api.settlement(id, ann.token)).original).toEqual({ currency: 'CHF', amount: 300, rate: '0.9542' });
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 759, [bob.id]: -759 });
    const statement = await api.read(`/groups/${groupId}/members/${bob.id}/statement`, ann.token);
    expect((statement.entries as Json[]).slice(-2).map(each => each.paid)).toEqual([286, 955]);
    expect((await api.list(`/groups/${groupId}/audit`, ann.token)).slice(-2).map(each => each.amount)).toEqual([
      286, 955,
    ]);
    // One in the group's currency reads as before, without `original`.
    const plain = await api.cash(ann, groupId, bob, 59);
    expect((await api.settlement(plain, ann.token)).original).toBeUndefined();
  }, 60000);

  it('fixes the rate of a payment through the provider when it is asked for, whatever the rate when it lands', async () => {
    const { ann, bob, groupId } = await owing('provider', 500);
    rates.set('USD', 'EUR', '0.92');
    const id = await api.create(`/groups/${groupId}/settlements/provider`, bob.token, {
      to: ann.id,
      original: { currency: 'USD', amount: 200 },
    });
    // The provider is asked for the dollars.
    expect(provider.paymentFor(id).body).toMatchObject({ reference: id, amount: 200, currency: 'USD' });
    expect(await api.settlement(id, ann.token)).toMatchObject({
      amount: 184,
      status: 'pending',
      original: { currency: 'USD', amount: 200, rate: '0.92' },
    });
    // Days later, at another rate, the payment lands: it counts what was decided.
    rates.set('USD', 'EUR', '0.5');
    await provider.webhook(api, provider.paymentFor(id).id, 'succeeded');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 316, [bob.id]: -316 });
    expect((await api.settlement(id, bob.token)).original).toEqual({ currency: 'USD', amount: 200, rate: '0.92' });
    await api.done('POST', `/settlements/${id}/refund`, ann.token);
    await provider.webhook(api, provider.paymentFor(id).id, 'refunded');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 500, [bob.id]: -500 });
    // The provider's fee is in dollars, converted at the settlement's rate: 10 dollar cents at 0.5 are 5 euro cents.
    await api.done('PUT', `/groups/${groupId}/fee-policy`, ann.token, { borneBy: 'payer' });
    provider.state.fee = 10;
    try {
      const next = await api.create(`/groups/${groupId}/settlements/provider`, bob.token, {
        to: ann.id,
        original: { currency: 'USD', amount: 100 },
      });
      expect(await api.settlement(next, ann.token)).toMatchObject({
        amount: 50,
        fee: { amount: 5, borneBy: 'payer' },
        original: { currency: 'USD', amount: 100, rate: '0.5' },
      });
      await provider.webhook(api, provider.paymentFor(next).id, 'succeeded');
      expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 455, [bob.id]: -455 });
    } finally {
      provider.state.fee = 0;
    }
  }, 60000);

  it('refuses a settlement in another currency with no rate offered, or more than is owed once converted, and keeps nothing', async () => {
    const { ann, bob, groupId } = await owing('refused', 500);
    rates.set('CHF', 'EUR', '0.9542');
    const payments = provider.payments.length;
    const refusals: [string, () => ReturnType<Client['act']>][] = [
      ['a currency with no rate offered', () => cashIn(ann, groupId, bob, 'GBP', 100)],
      [
        'through the provider, with no rate offered',
        () =>
          api.act('POST', `/groups/${groupId}/settlements/provider`, bob.token, {
            to: ann.id,
            original: { currency: 'GBP', amount: 100 },
          }),
      ],
      ['more than is owed once converted', () => cashIn(ann, groupId, bob, 'CHF', 600)],
      ["the group's own currency", () => cashIn(ann, groupId, bob, 'EUR', 100)],
      ['a currency Tally does not count in', () => cashIn(ann, groupId, bob, 'XYZ', 100)],
      ['an amount of 0', () => cashIn(ann, groupId, bob, 'CHF', 0)],
    ];
    const accepted: string[] = [];
    for (const [what, act] of refusals) if ((await act()).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    expect(provider.payments.length).toBe(payments);
    // The rates service down: refused too.
    rates.state.refusing = true;
    try {
      expect((await cashIn(ann, groupId, bob, 'CHF', 100)).accepted).toBe(false);
    } finally {
      rates.state.refusing = false;
    }
    const path = `/groups/${groupId}/settlements/cash`;
    for (const body of [
      { from: bob.id },
      { from: bob.id, amount: 100, original: { currency: 'CHF', amount: 100 } },
      { from: bob.id, original: { currency: 'CHF' } },
      { from: bob.id, original: 'CHF 100' },
    ])
      expect((await api.call('POST', path, ann.token, body)).status).toBe(400);
    expect(await api.list(`/groups/${groupId}/settlements`, ann.token)).toEqual([]);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 500, [bob.id]: -500 });
    // 524 francs at 0.9542 are 500.0008: 500, all Bob owes.
    expect((await cashIn(ann, groupId, bob, 'CHF', 524)).accepted).toBe(true);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0 });
  }, 60000);
});
