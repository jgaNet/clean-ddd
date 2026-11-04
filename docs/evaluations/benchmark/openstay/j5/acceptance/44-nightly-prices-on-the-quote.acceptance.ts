import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 44: each night of a stay, with its price, on the quote and the booking. */
const db = database('nightly-prices');
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

type Line = { label: string; for: string; amount: number };
const nights = (read: Json) => (read.nightlyPrices as Json[]).map(night => [night.date, night.price]);
const sum = (read: Json) => (read.nightlyPrices as Json[]).reduce((total, night) => total + Number(night.price), 0);
const hasLine = (read: Json, amount: number) =>
  (read.lines as Line[]).some(line => line.for === 'host' && line.amount === amount);

describe("each night's price on the quote", () => {
  it('shows each night in date order at the price the quote gave it, adding up to the nights line', async () => {
    const hal = await api.host('hal@nightly-prices.test');
    const tom = await api.traveller('tom@nightly-prices.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000 });
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(31),
      to: day(32),
      nightlyPrice: 15000,
    });
    const quote = await api.read(`/quotes/${await api.quote(tom.token, id, day(30), day(33))}`, tom.token);
    expect(nights(quote)).toEqual([
      [day(30), 10000],
      [day(31), 15000],
      [day(32), 10000],
    ]);
    expect(hasLine(quote, sum(quote))).toBe(true);
    expect(sum(quote)).toBe(35000);

    // Before any discount: seven nights keep their own prices, and the weekly line comes apart.
    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 10, monthlyPercent: 20 });
    const week = await api.read(`/quotes/${await api.quote(tom.token, id, day(30), day(37))}`, tom.token);
    expect(nights(week).map(([, price]) => price)).toEqual([10000, 15000, 10000, 10000, 10000, 10000, 10000]);
    expect(sum(week)).toBe(75000);
    expect(hasLine(week, 75000)).toBe(true);
    expect(hasLine(week, -7500)).toBe(true);
  }, 60000);

  it("shows on a booking the nights of its quote, and after a change of dates the new stay's", async () => {
    const hal = await api.host('hal2@nightly-prices.test');
    const tom = await api.traveller('tom2@nightly-prices.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000 });
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(21),
      to: day(22),
      nightlyPrice: 15000,
    });
    const quoteId = await api.quote(tom.token, id, day(20), day(22));
    const quote = await api.read(`/quotes/${quoteId}`, tom.token);
    const bookingId = await api.book(tom.token, quoteId);
    expect(nights(await api.read(`/bookings/${bookingId}`, tom.token))).toEqual(nights(quote));

    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, { checkIn: day(21), checkOut: day(24) });
    const changed = await api.read(`/bookings/${bookingId}`, hal.token);
    expect(nights(changed)).toEqual([
      [day(21), 15000],
      [day(22), 10000],
      [day(23), 10000],
    ]);
    expect(hasLine(changed, 35000)).toBe(true);
  }, 60000);
});
