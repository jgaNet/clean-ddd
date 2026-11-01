import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 15: seasonal prices. Invariant 8. */
const db = database('seasons');
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

const hostTotal = (quote: Json) =>
  (quote.lines as { for: string; amount: number }[])
    .filter(line => line.for === 'host')
    .reduce((total, line) => total + line.amount, 0);

describe('seasonal prices', () => {
  it('prices each night by its season, a later season over an earlier one, and clears a range', async () => {
    const hal = await api.host('hal@seasons.test');
    const tom = await api.traveller('tom@seasons.test');
    const id = await api.listing(hal.token);
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(30),
      to: day(33),
      nightlyPrice: 20000,
    });
    const prices = async (from: number, to: number) =>
      (await api.list(`/listings/${id}/prices?from=${day(from)}&to=${day(to)}`)).map(each => [
        each.date,
        each.nightlyPrice,
      ]);
    expect(await prices(29, 34)).toEqual([
      [day(29), 10000],
      [day(30), 20000],
      [day(31), 20000],
      [day(32), 20000],
      [day(33), 10000],
    ]);

    const quoteId = await api.quote(tom.token, id, day(29), day(32));
    const quote = await api.read(`/quotes/${quoteId}`, tom.token);
    expect(hostTotal(quote)).toBe(10000 + 20000 + 20000 + 2000);
    const bookingId = await api.book(tom.token, quoteId);

    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(32),
      to: day(35),
      nightlyPrice: 15000,
    });
    await api.done('POST', `/listings/${id}/seasonal-prices/clear`, hal.token, { from: day(30), to: day(31) });
    expect((await prices(30, 35)).map(([, price]) => price)).toEqual([10000, 20000, 15000, 15000, 15000]);
    expect(await api.read(`/quotes/${quoteId}`, tom.token)).toEqual(quote);
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(29),
      to: day(32),
      nightlyPrice: 30000,
    });
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).total).toBe(quote.total);
  }, 60000);

  it('keeps the highest-price filter on the nightly price, and lets only the host set seasons', async () => {
    const hal = await api.host('hal2@seasons.test');
    const ian = await api.host('ian2@seasons.test');
    const id = await api.listing(hal.token, { city: 'Biarritz' });
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(40),
      to: day(45),
      nightlyPrice: 50000,
    });
    const dear = await api.listing(hal.token, { city: 'Biarritz', nightlyPrice: 15000 });
    await api.done('POST', `/listings/${dear}/seasonal-prices`, hal.token, {
      from: day(40),
      to: day(45),
      nightlyPrice: 9000,
    });
    expect(
      (await api.list(`/listings?city=Biarritz&checkIn=${day(41)}&checkOut=${day(43)}&maxPrice=12000`)).map(
        each => each.id,
      ),
    ).toEqual([id]);
    expect(
      await api.refused('POST', `/listings/${id}/seasonal-prices`, ian.token, {
        from: day(40),
        to: day(41),
        nightlyPrice: 9000,
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/listings/${id}/seasonal-prices`, hal.token, {
        from: day(40),
        to: day(41),
        nightlyPrice: 99,
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/listings/${id}/seasonal-prices/clear`, ian.token, { from: day(40), to: day(41) }),
    ).toBe(true);
  }, 60000);
});
