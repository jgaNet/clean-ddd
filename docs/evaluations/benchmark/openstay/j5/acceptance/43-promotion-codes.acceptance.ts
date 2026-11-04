import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 43: a host's promotion codes, whose last use is used once. */
const db = database('codes');
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
const discountLines = (quote: Json) => (quote.lines as Line[]).filter(line => line.amount < 0);
const usesLeft = async (listingId: string, token: string) =>
  (await api.list(`/listings/${listingId}/codes`, token)).map(each => each.usesLeft);

describe('promotion codes', () => {
  it('creates codes in capitals, unique on the listing, and lists them in order to the host only', async () => {
    const hal = await api.host('hal@codes.test');
    const ian = await api.host('ian@codes.test');
    const id = await api.listing(hal.token);
    const path = `/listings/${id}/codes`;
    const friends = await api.create(path, hal.token, { code: 'friends10', percent: 10, uses: 2 });
    const back = await api.create(path, hal.token, { code: 'Back2026', percent: 25, uses: 1 });
    expect(await api.list(path, hal.token)).toEqual([
      expect.objectContaining({ id: friends, code: 'FRIENDS10', percent: 10, uses: 2, usesLeft: 2 }),
      expect.objectContaining({ id: back, code: 'BACK2026', percent: 25, uses: 1, usesLeft: 1 }),
    ]);

    expect(await api.refused('POST', path, hal.token, { code: 'FRIENDS10', percent: 20, uses: 1 })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { code: 'abc', percent: 10, uses: 1 })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { code: 'A'.repeat(21), percent: 10, uses: 1 })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { code: 'not-a-code', percent: 10, uses: 1 })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { code: 'HALF51', percent: 51, uses: 1 })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { code: 'NONE0', percent: 0, uses: 1 })).toBe(true);
    expect(await api.refused('POST', path, hal.token, { code: 'NOUSE', percent: 10, uses: 0 })).toBe(true);
    expect(await api.refused('POST', path, ian.token, { code: 'MINE', percent: 10, uses: 1 })).toBe(true);
    expect(await api.hidden(path, ian.token)).toBe(true);
    expect(await api.list(path, hal.token)).toHaveLength(2);
  }, 60000);

  it('gives the discount on the nights when quoted with a code, uses it on booking, and refuses an unknown one', async () => {
    const hal = await api.host('hal2@codes.test');
    const tom = await api.traveller('tom2@codes.test');
    const id = await api.listing(hal.token);
    const elsewhere = await api.listing(hal.token);
    await api.create(`/listings/${id}/codes`, hal.token, { code: 'FRIENDS10', percent: 10, uses: 2 });
    await api.create(`/listings/${elsewhere}/codes`, hal.token, { code: 'OTHER20', percent: 20, uses: 5 });
    const coded = async (checkIn: number, code: string) =>
      api.create('/quotes', tom.token, {
        listingId: id,
        checkIn: day(checkIn),
        checkOut: day(checkIn + 2),
        guests: 1,
        code,
      });

    const quoteId = await coded(10, 'Friends10');
    const quote = await api.read(`/quotes/${quoteId}`, tom.token);
    expect(discountLines(quote)).toEqual([expect.objectContaining({ for: 'host', amount: -2000 })]);
    expect(quote.total).toBe(20000 - 2000 + 2000);
    expect(String(quote.code).toUpperCase()).toBe('FRIENDS10');
    expect((await api.read(`/quotes/${await api.quote(tom.token, id, day(10), day(12))}`, tom.token)).code).toBeNull();
    const coding = (code: string) =>
      api.refused('POST', '/quotes', tom.token, {
        listingId: id,
        checkIn: day(20),
        checkOut: day(22),
        guests: 1,
        code,
      });
    expect(await coding('NOSUCH99')).toBe(true);
    expect(await coding('OTHER20')).toBe(true);

    const first = await api.book(tom.token, quoteId);
    expect(await usesLeft(id, hal.token)).toEqual([1]);
    await api.done('POST', `/bookings/${first}/cancel`, tom.token);
    expect(await usesLeft(id, hal.token)).toEqual([1]);
    await api.book(tom.token, await coded(30, 'friends10'));
    expect(await usesLeft(id, hal.token)).toEqual([0]);
    expect(await coding('FRIENDS10')).toBe(true);
  }, 60000);

  it('lets one of two bookings made at the same moment use the last use, and keeps the largest discount only', async () => {
    const hal = await api.host('hal3@codes.test');
    const tom = await api.traveller('tom3@codes.test');
    const una = await api.traveller('una3@codes.test');
    const id = await api.listing(hal.token);
    await api.create(`/listings/${id}/codes`, hal.token, { code: 'LAST1', percent: 10, uses: 1 });
    const quotes = await Promise.all([
      api.create('/quotes', tom.token, {
        listingId: id,
        checkIn: day(10),
        checkOut: day(11),
        guests: 1,
        code: 'LAST1',
      }),
      api.create('/quotes', una.token, {
        listingId: id,
        checkIn: day(20),
        checkOut: day(21),
        guests: 1,
        code: 'LAST1',
      }),
    ]);
    const outcomes = await Promise.all([
      api.act('POST', '/bookings', tom.token, { quoteId: quotes[0] }),
      api.act('POST', '/bookings', una.token, { quoteId: quotes[1] }),
    ]);
    expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
    expect(await usesLeft(id, hal.token)).toEqual([0]);

    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 20, monthlyPercent: 20 });
    await api.create(`/listings/${id}/codes`, hal.token, { code: 'SMALL10', percent: 10, uses: 5 });
    await api.create(`/listings/${id}/codes`, hal.token, { code: 'LARGE30', percent: 30, uses: 5 });
    const week = async (code: string) =>
      api.read(
        `/quotes/${await api.create('/quotes', tom.token, { listingId: id, checkIn: day(40), checkOut: day(47), guests: 1, code })}`,
        tom.token,
      );
    expect(discountLines(await week('SMALL10')).map(line => line.amount)).toEqual([-14000]);
    expect(discountLines(await week('LARGE30')).map(line => line.amount)).toEqual([-21000]);
  }, 60000);
});
