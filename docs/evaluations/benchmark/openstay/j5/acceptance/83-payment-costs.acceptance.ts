import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  Json,
  PDF,
  restart,
  Running,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking, ProviderPayment } from './provider';

/**
 * Request 83: the cost of payments. Per month, for administrators: the payments through the provider,
 * what they took, their fees and who bore them; the payments declared paid directly, with no fee.
 */
const db = database('payment-costs');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
let ada: { id: string; email: string; token: string };
beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    ...adminEnvironment('ada@payment-costs.test'),
    JOBS_INTERVAL_SECONDS: '1',
    // Unpaid bookings must not lapse while OpenStay's date moves to next month (request 30).
    PAYMENT_TTL_SECONDS: String(90 * 86_400),
  };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  ada = await api.admin('ada@payment-costs.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const thisMonth = () => new Date().toISOString().slice(0, 7);
const costs = (month: string, token = ada.token) => api.read(`/admin/payment-costs?month=${month}`, token);
const paymentOf = async (bookingId: string, token: string) =>
  (await api.read(`/bookings/${bookingId}`, token)).payment as Json;

async function donate(token: string, amount: number) {
  const id = await api.create('/donations', token, { amount });
  const [payment] = await eventually(
    async () => provider.paymentFor(`donation:${id}`),
    found => found.length > 0,
  );
  if (!payment) throw new Error(`OpenStay asked the provider for no payment of donation ${id}`);
  return { id, payment };
}
const donationReads = (id: string, token: string, status: string) =>
  eventually(
    () => api.read(`/donations/${id}`, token),
    donation => donation.status === status,
  );

describe('the cost of payments', () => {
  it('answers administrators only, zeros for a month with nothing, and 400 without a valid month', async () => {
    const hal = await api.host('hal@payment-costs.test');
    const tom = await api.traveller('tom@payment-costs.test');
    expect(await costs('2001-01')).toMatchObject({
      month: '2001-01',
      provider: { payments: 0, amount: 0, fees: 0, boreByHost: 0, boreByOpenStay: 0 },
      direct: { payments: 0, amount: 0, fees: 0 },
    });
    for (const token of [hal.token, tom.token])
      expect((await api.call('GET', `/admin/payment-costs?month=${thisMonth()}`, token)).status).toBe(403);
    for (const query of ['', '?month=2026-13', '?month=202610', '?month=now'])
      expect((await api.call('GET', `/admin/payment-costs${query}`, ada.token)).status).toBe(400);
  }, 60000);

  it("counts the month's successful payments, their fees borne by the host or by OpenStay, and the direct ones at no fee", async () => {
    const hal = await api.host('hal2@payment-costs.test');
    const tom = await api.traveller('tom2@payment-costs.test');
    const una = await api.traveller('una2@payment-costs.test');
    const listingId = await api.listing(hal.token);
    const book = async (from: number, to: number) =>
      api.book(tom.token, await api.quote(tom.token, listingId, day(from), day(to)));

    // Paid: 22 000. Paid and then cancelled by the traveller, refunded in full: the fee stays the host's.
    const paid = await book(10, 12);
    const first = await payBooking(api, provider, tom.token, paid);
    const cancelled = await book(20, 21);
    const second = await payBooking(api, provider, tom.token, cancelled);
    await api.done('POST', `/bookings/${cancelled}/cancel`, tom.token);
    await eventually(
      () => api.read(`/bookings/${cancelled}`, tom.token),
      booking => (booking.refund as Json | undefined)?.status === 'refunded',
    );
    // A payment that failed, and one still under way, count nothing.
    const failed = await book(30, 31);
    await api.done('POST', `/bookings/${failed}/pay`, tom.token);
    provider.fail(provider.paymentFor(failed)[0].id);
    await eventually(
      () => paymentOf(failed, tom.token),
      payment => payment.status === 'due',
    );
    const underWay = await book(40, 41);
    await api.done('POST', `/bookings/${underWay}/pay`, tom.token);
    // A donation paid: its fee is OpenStay's. One failed counts nothing.
    const gift = await donate(una.token, 5000);
    provider.pay(gift.payment.id);
    await donationReads(gift.id, una.token, 'paid');
    const refused = await donate(una.token, 3000);
    provider.fail(refused.payment.id);
    await donationReads(refused.id, una.token, 'failed');
    // Declared paid by the host (request 36), and a transfer the host confirmed (request 73).
    const declared = await book(50, 51);
    await api.done('POST', `/bookings/${declared}/declare-paid`, hal.token);
    const transferred = await book(60, 62);
    const proof = await api.upload(`/bookings/${transferred}/transfer-proof`, tom.token, PDF, 'transfer.pdf');
    expect(proof.accepted).toBe(true);
    await api.done('POST', `/bookings/${transferred}/transfer/confirm`, hal.token);
    expect(await paymentOf(transferred, hal.token)).toMatchObject({ status: 'declared' });

    const byHost = [first, second].reduce((sum, payment: ProviderPayment) => sum + payment.fee, 0);
    const byOpenStay = gift.payment.fee;
    const month = thisMonth();
    const read = await eventually(
      () => costs(month),
      found => (found.provider as Json)?.payments === 3 && (found.direct as Json)?.payments === 2,
    );
    expect(read).toMatchObject({
      month,
      provider: {
        payments: 3,
        amount: 22000 + 12000 + 5000,
        fees: byHost + byOpenStay,
        boreByHost: byHost,
        boreByOpenStay: byOpenStay,
      },
      direct: { payments: 2, amount: 12000 + 22000, fees: 0 },
    });
  }, 120000);

  it('counts a payment in the month the provider said it succeeded, and a declaration in the month it was made', async () => {
    const hal = await api.host('hal3@payment-costs.test');
    const tom = await api.traveller('tom3@payment-costs.test');
    const listingId = await api.listing(hal.token);
    const month = thisMonth();
    const throughProvider = await api.book(tom.token, await api.quote(tom.token, listingId, day(70), day(71)));
    const direct = await api.book(tom.token, await api.quote(tom.token, listingId, day(80), day(81)));
    const before = await costs(month);

    const now = new Date();
    const firstOfNext = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const days = Math.ceil((firstOfNext - now.getTime()) / 86_400_000);
    const next = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 7);
    server = await restart(server, db.path, { ...environment, ...clock(days) });
    provider.attach(server.port);
    api = client(server.port);
    const traveller = await api.login(tom.email);
    const host = await api.login(hal.email);
    const admin = await api.login(ada.email);
    const payment = await payBooking(api, provider, traveller, throughProvider);
    await api.done('POST', `/bookings/${direct}/declare-paid`, host);

    expect(
      await eventually(
        () => costs(next, admin),
        found => (found.provider as Json)?.payments === 1 && (found.direct as Json)?.payments === 1,
      ),
    ).toMatchObject({
      month: next,
      provider: { payments: 1, amount: 12000, fees: payment.fee, boreByHost: payment.fee, boreByOpenStay: 0 },
      direct: { payments: 1, amount: 12000, fees: 0 },
    });
    expect(await costs(month, admin)).toMatchObject({ provider: before.provider, direct: before.direct });
  }, 120000);
});
