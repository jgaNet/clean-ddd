import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { enabledAccount, paymentProvider, payBooking } from './provider';

/** Request 37: what the provider says moved, compared each day with what OpenStay believes moved. */
const db = database('reconciliation');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, {
    ...(await provider.environment()),
    JOBS_INTERVAL_SECONDS: '1',
    ADMIN_EMAILS: 'ada@reconciliation.test,bea@reconciliation.test,cy@reconciliation.test',
  });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

describe('reconciliation', () => {
  it('matches every charge, fee, refund and payout of the day, and shows a movement only the provider has', async () => {
    const ada = await api.traveller('ada@reconciliation.test');
    const bea = await api.host('bea@reconciliation.test');
    const hal = await api.host('hal@reconciliation.test');
    const tom = await api.traveller('tom@reconciliation.test');
    await enabledAccount(api, provider, hal.token);
    const id = await api.listing(hal.token);
    // Paid: a charge and a fee. Paid and cancelled by the host: a refund too. Paid tonight: a payout too.
    const paid = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    const cancelled = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(21)));
    const tonight = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
    for (const bookingId of [paid, cancelled, tonight]) await payBooking(api, provider, tom.token, bookingId);
    await api.done('POST', `/bookings/${cancelled}/cancel`, hal.token);
    await eventually(
      () => api.read(`/bookings/${cancelled}`, tom.token),
      booking => (booking.refund as Json | undefined)?.status === 'refunded',
    );
    await eventually(
      () => api.list('/hosts/me/payouts', hal.token),
      payouts => payouts.some(each => each.status === 'paid'),
      20000,
    );
    await provider.settled();

    const today = day(0);
    expect(provider.transactions.filter(each => each.at.startsWith(today))).toHaveLength(8);
    expect(await api.read(`/admin/reconciliation?date=${today}`, ada.token)).toEqual({
      date: today,
      matched: 8,
      mismatches: [],
    });

    provider.inject('charge', 4200, 'from-nowhere');
    expect(await api.read(`/admin/reconciliation?date=${today}`, bea.token)).toEqual({
      date: today,
      matched: 8,
      mismatches: [{ type: 'charge', reference: 'from-nowhere', provider: 4200, openstay: null }],
    });
  }, 90000);

  it('refuses anyone but an administrator, and finds nothing on a day nothing moved', async () => {
    const cy = await api.traveller('cy@reconciliation.test');
    const tom = await api.traveller('tom2@reconciliation.test');
    const hal = await api.host('hal2@reconciliation.test');
    const yesterday = day(-1);
    expect((await api.call('GET', `/admin/reconciliation?date=${yesterday}`, tom.token)).status).toBe(403);
    expect((await api.call('GET', `/admin/reconciliation?date=${yesterday}`, hal.token)).status).toBe(403);
    expect(await api.read(`/admin/reconciliation?date=${yesterday}`, cy.token)).toEqual({
      date: yesterday,
      matched: 0,
      mismatches: [],
    });
  }, 60000);
});
