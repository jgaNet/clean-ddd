import { client, Client, database, day, eventually, Json, Running, sleep, start, stop } from './openstay';
import { paymentProvider, payBooking, ProviderRefund } from './provider';

/** Request 31: a cancelled paid booking refunded through the provider. Invariant 7. */
const db = database('refunds');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const refundsOf = (paymentId: string) => [...provider.refunds.values()].filter(each => each.payment === paymentId);
const refundOf = async (bookingId: string, token: string) =>
  (await api.read(`/bookings/${bookingId}`, token)).refund as Json | undefined;
const reads = (bookingId: string, token: string, status: string) =>
  eventually(
    () => api.read(`/bookings/${bookingId}`, token),
    booking => (booking.refund as Json | undefined)?.status === status,
  );
const asked = (paymentId: string, count: number) =>
  eventually(
    async () => refundsOf(paymentId),
    found => found.length >= count,
  );

describe('refunds through the provider', () => {
  it('asks the provider for the refundable amount, under the booking id, and reads pending, then refunded', async () => {
    provider.state.settleAfterMs = undefined;
    const hal = await api.host('hal@refunds.test');
    const tom = await api.traveller('tom@refunds.test');
    const id = await api.listing(hal.token, { cancellationPolicy: 'moderate' });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 100 });
    // Two nights, one guest, cancelled 3 days before: half of 22 000, and the 200 of tax.
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(3), day(5)));
    const payment = await payBooking(api, provider, tom.token, bookingId);
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);

    const [refund] = await asked(payment.id, 1);
    expect(refund).toMatchObject({ amount: 11200, reference: bookingId });
    const pending = await reads(bookingId, tom.token, 'pending');
    expect(pending).toMatchObject({ status: 'cancelled', refund: { amount: 11200, status: 'pending' } });
    expect((pending.payment as Json).refunded).toBe(0);

    provider.settleRefund(refund.id);
    expect(await reads(bookingId, tom.token, 'refunded')).toMatchObject({
      status: 'cancelled',
      refund: { amount: 11200, status: 'refunded' },
      payment: { refunded: 11200 },
    });
    expect(refundsOf(payment.id)).toHaveLength(1);
  }, 60000);

  it('asks again a refund that failed, and reads refunded only when the provider says so', async () => {
    provider.state.settleAfterMs = undefined;
    const hal = await api.host('hal2@refunds.test');
    const tom = await api.traveller('tom2@refunds.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    const payment = await payBooking(api, provider, tom.token, bookingId);
    await api.done('POST', `/bookings/${bookingId}/cancel`, hal.token);

    const [first] = await asked(payment.id, 1);
    expect(first.amount).toBe(12000);
    provider.settleRefund(first.id, false);
    const retried = await asked(payment.id, 2);
    expect((await refundOf(bookingId, tom.token))?.status).not.toBe('refunded');
    const second = retried.find(each => each.id !== first.id) as ProviderRefund;
    expect(second.amount).toBe(12000);

    provider.settleRefund(second.id);
    expect(await reads(bookingId, tom.token, 'refunded')).toMatchObject({
      refund: { amount: 12000, status: 'refunded' },
      payment: { refunded: 12000 },
    });
  }, 60000);

  it('sends nothing for a booking never paid, nor for a refundable amount of zero', async () => {
    provider.state.settleAfterMs = 200;
    const hal = await api.host('hal3@refunds.test');
    const tom = await api.traveller('tom3@refunds.test');
    const flexible = await api.listing(hal.token);
    const strict = await api.listing(hal.token, { cancellationPolicy: 'strict' });

    const unpaid = await api.book(tom.token, await api.quote(tom.token, flexible, day(10), day(11)));
    await api.done('POST', `/bookings/${unpaid}/cancel`, tom.token);
    // Strict, 3 days before, no tourist tax: nothing is refundable.
    const nothing = await api.book(tom.token, await api.quote(tom.token, strict, day(3), day(4)));
    const payment = await payBooking(api, provider, tom.token, nothing);
    await api.done('POST', `/bookings/${nothing}/cancel`, tom.token);

    await sleep(3000);
    expect(await refundOf(unpaid, tom.token)).toMatchObject({ amount: 12000, status: 'owed' });
    expect([...provider.refunds.values()].filter(each => each.reference === unpaid)).toEqual([]);
    expect(refundsOf(payment.id)).toEqual([]);
    expect(((await api.read(`/bookings/${nothing}`, tom.token)).payment as Json).refunded).toBe(0);
  }, 60000);
});
