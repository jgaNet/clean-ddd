import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 42: a last-minute discount, and the largest discount only. */
const db = database('last-minute');
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

describe('last-minute prices', () => {
  it('takes the percentage off the nights of a stay that starts soon, as a line of its own, and not of a later one', async () => {
    const hal = await api.host('hal@last-minute.test');
    const tom = await api.traveller('tom@last-minute.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000, cleaningFee: 2000 });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 100 });
    expect((await api.read(`/listings/${id}`)).lastMinute).toBeNull();
    const before = await api.quote(tom.token, id, day(2), day(4));
    const given = await api.read(`/quotes/${before}`, tom.token);

    await api.done('PUT', `/listings/${id}/last-minute`, hal.token, { withinDays: 7, percent: 20 });
    expect((await api.read(`/listings/${id}`)).lastMinute).toEqual({ withinDays: 7, percent: 20 });
    const quoted = async (checkIn: number, checkOut: number) =>
      api.read(`/quotes/${await api.quote(tom.token, id, day(checkIn), day(checkOut))}`, tom.token);

    const soon = await quoted(2, 4);
    expect(discountLines(soon)).toEqual([expect.objectContaining({ for: 'host', amount: -4000 })]);
    expect(discountLines(soon)[0].label.length).toBeGreaterThan(0);
    expect(soon.total).toBe(20000 - 4000 + 2000 + 200);
    const later = await quoted(20, 22);
    expect(discountLines(later)).toEqual([]);
    expect(later.total).toBe(20000 + 2000 + 200);

    expect(discountLines(given)).toEqual([]);
    const kept = await api.read(`/bookings/${await api.book(tom.token, before)}`, tom.token);
    expect(kept).toMatchObject({ lines: given.lines, total: 20000 + 2000 + 200 });
  }, 60000);

  it('gives a stay that could have several discounts the largest one only, rounded down to the cent', async () => {
    const hal = await api.host('hal2@last-minute.test');
    const tom = await api.traveller('tom2@last-minute.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10001, cleaningFee: 2000 });
    await api.done('PUT', `/listings/${id}/last-minute`, hal.token, { withinDays: 10, percent: 20 });
    const quoted = async (checkIn: number, checkOut: number) =>
      api.read(`/quotes/${await api.quote(tom.token, id, day(checkIn), day(checkOut))}`, tom.token);

    // 20 % of 20 002 is 4 000.4: a line of -4 000.
    const short = await quoted(1, 3);
    expect(discountLines(short).map(line => line.amount)).toEqual([-4000]);
    expect(short.total).toBe(20002 - 4000 + 2000);

    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 10, monthlyPercent: 15 });
    // Seven nights, 70 007: last-minute 20 % (14 001) over weekly 10 %.
    const week = await quoted(2, 9);
    expect(discountLines(week).map(line => line.amount)).toEqual([-14001]);
    expect(week.total).toBe(70007 - 14001 + 2000);

    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 30, monthlyPercent: 30 });
    // Weekly 30 % of 70 007 is 21 002.1: a line of -21 002, and no last-minute line.
    const larger = await quoted(2, 9);
    expect(discountLines(larger).map(line => line.amount)).toEqual([-21002]);
    expect(larger.total).toBe(70007 - 21002 + 2000);
  }, 60000);

  it('refuses a percentage or a number of days out of range, and anyone but the host', async () => {
    const hal = await api.host('hal3@last-minute.test');
    const ian = await api.host('ian3@last-minute.test');
    const id = await api.listing(hal.token);
    const path = `/listings/${id}/last-minute`;
    expect(await api.refused('PUT', path, hal.token, { withinDays: 7, percent: 51 })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { withinDays: 0, percent: 20 })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { withinDays: 31, percent: 20 })).toBe(true);
    expect(await api.refused('PUT', path, ian.token, { withinDays: 7, percent: 20 })).toBe(true);
    expect((await api.read(`/listings/${id}`)).lastMinute).toBeNull();
  }, 60000);
});
