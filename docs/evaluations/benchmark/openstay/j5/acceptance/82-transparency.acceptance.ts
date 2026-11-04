import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking, ProviderPayment } from './provider';

/**
 * Request 82: transparency indicators. Per month, read by anyone: the bookings confirmed, the provider's
 * fees, the donations, the running costs an administrator entered, and the cost per booking.
 */
const db = database('transparency');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    ...adminEnvironment('ada@transparency.test'),
    JOBS_INTERVAL_SECONDS: '1',
    // Unpaid bookings must not lapse while OpenStay's date moves to next month (request 30).
    PAYMENT_TTL_SECONDS: String(90 * 86_400),
  };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const thisMonth = () => new Date().toISOString().slice(0, 7);
const page = (month: string) => api.read(`/transparency?month=${month}`);
/** `amount` ÷ `count`, rounded half up to the cent. */
const halfUp = (amount: number, count: number) => Math.floor((2 * amount + count) / (2 * count));

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

let ada: { id: string; email: string; token: string };

describe('transparency indicators', () => {
  it('lets only an administrator enter running costs, replaces them, and writes each entry in the audit log', async () => {
    ada = await api.admin('ada@transparency.test');
    const hal = await api.host('hal@transparency.test');
    const tom = await api.traveller('tom@transparency.test');
    const month = '2025-10';
    expect(await page(month)).toMatchObject({
      month,
      bookings: 0,
      providerFees: 0,
      donations: 0,
      runningCosts: 0,
      costPerBooking: null,
    });

    await api.done('PUT', `/admin/running-costs/${month}`, ada.token, { amount: 40000 });
    expect(await page(month)).toMatchObject({ month, runningCosts: 40000, costPerBooking: null });
    await api.done('PUT', `/admin/running-costs/${month}`, ada.token, { amount: 45000 });
    expect(await page(month)).toMatchObject({ runningCosts: 45000 });

    for (const token of [hal.token, tom.token])
      expect((await api.call('PUT', `/admin/running-costs/${month}`, token, { amount: 1 })).status).toBe(403);
    expect(await api.refused('PUT', `/admin/running-costs/${month}`, undefined, { amount: 1 })).toBe(true);
    expect(await api.refused('PUT', `/admin/running-costs/${month}`, ada.token, { amount: -1 })).toBe(true);
    expect(await api.refused('PUT', '/admin/running-costs/2025-13', ada.token, { amount: 1 })).toBe(true);
    expect(await api.refused('PUT', '/admin/running-costs/october', ada.token, { amount: 1 })).toBe(true);
    expect(await page(month)).toMatchObject({ runningCosts: 45000 });
    expect(await page('2025-09')).toMatchObject({ runningCosts: 0 });

    const entries = await eventually(
      () => api.list(`/admin/audit?subjectId=${month}`, ada.token),
      found => found.length >= 2,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId: ada.id, action: 'running-costs-set', subjectId: month, note: null }),
      expect.objectContaining({ adminId: ada.id, action: 'running-costs-set', subjectId: month, note: null }),
    ]);
    expect(Date.parse(String(entries[0].at))).toBeLessThanOrEqual(Date.parse(String(entries[1].at)));

    for (const query of ['', '?month=2025-13', '?month=202510', '?month=last'])
      expect((await api.call('GET', `/transparency${query}`)).status).toBe(400);
  }, 90000);

  it('counts the bookings confirmed, the fees of every payment that succeeded, and the donations paid', async () => {
    const hal = await api.host('hal2@transparency.test');
    const tom = await api.traveller('tom2@transparency.test');
    const una = await api.traveller('una2@transparency.test');
    const instant = await api.listing(hal.token);
    const asked = await api.listing(hal.token);
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const fees: ProviderPayment[] = [];

    // Confirmed at once and paid; paid and then cancelled by the host; its payment failed.
    const paid = await api.book(tom.token, await api.quote(tom.token, instant, day(10), day(12)));
    fees.push(await payBooking(api, provider, tom.token, paid));
    const cancelled = await api.book(tom.token, await api.quote(tom.token, instant, day(20), day(21)));
    fees.push(await payBooking(api, provider, tom.token, cancelled));
    await api.done('POST', `/bookings/${cancelled}/cancel`, hal.token);
    const unpaid = await api.book(tom.token, await api.quote(tom.token, instant, day(30), day(31)));
    await api.done('POST', `/bookings/${unpaid}/pay`, tom.token);
    const [failing] = provider.paymentFor(unpaid);
    provider.fail(failing.id);
    await eventually(
      async () => (await api.read(`/bookings/${unpaid}`, tom.token)).payment as Json,
      payment => payment.status === 'due',
    );
    // A request accepted is confirmed; one declined, and one still waiting, are not.
    const accepted = await api.book(tom.token, await api.quote(tom.token, asked, day(10), day(11)));
    await api.done('POST', `/bookings/${accepted}/accept`, hal.token);
    const declined = await api.book(tom.token, await api.quote(tom.token, asked, day(20), day(21)));
    await api.done('POST', `/bookings/${declined}/decline`, hal.token);
    await api.book(tom.token, await api.quote(tom.token, asked, day(30), day(31)));

    // A donation paid counts, with its fee; one pending and one failed count nothing.
    const gift = await donate(una.token, 5000);
    provider.pay(gift.payment.id);
    await donationReads(gift.id, una.token, 'paid');
    fees.push(gift.payment);
    await donate(una.token, 7000);
    const refused = await donate(una.token, 3000);
    provider.fail(refused.payment.id);
    await donationReads(refused.id, una.token, 'failed');

    const providerFees = fees.reduce((sum, payment) => sum + payment.fee, 0);
    // Running costs chosen so that the cost per booking ends in a half, rounded up.
    const runningCosts = 50000 + ((((2 - ((50000 + providerFees) % 4)) % 4) + 4) % 4);
    const month = thisMonth();
    await api.done('PUT', `/admin/running-costs/${month}`, ada.token, { amount: runningCosts });

    const expected = {
      month,
      bookings: 4,
      providerFees,
      donations: 5000,
      runningCosts,
      costPerBooking: halfUp(runningCosts + providerFees, 4),
    };
    const read = await eventually(
      () => page(month),
      found => found.bookings === 4 && found.providerFees === providerFees,
    );
    expect(read).toMatchObject(expected);
    expect((runningCosts + providerFees) % 4).toBe(2);
    expect(read.costPerBooking).toBe((runningCosts + providerFees + 2) / 4);
    // Signed in or not, the same numbers, and nothing private.
    expect(await api.read(`/transparency?month=${month}`, tom.token)).toMatchObject(expected);
    const text = JSON.stringify(read);
    for (const secret of [paid, cancelled, accepted, hal.id, tom.id, una.id, hal.email, una.email])
      expect(text).not.toContain(secret);
  }, 120000);

  it('counts a booking in the month it was confirmed, and its fee in the month the provider said it succeeded', async () => {
    const hal = await api.host('hal3@transparency.test');
    const tom = await api.traveller('tom3@transparency.test');
    const listingId = await api.listing(hal.token);
    const month = thisMonth();
    const prior = await page(month);
    const confirmedNow = await api.book(tom.token, await api.quote(tom.token, listingId, day(60), day(61)));
    const before = await eventually(
      () => page(month),
      found => found.bookings === Number(prior.bookings) + 1,
    );
    expect(before.bookings).toBe(Number(prior.bookings) + 1);

    const now = new Date();
    const firstOfNext = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const days = Math.ceil((firstOfNext - now.getTime()) / 86_400_000);
    const next = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 7);
    server = await restart(server, db.path, { ...environment, ...clock(days) });
    provider.attach(server.port);
    api = client(server.port);
    const token = await api.login(tom.email);
    const payment = await payBooking(api, provider, token, confirmedNow);

    expect(await page(month)).toMatchObject({
      bookings: before.bookings,
      providerFees: before.providerFees,
      donations: before.donations,
    });
    expect(
      await eventually(
        () => page(next),
        found => found.providerFees === payment.fee,
      ),
    ).toMatchObject({ month: next, bookings: 0, providerFees: payment.fee, donations: 0, costPerBooking: null });

    const later = await api.book(token, await api.quote(token, listingId, day(days + 70), day(days + 71)));
    expect(later).toEqual(expect.any(String));
    expect(
      await eventually(
        () => page(next),
        found => found.bookings === 1,
      ),
    ).toMatchObject({ bookings: 1, providerFees: payment.fee, costPerBooking: payment.fee });
  }, 120000);
});
