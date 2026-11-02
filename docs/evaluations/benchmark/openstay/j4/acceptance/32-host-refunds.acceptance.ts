import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/** Request 32: refunds by the host, which together never exceed what was paid. Invariant 5. */
const db = database('host-refunds');
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

const refunded = (bookingId: string, token: string, count: number) =>
  eventually(
    () => api.list(`/bookings/${bookingId}/refunds`, token),
    refunds => refunds.length >= count && refunds.every(each => each.status === 'refunded'),
  );
const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

/** A paid booking of `nights` nights at 100 € and 20 € of cleaning, on a listing of `host`'s. */
async function paid(host: string, traveller: string, nights: number, policy = 'flexible') {
  const hal = await api.host(host);
  const tom = await api.traveller(traveller);
  const listingId = await api.listing(hal.token, { cancellationPolicy: policy });
  const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(3), day(3 + nights)));
  const payment = await payBooking(api, provider, tom.token, bookingId);
  return { hal, tom, listingId, bookingId, payment };
}

describe('partial refunds by the host', () => {
  it('refunds what the host or a manager gives, through the provider, listed oldest first with the cancellation', async () => {
    const { hal, tom, listingId, bookingId, payment } = await paid(
      'hal@host-refunds.test',
      'tom@host-refunds.test',
      2,
      'moderate',
    );
    const mia = await api.host('mia@host-refunds.test');
    const una = await api.traveller('una@host-refunds.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    await api.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });

    const shower = await api.create(`/bookings/${bookingId}/refunds`, hal.token, {
      amount: 2000,
      reason: 'A broken shower',
    });
    const storm = await api.create(`/bookings/${bookingId}/refunds`, mia.token, {
      amount: 1000,
      reason: 'A day lost to a storm',
    });
    await refunded(bookingId, tom.token, 2);
    // Moderate, 3 days before: half of the 22 000 of the host's lines.
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);

    const refunds = await refunded(bookingId, hal.token, 3);
    expect(refunds.map(each => [each.amount, each.status])).toEqual([
      [2000, 'refunded'],
      [1000, 'refunded'],
      [11000, 'refunded'],
    ]);
    expect(refunds[0]).toMatchObject({ id: shower, reason: 'A broken shower' });
    expect(refunds[1]).toMatchObject({ id: storm, reason: 'A day lost to a storm' });
    expect(refunds.map(each => each.by === null)).toEqual([false, false, true]);
    expect(await api.list(`/bookings/${bookingId}/refunds`, tom.token)).toEqual(refunds);
    expect(await api.hidden(`/bookings/${bookingId}/refunds`, una.token)).toBe(true);

    const atProvider = [...provider.refunds.values()].filter(each => each.payment === payment.id);
    expect(atProvider.map(each => each.amount).sort((a, b) => a - b)).toEqual([1000, 2000, 11000]);
    expect(((await api.read(`/bookings/${bookingId}`, tom.token)).payment as Json).refunded).toBe(14000);
  }, 60000);

  it('refuses a refund past what was paid, out of range, on a booking never paid, or by anyone else', async () => {
    const { hal, tom, listingId, bookingId } = await paid('hal2@host-refunds.test', 'tom2@host-refunds.test', 1);
    const ian = await api.host('ian2@host-refunds.test');
    const path = `/bookings/${bookingId}/refunds`;
    const reason = 'A broken shower';
    expect(await api.refused('POST', path, hal.token, { amount: 0, reason })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { amount: 1000, reason: '' })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { amount: 1000, reason: 'x'.repeat(201) })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { amount: 12001, reason })).toBe(true);
    expect(await api.refused('POST', path, tom.token, { amount: 1000, reason })).toBe(true);
    expect(await api.refused('POST', path, ian.token, { amount: 1000, reason })).toBe(true);

    await api.create(path, hal.token, { amount: 10000, reason });
    expect(await api.refused('POST', path, hal.token, { amount: 2001, reason })).toBe(true);
    await api.create(path, hal.token, { amount: 2000, reason });
    expect(await api.refused('POST', path, hal.token, { amount: 1, reason })).toBe(true);
    expect((await refunded(bookingId, tom.token, 2)).map(each => each.amount)).toEqual([10000, 2000]);

    const unpaid = await api.book(tom.token, await api.quote(tom.token, listingId, day(20), day(21)));
    expect(await api.refused('POST', `/bookings/${unpaid}/refunds`, hal.token, { amount: 1000, reason })).toBe(true);
  }, 60000);

  it('never refunds more than was paid when refunds are made at the same moment', async () => {
    const { hal, tom, bookingId, payment } = await paid('hal3@host-refunds.test', 'tom3@host-refunds.test', 2);
    const path = `/bookings/${bookingId}/refunds`;
    const pair = await Promise.all(
      [1, 2].map(() => api.act('POST', path, hal.token, { amount: 15000, reason: 'Two at once' })),
    );
    expect(pair.filter(outcome => outcome.accepted)).toHaveLength(1);

    const five = await Promise.all(
      [1, 2, 3, 4, 5].map(() => api.act('POST', path, hal.token, { amount: 1500, reason: 'Five at once' })),
    );
    const accepted = five.filter(outcome => outcome.accepted).length;
    expect(15000 + accepted * 1500).toBeLessThanOrEqual(22000);
    expect(accepted).toBeGreaterThanOrEqual(1);

    const refunds = await refunded(bookingId, tom.token, 1 + accepted);
    expect(sum(refunds.map(each => Number(each.amount)))).toBe(15000 + accepted * 1500);
    const atProvider = await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === payment.id),
      found => found.length >= 1 + accepted,
    );
    expect(sum(atProvider.map(each => each.amount))).toBe(15000 + accepted * 1500);
  }, 60000);
});
