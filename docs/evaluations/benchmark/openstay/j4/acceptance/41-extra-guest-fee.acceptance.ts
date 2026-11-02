import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 41: a fee per guest above a number, per night, for the host. */
const db = database('extra-guests');
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
const lines = (quote: Json) => quote.lines as Line[];
/** The lines of `quote` that `before` does not have, by label and amount. */
const added = (quote: Json, before: Json) =>
  lines(quote).filter(line => !lines(before).some(each => each.label === line.label && each.amount === line.amount));

describe('a fee per extra guest', () => {
  it('adds a line for the host: the guests above the number, times the nights, times the fee, untouched by discounts', async () => {
    const hal = await api.host('hal@extra-guests.test');
    const tom = await api.traveller('tom@extra-guests.test');
    const id = await api.listing(hal.token, { capacity: 4, nightlyPrice: 10000, cleaningFee: 2000 });
    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 10, monthlyPercent: 20 });
    expect((await api.read(`/listings/${id}`)).extraGuests).toBeNull();
    const quoted = async (nights: number, guests: number) =>
      api.read(`/quotes/${await api.quote(tom.token, id, day(30), day(30 + nights), guests)}`, tom.token);
    const plain = { short: await quoted(3, 4), week: await quoted(7, 4), alone: await quoted(3, 1) };

    await api.done('PUT', `/listings/${id}/extra-guests`, hal.token, { fromGuests: 2, perGuestPerNight: 1500 });
    expect((await api.read(`/listings/${id}`)).extraGuests).toEqual({ fromGuests: 2, perGuestPerNight: 1500 });

    // Four guests, two above the number, three nights: 2 × 3 × 1 500.
    const short = await quoted(3, 4);
    expect(added(short, plain.short)).toEqual([expect.objectContaining({ for: 'host', amount: 9000 })]);
    expect(added(short, plain.short)[0].label.length).toBeGreaterThan(0);
    expect(lines(short)).toHaveLength(lines(plain.short).length + 1);
    expect(short.total).toBe(30000 + 2000 + 9000);

    // Seven nights: the weekly discount takes 10 % of the nights only, not of the 2 × 7 × 1 500.
    const week = await quoted(7, 4);
    expect(added(week, plain.week)).toEqual([expect.objectContaining({ for: 'host', amount: 21000 })]);
    expect(week.total).toBe(70000 - 7000 + 2000 + 21000);

    expect(lines(await quoted(3, 1))).toEqual(lines(plain.alone));
  }, 60000);

  it('adds no line for a fee of 0, and keeps quotes and bookings already given', async () => {
    const hal = await api.host('hal2@extra-guests.test');
    const tom = await api.traveller('tom2@extra-guests.test');
    const id = await api.listing(hal.token, { capacity: 4 });
    const plain = await api.read(`/quotes/${await api.quote(tom.token, id, day(30), day(32), 4)}`, tom.token);
    await api.done('PUT', `/listings/${id}/extra-guests`, hal.token, { fromGuests: 2, perGuestPerNight: 1500 });
    const quoteId = await api.quote(tom.token, id, day(40), day(42), 4);
    const given = await api.read(`/quotes/${quoteId}`, tom.token);
    expect(given.total).toBe(20000 + 2000 + 2 * 2 * 1500);

    await api.done('PUT', `/listings/${id}/extra-guests`, hal.token, { fromGuests: 2, perGuestPerNight: 0 });
    const free = await api.read(`/quotes/${await api.quote(tom.token, id, day(30), day(32), 4)}`, tom.token);
    expect(lines(free)).toEqual(lines(plain));
    expect(await api.read(`/quotes/${quoteId}`, tom.token)).toMatchObject({ lines: given.lines, total: given.total });
    const bookingId = await api.book(tom.token, quoteId);
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({
      lines: given.lines,
      total: given.total,
    });
  }, 60000);

  it('refuses a number or a fee out of range, and anyone but the host or a manager', async () => {
    const hal = await api.host('hal3@extra-guests.test');
    const ian = await api.host('ian3@extra-guests.test');
    const mia = await api.host('mia3@extra-guests.test');
    const id = await api.listing(hal.token, { capacity: 6 });
    const path = `/listings/${id}/extra-guests`;
    expect(await api.refused('PUT', path, hal.token, { fromGuests: 0, perGuestPerNight: 1000 })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { fromGuests: 21, perGuestPerNight: 1000 })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { fromGuests: 2, perGuestPerNight: -1 })).toBe(true);
    expect(await api.refused('PUT', path, ian.token, { fromGuests: 2, perGuestPerNight: 1000 })).toBe(true);
    expect((await api.read(`/listings/${id}`)).extraGuests).toBeNull();

    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('PUT', path, mia.token, { fromGuests: 4, perGuestPerNight: 800 });
    expect((await api.read(`/listings/${id}`)).extraGuests).toEqual({ fromGuests: 4, perGuestPerNight: 800 });
  }, 60000);
});
