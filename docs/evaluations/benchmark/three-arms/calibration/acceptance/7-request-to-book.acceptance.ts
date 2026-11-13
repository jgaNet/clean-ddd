import { bySweep, client, Client, database, day, eventually, Running, sleep, start, stop } from './openstay';

/** Request 7: a request holds its nights until the host decides, or until it expires. Invariant 3. */
const db = database('request');
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

describe('request to book', () => {
  it('makes a request on a listing in request mode, which holds its nights until the host accepts it', async () => {
    const hal = await api.host('hal@request.test');
    const ian = await api.host('ian@request.test');
    const tom = await api.traveller('tom@request.test');
    const una = await api.traveller('una@request.test');
    const id = await api.listing(hal.token, { city: 'Annecy' });
    const instant = await api.listing(hal.token, { city: 'Annecy' });
    expect((await api.read(`/listings/${instant}`)).bookingMode).toBe('instant');
    expect(await api.refused('PUT', `/listings/${id}/booking-mode`, ian.token, { mode: 'request' })).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'sometimes' })).toBe(true);
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    expect((await api.read(`/listings/${id}`)).bookingMode).toBe('request');

    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(32)));
    const requested = await api.read(`/bookings/${bookingId}`, tom.token);
    expect(requested.status).toBe('requested');
    expect(Date.parse(String(requested.expiresAt))).toBeGreaterThan(Date.now());

    expect(
      await api.refused('POST', '/quotes', una.token, {
        listingId: id,
        checkIn: day(31),
        checkOut: day(33),
        guests: 1,
      }),
    ).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(30), to: day(31) })).toBe(true);
    expect(
      (await api.list(`/listings?city=Annecy&checkIn=${day(31)}&checkOut=${day(32)}`)).map(each => each.id),
    ).toEqual([instant]);
    expect(
      (await api.list(`/listings/${id}/calendar?from=${day(30)}&to=${day(32)}`)).map(each => each.available),
    ).toEqual([false, false]);

    expect(await api.refused('POST', `/bookings/${bookingId}/accept`, tom.token)).toBe(true);
    expect(await api.refused('POST', `/bookings/${bookingId}/accept`, ian.token)).toBe(true);
    await api.done('POST', `/bookings/${bookingId}/accept`, hal.token);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).status).toBe('confirmed');
    expect(await api.refused('POST', `/bookings/${bookingId}/decline`, hal.token)).toBe(true);
  }, 60000);

  it('frees the nights of a declined request, and keeps a request a request when the mode changes', async () => {
    const hal = await api.host('hal2@request.test');
    const tom = await api.traveller('tom2@request.test');
    const una = await api.traveller('una2@request.test');
    const id = await api.listing(hal.token, { city: 'Chamonix' });
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });

    const declined = await api.book(tom.token, await api.quote(tom.token, id, day(40), day(42)));
    await api.done('POST', `/bookings/${declined}/decline`, hal.token);
    expect((await api.read(`/bookings/${declined}`, tom.token)).status).toBe('declined');
    expect(await api.refused('POST', `/bookings/${declined}/accept`, hal.token)).toBe(true);
    expect(await api.quote(una.token, id, day(40), day(42))).toEqual(expect.any(String));

    const waiting = await api.book(tom.token, await api.quote(tom.token, id, day(50), day(51)));
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'instant' });
    expect((await api.read(`/bookings/${waiting}`, tom.token)).status).toBe('requested');
    const instant = await api.book(una.token, await api.quote(una.token, id, day(60), day(61)));
    expect((await api.read(`/bookings/${instant}`, una.token)).status).toBe('confirmed');
  }, 60000);

  it('expires a request the host did not decide in time at the next sweep, never at a read, which frees its nights without anyone acting', async () => {
    // The tests' servers run their job every JOBS_INTERVAL_SECONDS (1, openstay.ts): the request reads as expired
    // once its second has passed, at the next sweep, and the test reads until then.
    const expiring = database('request-ttl');
    const short = await start(expiring.path, { BOOKING_REQUEST_TTL_SECONDS: '1' });
    try {
      const quick = client(short.port);
      const hal = await quick.host('hal3@request.test');
      const tom = await quick.traveller('tom3@request.test');
      const una = await quick.traveller('una3@request.test');
      const id = await quick.listing(hal.token, { city: 'Megève' });
      await quick.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
      const asked = Date.now();
      const bookingId = await quick.book(tom.token, await quick.quote(tom.token, id, day(20), day(22)));
      const expired = await eventually(
        () => quick.read(`/bookings/${bookingId}`, tom.token),
        booking => booking.status === 'expired',
        bySweep(1),
      );

      expect(expired.status).toBe('expired');
      expect(Date.now() - asked).toBeGreaterThanOrEqual(1000);
      expect(await quick.refused('POST', `/bookings/${bookingId}/accept`, hal.token)).toBe(true);
      expect(await quick.refused('POST', `/bookings/${bookingId}/decline`, hal.token)).toBe(true);
      expect(await quick.quote(una.token, id, day(20), day(22))).toEqual(expect.any(String));
    } finally {
      await stop(short);
      expiring.remove();
    }

    // A job every hour: past its time, the request is read, and still reads as requested until the sweep.
    const later = database('request-sweep');
    const slow = await start(later.path, { BOOKING_REQUEST_TTL_SECONDS: '1', JOBS_INTERVAL_SECONDS: '3600' });
    try {
      const quick = client(slow.port);
      const hal = await quick.host('hal4@request.test');
      const tom = await quick.traveller('tom4@request.test');
      const id = await quick.listing(hal.token, { city: 'Megève' });
      await quick.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
      const bookingId = await quick.book(tom.token, await quick.quote(tom.token, id, day(20), day(22)));
      await sleep(2500);

      expect((await quick.read(`/bookings/${bookingId}`, tom.token)).status).toBe('requested');
      expect((await quick.read(`/bookings/${bookingId}`, hal.token)).status).toBe('requested');
    } finally {
      await stop(slow);
      later.remove();
    }
  }, 120000);
});
