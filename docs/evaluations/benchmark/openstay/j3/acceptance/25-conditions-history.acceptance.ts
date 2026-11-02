import { client, Client, database, day, Json, Running, sleep, start, stop } from './openstay';

/** Request 25: the conditions as they were accepted. Invariant 8. */
const db = database('conditions');
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

const RULES = { pets: true, smoking: false, events: false, checkInFrom: '16:00', checkOutBefore: '10:00' };

describe('the conditions as they were accepted', () => {
  it("keeps every version of a booking's conditions, oldest first, whatever the listing does afterwards", async () => {
    const hal = await api.host('hal@conditions.test');
    const tom = await api.traveller('tom@conditions.test');
    const una = await api.traveller('una@conditions.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000, cleaningFee: 2000, cancellationPolicy: 'moderate' });
    await api.done('PUT', `/listings/${id}/house-rules`, hal.token, RULES);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22), 2));

    await api.done('PUT', `/listings/${id}`, hal.token, {
      title: 'A room with a view',
      city: 'Lyon',
      capacity: 2,
      nightlyPrice: 12000,
      cleaningFee: 2000,
      cancellationPolicy: 'strict',
    });
    await api.done('PUT', `/listings/${id}/house-rules`, hal.token, { ...RULES, pets: false });
    const first = await api.list(`/bookings/${bookingId}/conditions`, tom.token);
    expect(first).toEqual([
      expect.objectContaining({
        version: 1,
        by: tom.id,
        checkIn: day(20),
        checkOut: day(22),
        guests: 2,
        total: 2 * 10000 + 2000,
        cancellationPolicy: 'moderate',
        houseRules: RULES,
      }),
    ]);

    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, { checkIn: day(21), checkOut: day(24) });
    await api.done('PUT', `/listings/${id}`, hal.token, {
      title: 'A room with a view',
      city: 'Lyon',
      capacity: 2,
      nightlyPrice: 9000,
      cleaningFee: 1000,
      cancellationPolicy: 'flexible',
    });
    const conditions = await api.list(`/bookings/${bookingId}/conditions`, hal.token);
    expect(conditions[0]).toEqual(first[0]);
    expect(conditions[1]).toMatchObject({
      version: 2,
      by: tom.id,
      checkIn: day(21),
      checkOut: day(24),
      guests: 2,
      total: 3 * 12000 + 2000,
      cancellationPolicy: 'moderate',
      houseRules: RULES,
    });
    expect(conditions.length).toBe(2);
    expect(Date.parse(String(conditions[1].since))).toBeGreaterThanOrEqual(Date.parse(String(conditions[0].since)));
    expect((conditions[1].lines as Json[]).reduce((sum, line) => sum + Number(line.amount), 0)).toBe(3 * 12000 + 2000);
    expect(await api.hidden(`/bookings/${bookingId}/conditions`, una.token)).toBe(true);
  }, 60000);

  it("lists a traveller's quotes, the most recent first, and says which are still valid", async () => {
    const hal = await api.host('hal2@conditions.test');
    const tom = await api.traveller('tom2@conditions.test');
    const una = await api.traveller('una2@conditions.test');
    const id = await api.listing(hal.token);
    const older = await api.quote(tom.token, id, day(10), day(12));
    await sleep(1100);
    const newer = await api.quote(tom.token, id, day(30), day(31));
    await api.quote(una.token, id, day(40), day(41));
    const quotes = await api.list('/quotes/mine', tom.token);
    expect(quotes.map(each => [each.id, each.valid])).toEqual([
      [newer, true],
      [older, true],
    ]);
    expect(quotes[1]).toMatchObject({
      listingId: id,
      checkIn: day(10),
      checkOut: day(12),
      guests: 1,
      total: 2 * 10000 + 2000,
    });

    const expiring = database('conditions-ttl');
    const short = await start(expiring.path, { QUOTE_TTL_SECONDS: '1' });
    try {
      const quick = client(short.port);
      const ivy = await quick.host('ivy@conditions.test');
      const sam = await quick.traveller('sam@conditions.test');
      const listingId = await quick.listing(ivy.token);
      const quoteId = await quick.quote(sam.token, listingId, day(10), day(11));
      await sleep(2500);
      expect((await quick.list('/quotes/mine', sam.token)).map(each => [each.id, each.valid])).toEqual([
        [quoteId, false],
      ]);
    } finally {
      await stop(short);
      expiring.remove();
    }
  }, 90000);
});
