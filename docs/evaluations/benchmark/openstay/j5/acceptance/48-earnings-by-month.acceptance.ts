import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking } from './provider';

/** Request 48: a host's charges, fees, refunds and payouts, month by month. */
const db = database('earnings');
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

/** Read when a case runs, after the server started (it may have waited past midnight). */
const month = () => day(0).slice(0, 7);
const year = () => Number(day(0).slice(0, 4));

describe('earnings by month', () => {
  it('sums what was charged, the fees, what was refunded and what was paid out, in the month the provider said so', async () => {
    const hal = await api.host('hal@earnings.test');
    const tom = await api.traveller('tom@earnings.test');
    await enabledAccount(api, provider, hal.token);
    const tonight = await api.book(tom.token, await api.quote(tom.token, await api.listing(hal.token), day(0), day(1)));
    const later = await api.book(tom.token, await api.quote(tom.token, await api.listing(hal.token), day(10), day(12)));
    await payBooking(api, provider, tom.token, tonight);
    await payBooking(api, provider, tom.token, later);
    await api.create(`/bookings/${later}/refunds`, hal.token, { amount: 1000, reason: 'A broken shower' });
    await eventually(
      () => api.read(`/bookings/${later}`, tom.token),
      booking => (booking.payment as Json).refunded === 1000,
    );
    await eventually(
      () => api.list('/hosts/me/payouts', hal.token),
      payouts => payouts.some(each => each.status === 'paid'),
      20000,
    );

    // Tonight: 12 000 charged and paid out less its fee. Later: 22 000 charged, 1 000 refunded, no payout yet.
    const expected = {
      month: month(),
      charged: 12000 + 22000,
      fees: feeOf(12000) + feeOf(22000),
      refunded: 1000,
      paidOut: 12000 - feeOf(12000),
    };
    expect(
      await eventually(
        () => api.list(`/hosts/me/earnings?year=${year()}`, hal.token),
        months => months[0]?.paidOut === expected.paidOut,
      ),
    ).toMatchObject([expected]);
  }, 90000);

  it("shows nothing for a year nothing happened in, nor any of another host's bookings", async () => {
    const ian = await api.host('ian@earnings.test');
    const jon = await api.host('jon@earnings.test');
    const una = await api.traveller('una@earnings.test');
    const bookingId = await api.book(
      una.token,
      await api.quote(una.token, await api.listing(ian.token), day(10), day(11)),
    );
    await payBooking(api, provider, una.token, bookingId);
    expect(
      await eventually(
        () => api.list(`/hosts/me/earnings?year=${year()}`, ian.token),
        months => months.length > 0,
      ),
    ).toMatchObject([{ month: month(), charged: 12000, fees: feeOf(12000), refunded: 0, paidOut: 0 }]);
    expect(await api.list(`/hosts/me/earnings?year=${year() - 1}`, ian.token)).toEqual([]);
    expect(await api.list(`/hosts/me/earnings?year=${year()}`, jon.token)).toEqual([]);
  }, 60000);
});
