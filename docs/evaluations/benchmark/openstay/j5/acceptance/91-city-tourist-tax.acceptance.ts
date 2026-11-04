import { adminEnvironment, client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';

/**
 * Request 91: the tourist tax set by the city, per guest and night or a percent of each night's price capped
 * per guest and night, children exempt where the city says so, replacing the host's own figure for the quotes
 * made after it.
 */
const db = database('city-tourist-tax');
let server: Running;
let api: Client;
let admin: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, adminEnvironment('ada@city-tax.test'));
  api = client(server.port);
  admin = await api.admin('ada@city-tax.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

type Line = { label: string; for: string; amount: number };
const sum = (lines: Line[]) => lines.reduce((total, line) => total + line.amount, 0);
/** The tax of a quote or a booking: its one `external` line (request 5), the total still the sum of the lines. */
const taxOf = (priced: Json) => {
  const lines = priced.lines as Line[];
  const external = lines.filter(line => line.for === 'external');
  expect(external).toHaveLength(1);
  expect(sum(lines)).toBe(priced.total);
  return external[0].amount;
};
const rule = (city: string, body: Json, token = admin.token) =>
  api.act('PUT', `/admin/cities/${encodeURIComponent(city)}/tourist-tax`, token, body);
const setRule = async (city: string, body: Json) => {
  const outcome = await rule(city, body);
  if (!outcome.accepted) throw new Error(`the rule of ${city} was refused: ${JSON.stringify(outcome.result)}`);
};
const quoteBody = (listingId: string, from: number, to: number, guests: number, children?: number) => ({
  listingId,
  checkIn: day(from),
  checkOut: day(to),
  guests,
  ...(children !== undefined && { children }),
});
const ask = (token: string, listingId: string, from: number, to: number, guests: number, children?: number) =>
  api.create('/quotes', token, quoteBody(listingId, from, to, guests, children));
const quoted = async (token: string, listingId: string, from: number, to: number, guests: number, children?: number) =>
  api.read(`/quotes/${await ask(token, listingId, from, to, guests, children)}`, token);

describe('tourist tax set by the city', () => {
  it("replaces the host's figure for the quotes made after it, in that city whatever its case or country", async () => {
    const hal = await api.host('hal@city-tax.test');
    const tom = await api.traveller('tom@city-tax.test');
    const id = await api.listing(hal.token, { city: 'Saint Malo', capacity: 4 });
    const upper = await api.listing(hal.token, { city: 'SAINT MALO', capacity: 4 });
    await api.done('PUT', `/listings/${upper}/country`, hal.token, { country: 'GB' });
    const elsewhere = await api.listing(hal.token, { city: 'Dinard', capacity: 4 });
    for (const each of [id, upper, elsewhere])
      await api.done('PUT', `/listings/${each}/tourist-tax`, hal.token, { perGuestPerNight: 150 });
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toBeNull();

    // Before the rule: the host's figure, guests × nights × 150.
    const before = await quoted(tom.token, id, 10, 13, 2);
    expect(taxOf(before)).toBe(900);
    const bookedBefore = await api.book(tom.token, await ask(tom.token, id, 20, 23, 2));
    const booking = await api.read(`/bookings/${bookedBefore}`, tom.token);
    expect(taxOf(booking)).toBe(900);

    await setRule('saint malo', { kind: 'per-guest-night', amount: 300 });
    for (const each of [id, upper]) {
      const listing = await api.read(`/listings/${each}`);
      expect(listing.cityTouristTax).toMatchObject({ kind: 'per-guest-night', amount: 300, childrenUnder: null });
      // The host's own declaration stays on the listing, unused.
      expect(listing.touristTax).toBe(150);
    }
    expect((await api.read(`/listings/${elsewhere}`)).cityTouristTax).toBeNull();

    expect(taxOf(await quoted(tom.token, id, 30, 33, 2))).toBe(1800);
    expect(taxOf(await quoted(tom.token, upper, 30, 32, 2))).toBe(1200);
    expect(taxOf(await quoted(tom.token, elsewhere, 30, 32, 2))).toBe(600);

    // What was given before keeps its tax.
    expect(taxOf(await api.read(`/quotes/${String(before.id)}`, tom.token))).toBe(900);
    expect(taxOf(await api.read(`/bookings/${bookedBefore}`, tom.token))).toBe(900);

    // Setting the rule again replaces it.
    await setRule('Saint Malo', { kind: 'per-guest-night', amount: 200, childrenUnder: 12 });
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toMatchObject({
      kind: 'per-guest-night',
      amount: 200,
      childrenUnder: 12,
    });
    expect(taxOf(await quoted(tom.token, id, 40, 43, 2))).toBe(1200);
  }, 90000);

  it("takes a percent of each night's own price per guest, rounded down and capped, and exempts the children", async () => {
    const hal = await api.host('hal2@city-tax.test');
    const tom = await api.traveller('tom2@city-tax.test');
    await setRule('Biarritz', { kind: 'percent', percent: 5, capPerGuestNight: 250, childrenUnder: 12 });
    expect(
      (await api.read(`/listings/${await api.listing(hal.token, { city: 'Biarritz' })}`)).cityTouristTax,
    ).toMatchObject({ kind: 'percent', percent: 5, capPerGuestNight: 250, childrenUnder: 12 });

    const id = await api.listing(hal.token, { city: 'biarritz', capacity: 4, nightlyPrice: 12000, cleaningFee: 2000 });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 150 });
    // Neither the cleaning fee nor the extra guests' fee is taxed; a season's price is.
    await api.done('PUT', `/listings/${id}/extra-guests`, hal.token, { fromGuests: 2, perGuestPerNight: 1000 });
    await api.done('POST', `/listings/${id}/seasonal-prices`, hal.token, {
      from: day(21),
      to: day(22),
      nightlyPrice: 30000,
    });
    // 12 000 ÷ 3 × 5 % = 200 per guest, 2 taxable: 400; 30 000 ÷ 3 × 5 % = 500, capped at 250: 500.
    const quote = await quoted(tom.token, id, 20, 22, 3, 1);
    expect(quote).toMatchObject({ guests: 3, children: 1 });
    expect(taxOf(quote)).toBe(900);

    // Without children, every guest is taxed.
    const all = await quoted(tom.token, id, 20, 22, 3);
    expect(all.children).toBe(0);
    expect(taxOf(all)).toBe(1350);

    // 10 000 ÷ 3 × 5 % = 166.66…, rounded down to 166 per guest: 3 × 166 a night, two nights.
    const round = await api.listing(hal.token, { city: 'Biarritz', capacity: 4, nightlyPrice: 10000 });
    await api.done('PUT', `/listings/${round}/tourist-tax`, hal.token, { perGuestPerNight: 150 });
    expect(taxOf(await quoted(tom.token, round, 30, 32, 3))).toBe(996);
  }, 90000);

  it("counts children as guests, refuses more children than guests, and keeps a booking's children", async () => {
    const hal = await api.host('hal3@city-tax.test');
    const tom = await api.traveller('tom3@city-tax.test');
    await setRule('Arcachon', { kind: 'per-guest-night', amount: 300, childrenUnder: 12 });
    const id = await api.listing(hal.token, { city: 'Arcachon', capacity: 3 });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 100 });

    const quote = await quoted(tom.token, id, 10, 12, 3, 1);
    expect(quote.children).toBe(1);
    expect(taxOf(quote)).toBe(1200);
    expect(await api.refused('POST', '/quotes', tom.token, quoteBody(id, 10, 12, 2, 3))).toBe(true);
    // Children are guests for the capacity.
    expect(await api.refused('POST', '/quotes', tom.token, quoteBody(id, 10, 12, 4, 2))).toBe(true);

    const bookingId = await api.book(tom.token, String(quote.id));
    const booking = await api.read(`/bookings/${bookingId}`, tom.token);
    expect(booking.children).toBe(1);
    expect(taxOf(booking)).toBe(1200);

    // A change of dates is priced as a quote would be today, with the booking's children.
    await setRule('Arcachon', { kind: 'per-guest-night', amount: 500, childrenUnder: 12 });
    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, { checkIn: day(14), checkOut: day(17) });
    const changed = await api.read(`/bookings/${bookingId}`, tom.token);
    expect(changed).toMatchObject({ checkIn: day(14), checkOut: day(17), children: 1 });
    expect(taxOf(changed)).toBe(3000);

    // Where the city exempts nobody, or has no rule, children change nothing.
    await setRule('Royan', { kind: 'per-guest-night', amount: 200 });
    const nobody = await api.listing(hal.token, { city: 'Royan', capacity: 3 });
    await api.done('PUT', `/listings/${nobody}/tourist-tax`, hal.token, { perGuestPerNight: 100 });
    expect(taxOf(await quoted(tom.token, nobody, 10, 12, 2, 1))).toBe(800);
    const free = await api.listing(hal.token, { city: 'Cognac', capacity: 3 });
    await api.done('PUT', `/listings/${free}/tourist-tax`, hal.token, { perGuestPerNight: 100 });
    expect(taxOf(await quoted(tom.token, free, 10, 12, 2, 1))).toBe(400);
  }, 90000);

  it('is set by administrators only, refuses a rule that makes no sense, and writes each rule in the audit log', async () => {
    const hal = await api.host('hal4@city-tax.test');
    const tom = await api.traveller('tom4@city-tax.test');
    const id = await api.listing(hal.token, { city: 'Menton' });
    for (const token of [tom.token, hal.token])
      expect(
        (
          await api.call('PUT', '/admin/cities/Menton/tourist-tax', token, {
            kind: 'percent',
            percent: 2,
            capPerGuestNight: 100,
          })
        ).status,
      ).toBe(403);

    for (const body of [
      { kind: 'percent', percent: 0, capPerGuestNight: 100 },
      { kind: 'percent', percent: 11, capPerGuestNight: 100 },
      { kind: 'percent', percent: 2.5, capPerGuestNight: 100 },
      { kind: 'percent', percent: 5, capPerGuestNight: -1 },
      { kind: 'per-guest-night', amount: -1 },
      { kind: 'per-guest-night', amount: 100, childrenUnder: 0 },
      { kind: 'per-guest-night', amount: 100, childrenUnder: 19 },
      { kind: 'per-stay', amount: 100 },
    ])
      expect((await rule('Menton', body)).accepted).toBe(false);
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toBeNull();

    await setRule('Menton', { kind: 'per-guest-night', amount: 0, childrenUnder: 18 });
    await setRule('MENTON', { kind: 'percent', percent: 10, capPerGuestNight: 0, childrenUnder: null });
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toMatchObject({
      kind: 'percent',
      percent: 10,
      capPerGuestNight: 0,
      childrenUnder: null,
    });
    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=menton', admin.token),
      found => found.length >= 2,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId: admin.id, action: 'city-tourist-tax-set', subjectId: 'menton', note: null }),
      expect.objectContaining({ adminId: admin.id, action: 'city-tourist-tax-set', subjectId: 'menton', note: null }),
    ]);
  }, 90000);
});
