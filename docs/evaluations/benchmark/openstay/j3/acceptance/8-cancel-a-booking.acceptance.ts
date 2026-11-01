import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 8: what a cancellation makes refundable, apart from what was refunded. Invariants 5, 7 and 8. */
const db = database('cancel');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

/** A listing at 100 € a night, 20 € of cleaning and 1 € of tax per guest and night, under `policy`. */
async function listing(token: string, policy: string, nightlyPrice = 10000, cleaningFee = 2000) {
  const id = await api.listing(token, { city: 'Rennes', nightlyPrice, cleaningFee, cancellationPolicy: policy });
  await api.done('PUT', `/listings/${id}/tourist-tax`, token, { perGuestPerNight: 100 });
  return id;
}

describe('cancel a booking', () => {
  it('makes refundable what the policy gives by days before check-in, and the tourist tax in full', async () => {
    const hal = await api.host('hal@cancel.test');
    const tom = await api.traveller('tom@cancel.test');
    const policies = {
      flexible: await listing(hal.token, 'flexible'),
      moderate: await listing(hal.token, 'moderate'),
      strict: await listing(hal.token, 'strict'),
    };
    // Two nights, one guest: 22 000 cents for the host, 200 of tax, 22 200 in all.
    const cases: [keyof typeof policies, number, number][] = [
      ['flexible', 10, 22200],
      ['flexible', 1, 22200],
      ['flexible', 0, 200],
      ['moderate', 10, 22200],
      ['moderate', 5, 22200],
      ['moderate', 3, 11200],
      ['moderate', 0, 200],
      ['strict', 10, 11200],
      ['strict', 7, 11200],
      ['strict', 3, 200],
    ];
    const seen: [string, number, unknown][] = [];
    for (const [policy, days] of cases) {
      const quoteId = await api.quote(tom.token, policies[policy], day(days), day(days + 2));
      const bookingId = await api.book(tom.token, quoteId);
      expect((await api.read(`/bookings/${bookingId}`, tom.token)).total).toBe(22200);
      await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
      const { cancellation } = await api.read(`/bookings/${bookingId}`, tom.token);
      seen.push([policy, days, (cancellation as { refundable?: unknown } | undefined)?.refundable]);
    }
    expect(seen).toEqual(cases);
  }, 120000);

  it('rounds a half down to the cent', async () => {
    const hal = await api.host('hal2@cancel.test');
    const tom = await api.traveller('tom2@cancel.test');
    const id = await listing(hal.token, 'moderate', 10001, 0);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(2), day(3)));
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).cancellation).toMatchObject({
      refundable: 5000 + 100,
    });
  }, 60000);

  it('says who cancelled and when, keeps the refund owed and never refunded, and frees the nights', async () => {
    const hal = await api.host('hal3@cancel.test');
    const tom = await api.traveller('tom3@cancel.test');
    const una = await api.traveller('una3@cancel.test');
    const id = await listing(hal.token, 'strict');
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(3), day(5)));

    const before = Date.now();
    await api.done('POST', `/bookings/${bookingId}/cancel`, hal.token);
    const cancelled = await api.read(`/bookings/${bookingId}`, tom.token);
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancellation: { by: 'host', refundable: 22200 },
      refund: { amount: 22200, status: 'owed' },
    });
    const at = Date.parse(String((cancelled.cancellation as { at: string }).at));
    expect(at).toBeGreaterThanOrEqual(before - 5000);
    expect(at).toBeLessThanOrEqual(Date.now() + 5000);
    expect(await api.read(`/bookings/${bookingId}`, hal.token)).toMatchObject({ status: 'cancelled' });

    expect(await api.refused('POST', `/bookings/${bookingId}/cancel`, tom.token)).toBe(true);
    expect(await api.quote(una.token, id, day(3), day(5))).toEqual(expect.any(String));
  }, 60000);

  it('keeps the policy the booking was made under, and lets only its traveller or its host cancel a confirmed booking', async () => {
    const hal = await api.host('hal4@cancel.test');
    const ian = await api.host('ian4@cancel.test');
    const tom = await api.traveller('tom4@cancel.test');
    const una = await api.traveller('una4@cancel.test');
    const id = await listing(hal.token, 'moderate');
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    await api.done('PUT', `/listings/${id}`, hal.token, {
      title: 'A room with a view',
      city: 'Rennes',
      capacity: 2,
      nightlyPrice: 10000,
      cleaningFee: 2000,
      cancellationPolicy: 'strict',
    });

    expect(await api.refused('POST', `/bookings/${bookingId}/cancel`, una.token)).toBe(true);
    expect(await api.refused('POST', `/bookings/${bookingId}/cancel`, ian.token)).toBe(true);
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).cancellation).toMatchObject({
      by: 'traveller',
      refundable: 22200,
    });

    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    const requested = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    expect(await api.refused('POST', `/bookings/${requested}/cancel`, tom.token)).toBe(true);
  }, 60000);
});
