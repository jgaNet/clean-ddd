import { client, Client, database, day, eventually, Json, kill, Running, sleep, start, stop } from './openstay';
import { enabledAccount, feeOf, openAccount, paymentProvider, payBooking } from './provider';

/** Request 33: the host paid what the stay earned, once per booking, across crashes. Invariant 6. */
const db = database('payouts');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const payoutsFor = (bookingId: string) => [...provider.payouts.values()].filter(each => each.reference === bookingId);
const listed = (token: string, expected: (payouts: Json[]) => boolean) =>
  eventually(() => api.list('/hosts/me/payouts', token), expected, 20000);
/** One night from today, at 100 € and 20 € of cleaning: 12 000 for the host, less the provider's fee. */
const DUE = 12000 - feeOf(12000);

describe('payouts', () => {
  it('pays the host the host lines less the fee once the check-in has begun, once, and not before', async () => {
    provider.state.settleAfterMs = 200;
    const hal = await api.host('hal@payouts.test');
    const tom = await api.traveller('tom@payouts.test');
    const account = await enabledAccount(api, provider, hal.token);
    const id = await api.listing(hal.token);
    const today = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
    const later = await api.book(tom.token, await api.quote(tom.token, id, day(5), day(6)));
    await payBooking(api, provider, tom.token, today);
    await payBooking(api, provider, tom.token, later);

    const payouts = await listed(hal.token, found => found.some(each => each.status === 'paid'));
    expect(payouts).toEqual([expect.objectContaining({ bookingIds: [today], amount: DUE, status: 'paid' })]);
    expect(payoutsFor(today).map(each => [each.account, each.amount])).toEqual([[account.id, DUE]]);

    await sleep(3000);
    expect(await api.list('/hosts/me/payouts', hal.token)).toHaveLength(1);
    expect(payoutsFor(today)).toHaveLength(1);
    expect(payoutsFor(later)).toEqual([]);
  }, 60000);

  it('takes off what was refunded, waits for an enabled account, and reads pending, then paid', async () => {
    provider.state.settleAfterMs = undefined;
    const ian = await api.host('ian@payouts.test');
    const tom = await api.traveller('tom2@payouts.test');
    await openAccount(api, provider, ian.token);
    const id = await api.listing(ian.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
    const payment = await payBooking(api, provider, tom.token, bookingId);
    await api.create(`/bookings/${bookingId}/refunds`, ian.token, { amount: 1000, reason: 'A broken shower' });
    const [refund] = await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === payment.id),
      found => found.length > 0,
    );
    provider.settleRefund(refund.id);
    await eventually(
      () => api.read(`/bookings/${bookingId}`, tom.token),
      booking => (booking.payment as Json).refunded === 1000,
    );
    await sleep(2000);
    expect(await api.list('/hosts/me/payouts', ian.token)).toEqual([]);
    expect(payoutsFor(bookingId)).toEqual([]);

    // Asking for the account again gives the same one, which the provider now enables.
    const account = await enabledAccount(api, provider, ian.token);
    const pending = await listed(ian.token, found => found.length > 0);
    expect(pending).toEqual([
      expect.objectContaining({ bookingIds: [bookingId], amount: DUE - 1000, status: 'pending' }),
    ]);
    const [payout] = payoutsFor(bookingId);
    expect(payout).toMatchObject({ account: account.id, amount: DUE - 1000 });
    provider.settlePayout(payout.id);
    expect(await listed(ian.token, found => found[0]?.status === 'paid')).toEqual([
      expect.objectContaining({ bookingIds: [bookingId], amount: DUE - 1000, status: 'paid' }),
    ]);
    provider.state.settleAfterMs = 200;
  }, 60000);

  it('never pays a booking twice across a crash, and lists the most recent payout first', async () => {
    provider.state.settleAfterMs = 200;
    const kai = await api.host('kai@payouts.test');
    const tom = await api.traveller('tom3@payouts.test');
    await enabledAccount(api, provider, kai.token);
    const first = await api.listing(kai.token);
    const second = await api.listing(kai.token);
    const before = await api.book(tom.token, await api.quote(tom.token, first, day(0), day(1)));
    await payBooking(api, provider, tom.token, before);
    await eventually(
      async () => payoutsFor(before),
      found => found.length > 0,
    );
    await kill(server);
    server = await start(db.path, environment);
    provider.attach(server.port);
    api = client(server.port);
    await eventually(
      async () => payoutsFor(before),
      found => found.every(each => each.status !== 'pending'),
    );
    // What the provider said while the server was down is said again.
    const said = provider.events.filter(each => each.type.startsWith('payout.') && each.data.reference === before);
    for (const event of said) provider.resend(event);

    const token = await api.login(kai.email);
    const traveller = await api.login(tom.email);
    await sleep(1100);
    const after = await api.book(traveller, await api.quote(traveller, second, day(0), day(1)));
    await payBooking(api, provider, traveller, after);
    const payouts = await listed(token, found => found.length >= 2 && found.every(each => each.status === 'paid'));
    expect(payouts.map(each => [each.bookingIds, each.amount, each.status])).toEqual([
      [[after], DUE, 'paid'],
      [[before], DUE, 'paid'],
    ]);
    await sleep(3000);
    expect(payoutsFor(before)).toHaveLength(1);
    expect(payoutsFor(after)).toHaveLength(1);
  }, 120000);
});
