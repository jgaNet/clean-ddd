import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 22: changing several calendars at once. Invariant 1, all or nothing. */
const db = database('bulk');
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

const nights = async (id: string, from: number, to: number) =>
  (await api.list(`/listings/${id}/calendar?from=${day(from)}&to=${day(to)}`)).map(each => each.available);

describe('changing several calendars at once', () => {
  it('blocks the same nights, and sets the same season, in several listings', async () => {
    const hal = await api.host('hal@bulk.test');
    const tom = await api.traveller('tom@bulk.test');
    const first = await api.listing(hal.token);
    const second = await api.listing(hal.token);
    await api.done('POST', '/hosts/me/block', hal.token, { listingIds: [first, second], from: day(10), to: day(12) });
    expect(await nights(first, 10, 13)).toEqual([false, false, true]);
    expect(await nights(second, 10, 13)).toEqual([false, false, true]);

    await api.done('POST', '/hosts/me/seasonal-prices', hal.token, {
      listingIds: [first, second],
      from: day(40),
      to: day(42),
      nightlyPrice: 15000,
    });
    for (const id of [first, second]) {
      const quoteId = await api.quote(tom.token, id, day(40), day(43));
      expect((await api.read(`/quotes/${quoteId}`, tom.token)).total).toBe(2 * 15000 + 10000 + 2000);
    }
  }, 60000);

  it("changes nothing when one listing is someone else's, does not exist, or has a night taken", async () => {
    const hal = await api.host('hal2@bulk.test');
    const ian = await api.host('ian2@bulk.test');
    const tom = await api.traveller('tom2@bulk.test');
    const mine = await api.listing(hal.token);
    const booked = await api.listing(hal.token);
    const theirs = await api.listing(ian.token);
    await api.book(tom.token, await api.quote(tom.token, booked, day(21), day(22)));
    const requested = await api.listing(hal.token);
    await api.done('PUT', `/listings/${requested}/booking-mode`, hal.token, { mode: 'request' });
    await api.book(tom.token, await api.quote(tom.token, requested, day(22), day(23)));
    const block = (listingIds: string[]) =>
      api.refused('POST', '/hosts/me/block', hal.token, { listingIds, from: day(20), to: day(23) });

    expect(await block([mine, theirs])).toBe(true);
    expect(await block([mine, 'no-such-listing'])).toBe(true);
    expect(await block([mine, booked])).toBe(true);
    expect(await block([mine, requested])).toBe(true);
    expect(
      await api.refused('POST', '/hosts/me/seasonal-prices', hal.token, {
        listingIds: [mine, theirs],
        from: day(20),
        to: day(23),
        nightlyPrice: 15000,
      }),
    ).toBe(true);
    expect(await nights(mine, 20, 23)).toEqual([true, true, true]);
    expect(await nights(theirs, 20, 23)).toEqual([true, true, true]);
    expect(
      (await api.list(`/listings/${mine}/prices?from=${day(20)}&to=${day(21)}`)).map(each => each.nightlyPrice),
    ).toEqual([10000]);
  }, 60000);

  it('never ends with both a booking and a bulk block on the same nights, made at the same moment', async () => {
    const hal = await api.host('hal3@bulk.test');
    const tom = await api.traveller('tom3@bulk.test');
    const first = await api.listing(hal.token);
    const second = await api.listing(hal.token);
    for (let round = 0; round < 6; round++) {
      const checkIn = 50 + round * 3;
      const quoteId = await api.quote(tom.token, second, day(checkIn), day(checkIn + 2));
      const [booking, block] = await Promise.all([
        api.act('POST', '/bookings', tom.token, { quoteId }),
        api.act('POST', '/hosts/me/block', hal.token, {
          listingIds: [first, second],
          from: day(checkIn),
          to: day(checkIn + 2),
        }),
      ]);
      expect([booking.accepted, block.accepted]).not.toEqual([true, true]);
      expect(booking.accepted || block.accepted).toBe(true);
      expect(await nights(first, checkIn, checkIn + 2)).toEqual(block.accepted ? [false, false] : [true, true]);
    }
  }, 120000);
});
