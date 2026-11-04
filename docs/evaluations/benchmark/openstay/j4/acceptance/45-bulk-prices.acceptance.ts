import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 45: the prices of many nights in one request, all or nothing. */
const db = database('bulk-prices');
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

const prices = async (id: string, from: number, to: number) =>
  (await api.list(`/listings/${id}/prices?from=${day(from)}&to=${day(to)}`)).map(each => each.nightlyPrice);
const night = (days: number, nightlyPrice: number) => ({ date: day(days), nightlyPrice });

describe('prices for many nights at once', () => {
  it('sets each night given, over what an earlier season said, up to 366 nights', async () => {
    const hal = await api.host('hal@bulk-prices.test');
    const tom = await api.traveller('tom@bulk-prices.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000 });
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(10),
      to: day(13),
      nightlyPrice: 15000,
    });
    await api.done('PUT', `/listings/${id}/prices`, hal.token, { prices: [night(11, 12000), night(20, 9000)] });
    expect(await prices(id, 10, 13)).toEqual([15000, 12000, 15000]);
    expect(await prices(id, 19, 21)).toEqual([10000, 9000]);
    const quoteId = await api.quote(tom.token, id, day(10), day(13));
    expect((await api.read(`/quotes/${quoteId}`, tom.token)).total).toBe(15000 + 12000 + 15000 + 2000);

    const year = await api.listing(hal.token, { nightlyPrice: 10000 });
    const all = Array.from({ length: 366 }, (_, n) => night(n + 1, 11000 + n));
    await api.done('PUT', `/listings/${year}/prices`, hal.token, { prices: all });
    expect(await prices(year, 1, 4)).toEqual([11000, 11001, 11002]);
    expect(await prices(year, 366, 368)).toEqual([11365, 10000]);
    const more = [...all, night(367, 11000)];
    expect(await api.refused('PUT', `/listings/${year}/prices`, hal.token, { prices: more })).toBe(true);
    expect(await prices(year, 367, 368)).toEqual([10000]);
  }, 60000);

  it('refuses them all for a date given twice, a date in the past or a price below 100 cents', async () => {
    const hal = await api.host('hal2@bulk-prices.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000 });
    const path = `/listings/${id}/prices`;
    expect(
      await api.refused('PUT', path, hal.token, { prices: [night(10, 12000), night(11, 12000), night(10, 13000)] }),
    ).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { prices: [night(10, 12000), night(-1, 12000)] })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { prices: [night(10, 12000), night(11, 99)] })).toBe(true);
    expect(await prices(id, 10, 12)).toEqual([10000, 10000]);
    await api.done('PUT', path, hal.token, { prices: [night(10, 100)] });
    expect(await prices(id, 10, 11)).toEqual([100]);
  }, 60000);

  it('keeps quotes and bookings already given, and lets only the host or a manager set prices', async () => {
    const hal = await api.host('hal3@bulk-prices.test');
    const ian = await api.host('ian3@bulk-prices.test');
    const mia = await api.host('mia3@bulk-prices.test');
    const tom = await api.traveller('tom3@bulk-prices.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000 });
    const quoteId = await api.quote(tom.token, id, day(30), day(32));
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(40), day(42)));

    await api.done('PUT', `/listings/${id}/prices`, hal.token, {
      prices: [night(30, 20000), night(31, 20000), night(40, 20000), night(41, 20000)],
    });
    expect((await api.read(`/quotes/${quoteId}`, tom.token)).total).toBe(22000);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).total).toBe(22000);
    expect((await api.read(`/bookings/${await api.book(tom.token, quoteId)}`, tom.token)).total).toBe(22000);

    expect(await api.refused('PUT', `/listings/${id}/prices`, ian.token, { prices: [night(50, 12000)] })).toBe(true);
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('PUT', `/listings/${id}/prices`, mia.token, { prices: [night(50, 12000)] });
    expect(await prices(id, 50, 51)).toEqual([12000]);
  }, 60000);
});
