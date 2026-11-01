import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 16: discounts for longer stays. */
const db = database('discounts');
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

const lines = (quote: Json) => quote.lines as { label: string; for: string; amount: number }[];
const discountLines = (quote: Json) => lines(quote).filter(line => line.amount < 0);

describe('discounts for longer stays', () => {
  it('takes the weekly discount from 7 nights and the monthly one from 28, on the nights only, as a line of its own', async () => {
    const hal = await api.host('hal@discounts.test');
    const tom = await api.traveller('tom@discounts.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000, cleaningFee: 2000 });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 100 });
    expect((await api.read(`/listings/${id}`)).discounts).toEqual({ weeklyPercent: 0, monthlyPercent: 0 });
    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 10, monthlyPercent: 20 });
    expect((await api.read(`/listings/${id}`)).discounts).toEqual({ weeklyPercent: 10, monthlyPercent: 20 });

    const quoted = async (nights: number) =>
      api.read(`/quotes/${await api.quote(tom.token, id, day(30), day(30 + nights))}`, tom.token);
    const six = await quoted(6);
    expect(discountLines(six)).toEqual([]);
    expect(six.total).toBe(60000 + 2000 + 600);

    const seven = await quoted(7);
    expect(discountLines(seven)).toEqual([expect.objectContaining({ for: 'host', amount: -7000 })]);
    expect(discountLines(seven)[0].label.length).toBeGreaterThan(0);
    expect(seven.total).toBe(70000 - 7000 + 2000 + 700);

    const month = await quoted(28);
    expect(discountLines(month)).toEqual([expect.objectContaining({ for: 'host', amount: -56000 })]);
    expect(month.total).toBe(280000 - 56000 + 2000 + 2800);
    expect(lines(month).reduce((total, line) => total + line.amount, 0)).toBe(month.total);
  }, 60000);

  it('rounds a discount down to the cent, keeps quotes as given, and refuses a percentage out of range', async () => {
    const hal = await api.host('hal2@discounts.test');
    const ian = await api.host('ian2@discounts.test');
    const tom = await api.traveller('tom2@discounts.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10001, cleaningFee: 0 });
    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 10, monthlyPercent: 10 });
    const quoteId = await api.quote(tom.token, id, day(30), day(37));
    const quote = await api.read(`/quotes/${quoteId}`, tom.token);
    expect(discountLines(quote)).toEqual([expect.objectContaining({ amount: -7000 })]);

    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 50, monthlyPercent: 50 });
    expect(await api.read(`/quotes/${quoteId}`, tom.token)).toEqual(quote);
    expect(
      await api.refused('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 51, monthlyPercent: 0 }),
    ).toBe(true);
    expect(
      await api.refused('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 0, monthlyPercent: -1 }),
    ).toBe(true);
    expect(
      await api.refused('PUT', `/listings/${id}/discounts`, ian.token, { weeklyPercent: 5, monthlyPercent: 5 }),
    ).toBe(true);
  }, 60000);
});
