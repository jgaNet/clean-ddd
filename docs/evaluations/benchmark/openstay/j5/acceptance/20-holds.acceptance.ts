import { client, Client, database, day, Running, sleep, start, stop } from './openstay';

/** Request 20: holding nights while deciding. Invariant 3. */
const db = database('holds');
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

describe('holding nights', () => {
  it('takes the held nights for everyone else, and lets its traveller book them', async () => {
    const hal = await api.host('hal@holds.test');
    const tom = await api.traveller('tom@holds.test');
    const una = await api.traveller('una@holds.test');
    const id = await api.listing(hal.token, { city: 'Vannes' });
    const unasEarlierQuote = await api.quote(una.token, id, day(31), day(33));
    const holdId = await api.create('/holds', tom.token, {
      listingId: id,
      checkIn: day(30),
      checkOut: day(32),
      guests: 1,
    });
    expect((await api.list('/holds/mine', tom.token)).map(each => each.id)).toEqual([holdId]);

    expect(
      await api.refused('POST', '/quotes', una.token, {
        listingId: id,
        checkIn: day(31),
        checkOut: day(33),
        guests: 1,
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', '/holds', una.token, { listingId: id, checkIn: day(29), checkOut: day(31), guests: 1 }),
    ).toBe(true);
    expect(await api.refused('POST', '/bookings', una.token, { quoteId: unasEarlierQuote })).toBe(true);
    expect(
      await api.refused('POST', '/holds', hal.token, { listingId: id, checkIn: day(40), checkOut: day(41), guests: 1 }),
    ).toBe(true);
    expect(
      await api.refused('POST', '/holds', una.token, { listingId: id, checkIn: day(40), checkOut: day(41), guests: 9 }),
    ).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(30), to: day(31) })).toBe(true);
    expect(
      (await api.list(`/listings/${id}/calendar?from=${day(30)}&to=${day(32)}`)).map(each => each.available),
    ).toEqual([false, false]);
    expect((await api.list(`/listings?city=Vannes&checkIn=${day(30)}&checkOut=${day(31)}`)).length).toBe(0);

    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(32)));
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).status).toBe('confirmed');
    expect(await api.list('/holds/mine', tom.token)).toEqual([]);
  }, 60000);

  it('frees the nights when released, and refuses a fourth hold', async () => {
    const hal = await api.host('hal2@holds.test');
    const tom = await api.traveller('tom2@holds.test');
    const una = await api.traveller('una2@holds.test');
    const id = await api.listing(hal.token);
    const hold = (checkIn: number) =>
      api.create('/holds', tom.token, { listingId: id, checkIn: day(checkIn), checkOut: day(checkIn + 1), guests: 1 });
    const first = await hold(10);
    await hold(12);
    await hold(14);
    expect(
      await api.refused('POST', '/holds', tom.token, { listingId: id, checkIn: day(16), checkOut: day(17), guests: 1 }),
    ).toBe(true);

    expect(await api.refused('POST', `/holds/${first}/release`, una.token)).toBe(true);
    await api.done('POST', `/holds/${first}/release`, tom.token);
    expect(await api.quote(una.token, id, day(10), day(11))).toEqual(expect.any(String));
    expect(
      await api.create('/holds', tom.token, { listingId: id, checkIn: day(16), checkOut: day(17), guests: 1 }),
    ).toEqual(expect.any(String));
  }, 60000);

  it('ends a hold when its time has passed, without anyone acting', async () => {
    const expiring = database('holds-ttl');
    const short = await start(expiring.path, { HOLD_TTL_SECONDS: '1' });
    try {
      const quick = client(short.port);
      const hal = await quick.host('hal3@holds.test');
      const tom = await quick.traveller('tom3@holds.test');
      const una = await quick.traveller('una3@holds.test');
      const id = await quick.listing(hal.token);
      await quick.create('/holds', tom.token, { listingId: id, checkIn: day(20), checkOut: day(22), guests: 1 });
      await sleep(2500);
      expect(await quick.list('/holds/mine', tom.token)).toEqual([]);
      expect(await quick.quote(una.token, id, day(20), day(22))).toEqual(expect.any(String));
    } finally {
      await stop(short);
      expiring.remove();
    }
  }, 90000);
});
