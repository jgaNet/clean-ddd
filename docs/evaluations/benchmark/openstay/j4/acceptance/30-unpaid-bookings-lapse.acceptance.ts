import { client, Client, database, day, eventually, Json, Running, sleep, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/** Request 30: a booking left unpaid past its deadline lapses, with nobody acting. */
const TTL = 6;
const db = database('lapse');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, {
    ...(await provider.environment()),
    JOBS_INTERVAL_SECONDS: '1',
    PAYMENT_TTL_SECONDS: String(TTL),
  });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const lapsed = (bookingId: string, token: string) =>
  eventually(
    () => api.read(`/bookings/${bookingId}`, token),
    booking => booking.status === 'lapsed',
    TTL * 1000 + 20000,
  );

describe('an unpaid booking lapses', () => {
  it('shows when the payment is due, then lapses by nobody, frees its nights and is no longer acted on', async () => {
    const hal = await api.host('hal@lapse.test');
    const tom = await api.traveller('tom@lapse.test');
    const una = await api.traveller('una@lapse.test');
    const id = await api.listing(hal.token);
    const before = Date.now();
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    const after = Date.now();
    const dueBy = Date.parse(String(((await api.read(`/bookings/${bookingId}`, tom.token)).payment as Json).dueBy));
    expect(dueBy).toBeGreaterThanOrEqual(before + TTL * 1000 - 1000);
    expect(dueBy).toBeLessThanOrEqual(after + TTL * 1000 + 1000);

    expect((await lapsed(bookingId, tom.token)).status).toBe('lapsed');
    expect((await api.read(`/bookings/${bookingId}`, hal.token)).status).toBe('lapsed');
    const history = await api.list(`/bookings/${bookingId}/history`, tom.token);
    expect(history.map(step => [step.status, step.by])).toEqual([
      ['confirmed', null],
      ['lapsed', null],
    ]);
    expect(await api.quote(una.token, id, day(20), day(22))).toEqual(expect.any(String));

    expect(await api.refused('POST', `/bookings/${bookingId}/cancel`, tom.token)).toBe(true);
    expect(
      await api.refused('POST', `/bookings/${bookingId}/change-dates`, tom.token, {
        checkIn: day(40),
        checkOut: day(42),
      }),
    ).toBe(true);
    expect(await api.refused('POST', `/bookings/${bookingId}/pay`, tom.token)).toBe(true);
  }, 90000);

  it('does not lapse a booking paid in time', async () => {
    const hal = await api.host('hal2@lapse.test');
    const tom = await api.traveller('tom2@lapse.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    await payBooking(api, provider, tom.token, bookingId);
    await sleep(TTL * 1000 + 3000);
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({
      status: 'confirmed',
      payment: { status: 'paid' },
    });
  }, 90000);

  it('refunds in full, through the provider, a payment that succeeds after the booking lapsed', async () => {
    const hal = await api.host('hal3@lapse.test');
    const tom = await api.traveller('tom3@lapse.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(32)));
    await api.done('POST', `/bookings/${bookingId}/pay`, tom.token);
    const [payment] = provider.paymentFor(bookingId);
    await lapsed(bookingId, tom.token);

    provider.pay(payment.id);
    const refunds = () => [...provider.refunds.values()].filter(each => each.payment === payment.id);
    await eventually(
      async () => refunds(),
      found => found.length > 0,
    );
    await sleep(2000);
    expect(refunds().map(each => each.amount)).toEqual([22000]);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).status).toBe('lapsed');
  }, 90000);
});
