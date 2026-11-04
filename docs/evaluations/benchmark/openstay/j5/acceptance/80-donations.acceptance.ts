import {
  adminEnvironment,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking, ProviderPayment } from './provider';

/**
 * Request 80: a donation is a payment of its own at the provider, under `donation:<id>`, asked once
 * even across kills; paid or failed as the provider says; never a booking's money, never a receipt,
 * never paid out; counted by the day's reconciliation; refused without a provider; read by its donor only.
 */
const db = database('donations');
const provider = paymentProvider();
const ADA = 'ada@donations.test';
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { ...(await provider.environment()), ...adminEnvironment(ADA), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const reference = (id: string) => `donation:${id}`;
const donationOf = (id: string, token: string, on = api) => on.read(`/donations/${id}`, token);
const donationPayments = () => [...provider.payments.values()].filter(each => each.reference.startsWith('donation:'));
/** Gives `body` as `token`, and waits for the provider's payment of it: the donation's id and that payment. */
async function give(
  token: string,
  body: Json,
  on = api,
  at = provider,
): Promise<{ id: string; payment: ProviderPayment }> {
  const id = await on.create('/donations', token, body);
  const [payment] = await eventually(
    async () => at.paymentFor(reference(id)),
    found => found.length > 0,
  );
  if (!payment) throw new Error(`the provider was asked for no payment of donation ${id}`);
  return { id, payment };
}
const statusIs = (id: string, token: string, status: string, on = api) =>
  eventually(
    () => donationOf(id, token, on),
    donation => donation.status === status,
  );

describe('donations', () => {
  it('asks the provider for one payment of the amount under donation:<id>, gives its payUrl, and is paid when the provider says so', async () => {
    const tom = await api.traveller('tom@donations.test');
    const { id, payment } = await give(tom.token, { amount: 500 });
    expect(payment).toMatchObject({ amount: 500, reference: reference(id) });
    const pending = await eventually(
      () => donationOf(id, tom.token),
      donation => donation.payUrl === `https://provider.test/pay/${payment.id}`,
    );
    expect(pending).toMatchObject({
      id,
      amount: 500,
      bookingId: null,
      public: false,
      name: null,
      status: 'pending',
      payUrl: `https://provider.test/pay/${payment.id}`,
      fee: 0,
    });

    provider.pay(payment.id);
    expect(await statusIs(id, tom.token, 'paid')).toMatchObject({ status: 'paid', amount: 500, fee: feeOf(500) });
    const smallest = await give(tom.token, { amount: 100 });
    expect(smallest.payment.amount).toBe(100);
    expect(provider.paymentFor(reference(id))).toHaveLength(1);
    const mine = await api.list('/donations/mine', tom.token);
    expect(mine.map(each => each.id)).toEqual([smallest.id, id]);
    expect(mine[1]).toMatchObject({ status: 'paid', amount: 500 });
  }, 60000);

  it("refuses less than 100 cents, a public donation without a proper name, a booking that is not the donor's, and anyone not signed in", async () => {
    const hal = await api.host('hal2@donations.test');
    const una = await api.traveller('una2@donations.test');
    const tom = await api.traveller('tom2@donations.test');
    const listingId = await api.listing(hal.token);
    const hers = await api.book(una.token, await api.quote(una.token, listingId, day(30), day(31)));
    const asked = donationPayments().length;
    for (const body of [
      { amount: 99 },
      { amount: 0 },
      { amount: 500, public: true },
      { amount: 500, public: true, name: '' },
      { amount: 500, public: true, name: '    ' },
      { amount: 500, public: true, name: 'x'.repeat(101) },
      { amount: 500, bookingId: hers },
      { amount: 500, bookingId: 'no-such-booking' },
    ])
      expect(await api.refused('POST', '/donations', tom.token, body)).toBe(true);
    expect(await api.refused('POST', '/donations', undefined, { amount: 500 })).toBe(true);
    expect(await api.list('/donations/mine', tom.token)).toEqual([]);
    await sleep(1000);
    expect(donationPayments()).toHaveLength(asked);

    const named = await give(tom.token, { amount: 1000, public: true, name: 'x'.repeat(100) });
    expect(await donationOf(named.id, tom.token)).toMatchObject({ public: true, name: 'x'.repeat(100) });
    const unnamed = await give(tom.token, { amount: 1000, public: false });
    expect(await donationOf(unnamed.id, tom.token)).toMatchObject({ public: false, name: null });
  }, 60000);

  it('is failed when the provider says so, given again as a new donation, and paid once whatever the webhooks do', async () => {
    const tom = await api.traveller('tom3@donations.test');
    const failed = await give(tom.token, { amount: 700 });
    provider.fail(failed.payment.id);
    expect(await statusIs(failed.id, tom.token, 'failed')).toMatchObject({ status: 'failed', fee: 0 });

    provider.state.twice = true;
    try {
      const again = await give(tom.token, { amount: 700 });
      expect(again.id).not.toBe(failed.id);
      expect(again.payment.id).not.toBe(failed.payment.id);
      const event = provider.pay(again.payment.id)!;
      expect(await statusIs(again.id, tom.token, 'paid')).toMatchObject({ status: 'paid', fee: feeOf(700) });
      await provider.settled();
      provider.resend(event);
      // A failure after the success changes nothing: paid is final.
      expect(
        await provider.signed('payment.failed', { ...again.payment, status: 'failed', reason: 'card_declined' }),
      ).toBeLessThan(300);
      await provider.settled();
      await sleep(1000);
      expect(await donationOf(again.id, tom.token)).toMatchObject({ status: 'paid', amount: 700, fee: feeOf(700) });
      expect(await donationOf(failed.id, tom.token)).toMatchObject({ status: 'failed' });
    } finally {
      provider.state.twice = false;
    }
  }, 60000);

  it('beside a booking, changes nothing the booking shows or owes, takes no receipt and is paid out to nobody', async () => {
    const hal = await api.host('hal4@donations.test');
    const tom = await api.traveller('tom4@donations.test');
    const account = await enabledAccount(api, provider, hal.token);
    const tonight = await api.listing(hal.token);
    const later = await api.listing(hal.token);
    const first = await api.book(tom.token, await api.quote(tom.token, tonight, day(0), day(1)));
    const donation = await give(tom.token, { amount: 2500, bookingId: first });
    expect(await donationOf(donation.id, tom.token)).toMatchObject({ bookingId: first, amount: 2500 });
    const owed = await api.read(`/bookings/${first}`, tom.token);
    expect(owed).toMatchObject({ total: 12000, payment: { status: 'due', amount: 12000, fee: 0 } });

    await payBooking(api, provider, tom.token, first);
    provider.pay(donation.payment.id);
    await statusIs(donation.id, tom.token, 'paid');
    const second = await api.book(tom.token, await api.quote(tom.token, later, day(5), day(6)));
    await payBooking(api, provider, tom.token, second);
    await sleep(2000);

    const booking = await api.read(`/bookings/${first}`, tom.token);
    expect(booking).toMatchObject({
      total: 12000,
      payment: { status: 'paid', amount: 12000, fee: feeOf(12000), refunded: 0 },
    });
    expect((booking.lines as Json[]).filter(line => line.for === 'platform').map(line => line.amount)).toEqual([0]);
    expect(await api.list(`/bookings/${first}/refunds`, tom.token)).toEqual([]);

    // Receipts stay those of the two bookings, numbered without a gap.
    const receipts = await api.list('/receipts/mine', tom.token);
    expect(receipts.map(each => [each.kind, each.bookingId, each.amount])).toEqual([
      ['payment', second, 12000],
      ['payment', first, 12000],
    ]);
    expect(Number(receipts[0].number)).toBe(Number(receipts[1].number) + 1);

    // Paid out: the booking that began, less its fee, and nothing of the donation.
    const DUE = 12000 - feeOf(12000);
    const payouts = await eventually(
      () => api.list('/hosts/me/payouts', hal.token),
      found => found.some(each => each.status === 'paid'),
      20000,
    );
    expect(payouts).toEqual([expect.objectContaining({ bookingIds: [first], amount: DUE, status: 'paid' })]);
    await sleep(2000);
    expect([...provider.payouts.values()].filter(each => each.account === account.id).map(each => each.amount)).toEqual(
      [DUE],
    );

    // Nor on the host's statement or earnings.
    const statement = await api.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}`, hal.token);
    const lines = statement.lines as Json[];
    expect(lines.filter(line => line.type === 'charge').map(line => line.amount)).toEqual([12000, 12000]);
    expect(lines.filter(line => line.type === 'fee').map(line => line.amount)).toEqual([-feeOf(12000), -feeOf(12000)]);
    expect(lines.every(line => line.bookingId === first || line.bookingId === second)).toBe(true);
    const earnings = await api.list(`/hosts/me/earnings?year=${day(0).slice(0, 4)}`, hal.token);
    expect(earnings).toEqual([
      expect.objectContaining({ month: day(0).slice(0, 7), charged: 24000, fees: 2 * feeOf(12000), refunded: 0 }),
    ]);
  }, 120000);

  it('is read by its donor only', async () => {
    const tom = await api.traveller('tom5@donations.test');
    const una = await api.traveller('una5@donations.test');
    const { id } = await give(tom.token, { amount: 300 });
    expect((await api.call('GET', `/donations/${id}`, una.token)).status).toBe(404);
    expect(await api.hidden(`/donations/${id}`)).toBe(true);
    expect(await api.list('/donations/mine', una.token)).toEqual([]);
    expect((await api.list('/donations/mine', tom.token)).map(each => each.id)).toEqual([id]);
  }, 60000);

  it('asks the provider once per donation when the server is killed at any moment', async () => {
    const vic = await api.traveller('vic6@donations.test');
    let token = vic.token;
    const restart = async () => {
      server = await start(db.path, environment);
      provider.attach(server.port);
      api = client(server.port);
      token = await api.login(vic.email);
    };
    // Killed right after the answer, then while the donation is under way.
    await api.create('/donations', token, { amount: 1100 });
    await kill(server);
    await restart();
    for (const delay of [0, 15, 40]) {
      void api.call('POST', '/donations', token, { amount: 1200 + delay }).catch(() => undefined);
      await sleep(delay);
      await kill(server);
      await restart();
    }
    // A donation answered 202 before a kill may be recorded after the start that follows: read once things settle.
    await sleep(3000);
    const mine = await api.list('/donations/mine', token);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    for (const donation of mine) {
      const id = String(donation.id);
      const payments = await eventually(
        async () => provider.paymentFor(reference(id)),
        found => found.length > 0,
        30000,
      );
      expect(payments).toHaveLength(1);
      expect(
        await eventually(
          () => donationOf(id, token),
          read => read.payUrl === `https://provider.test/pay/${payments[0].id}`,
          30000,
        ),
      ).toMatchObject({ status: 'pending', amount: payments[0].amount });
    }
    await sleep(3000);
    for (const donation of await api.list('/donations/mine', token))
      expect(provider.paymentFor(reference(String(donation.id)))).toHaveLength(1);
  }, 180000);

  it("is counted by the day's reconciliation, its charge and fee under its reference", async () => {
    const own = database('donations-reconciliation');
    const outside = paymentProvider();
    const running = await start(own.path, { ...(await outside.environment()), ...adminEnvironment(ADA) });
    outside.attach(running.port);
    try {
      const on = client(running.port);
      const ada = await on.admin(ADA);
      const tom = await on.traveller('tom7@donations.test');
      const paid = await give(tom.token, { amount: 4000 }, on, outside);
      const failed = await give(tom.token, { amount: 900 }, on, outside);
      await give(tom.token, { amount: 800 }, on, outside);
      outside.pay(paid.payment.id);
      outside.fail(failed.payment.id);
      await statusIs(paid.id, tom.token, 'paid', on);
      await statusIs(failed.id, tom.token, 'failed', on);
      await outside.settled();

      const today = day(0);
      expect(
        outside.transactions.filter(each => each.reference === reference(paid.id)).map(each => each.amount),
      ).toEqual([4000, -feeOf(4000)]);
      expect(await on.read(`/admin/reconciliation?date=${today}`, ada.token)).toMatchObject({
        date: today,
        matched: 2,
        mismatches: [],
      });
    } finally {
      await stop(running);
      await outside.close();
      own.remove();
    }
  }, 90000);

  it('is refused without a provider', async () => {
    const own = database('donations-no-provider');
    const running = await start(own.path);
    try {
      const on = client(running.port);
      const tom = await on.traveller('tom8@donations.test');
      expect(await on.refused('POST', '/donations', tom.token, { amount: 500 })).toBe(true);
      expect(await on.list('/donations/mine', tom.token)).toEqual([]);
    } finally {
      await stop(running);
      own.remove();
    }
  }, 60000);
});
