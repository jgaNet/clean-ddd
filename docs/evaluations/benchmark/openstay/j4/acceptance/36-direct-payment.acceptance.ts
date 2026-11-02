import { client, Client, database, day, Json, Running, sleep, start, stop } from './openstay';
import { enabledAccount, paymentProvider, payBooking } from './provider';

/** Request 36: a payment the host declares, never shown as verified. Invariant 11. */
const TTL = 5;
const db = database('direct-payment');
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

const paymentOf = async (bookingId: string, token: string) =>
  (await api.read(`/bookings/${bookingId}`, token)).payment as Json;

describe('direct payment declared by the host', () => {
  it('reads declared and not verified, never lapses, is not paid through the provider and gives no payout', async () => {
    const hal = await api.host('hal@direct-payment.test');
    const tom = await api.traveller('tom@direct-payment.test');
    await enabledAccount(api, provider, hal.token);
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
    await api.done('POST', `/bookings/${bookingId}/declare-paid`, hal.token);
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'declared', verified: false });
    expect(await api.refused('POST', `/bookings/${bookingId}/pay`, tom.token)).toBe(true);

    await sleep(TTL * 1000 + 3000);
    const booking = await api.read(`/bookings/${bookingId}`, hal.token);
    expect(booking.status).toBe('confirmed');
    expect(booking.payment).toMatchObject({ status: 'declared', verified: false });
    expect(provider.paymentFor(bookingId)).toEqual([]);
    expect([...provider.payouts.values()].filter(each => each.reference === bookingId)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', hal.token)).toEqual([]);
  }, 60000);

  it('is declared by the host or a manager only, of a payment due only, and refunds nothing on a cancellation', async () => {
    const hal = await api.host('hal2@direct-payment.test');
    const mia = await api.host('mia2@direct-payment.test');
    const ian = await api.host('ian2@direct-payment.test');
    const tom = await api.traveller('tom2@direct-payment.test');
    const id = await api.listing(hal.token);
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });

    const declared = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    expect(await api.refused('POST', `/bookings/${declared}/declare-paid`, tom.token)).toBe(true);
    expect(await api.refused('POST', `/bookings/${declared}/declare-paid`, ian.token)).toBe(true);
    await api.done('POST', `/bookings/${declared}/declare-paid`, mia.token);
    expect(await paymentOf(declared, hal.token)).toMatchObject({ status: 'declared', verified: false });
    await api.done('POST', `/bookings/${declared}/cancel`, tom.token);

    const paid = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(21)));
    await payBooking(api, provider, tom.token, paid);
    expect(await paymentOf(paid, tom.token)).toMatchObject({ status: 'paid', verified: true });
    expect(await api.refused('POST', `/bookings/${paid}/declare-paid`, hal.token)).toBe(true);

    await sleep(2000);
    expect([...provider.refunds.values()].filter(each => each.reference === declared)).toEqual([]);
    expect(provider.paymentFor(declared)).toEqual([]);
  }, 60000);
});
