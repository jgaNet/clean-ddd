import {
  adminEnvironment,
  clock,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  start,
  stop,
} from './openstay';

/**
 * Request 92: a city's tourist tax rules, each from its own date; each night taxed by the rule in force that
 * night, a night before every rule by the host's own figure; a quote keeps what it showed.
 */
const db = database('tax-rates-by-date');
const ADMIN = 'ada@tax-dates.test';
let server: Running;
let api: Client;
let admin: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, adminEnvironment(ADMIN));
  api = client(server.port);
  admin = await api.admin(ADMIN);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

type Line = { label: string; for: string; amount: number };
/** The tax of a quote or a booking: its one `external` line (request 5), the total still the sum of the lines. */
const taxOf = (priced: Json) => {
  const lines = priced.lines as Line[];
  const external = lines.filter(line => line.for === 'external');
  expect(external).toHaveLength(1);
  expect(lines.reduce((total, line) => total + line.amount, 0)).toBe(priced.total);
  return external[0].amount;
};
const path = (city: string) => `/admin/cities/${encodeURIComponent(city)}/tourist-tax`;
const rule = (city: string, body: Json, token = admin.token) => api.act('PUT', path(city), token, body);
const setRule = async (city: string, body: Json) => {
  const outcome = await rule(city, body);
  if (!outcome.accepted) throw new Error(`the rule of ${city} was refused: ${JSON.stringify(outcome.result)}`);
};
const rules = (city: string) => api.list(path(city), admin.token);
const quoted = async (
  token: string,
  listingId: string,
  from: number,
  to: number,
  guests: number,
  children?: number,
) => {
  const id = await api.create('/quotes', token, {
    listingId,
    checkIn: day(from),
    checkOut: day(to),
    guests,
    ...(children !== undefined && { children }),
  });
  return api.read(`/quotes/${id}`, token);
};
/** A published listing in `city` whose host declared 100 per guest and night. */
const listing = async (token: string, city: string, fields: Json = {}) => {
  const id = await api.listing(token, { city, capacity: 4, ...fields });
  await api.done('PUT', `/listings/${id}/tourist-tax`, token, { perGuestPerNight: 100 });
  return id;
};

describe('tax rates that change on a date', () => {
  it('taxes each night by the rule with the latest date on or before it, and keeps them in the order of their dates', async () => {
    const hal = await api.host('hal@tax-dates.test');
    const tom = await api.traveller('tom@tax-dates.test');
    const id = await listing(hal.token, 'Colmar');
    await setRule('Colmar', { kind: 'per-guest-night', amount: 400, from: day(12) });
    await setRule('colmar', { kind: 'per-guest-night', amount: 300, from: day(10) });
    expect(await rules('Colmar')).toEqual([
      expect.objectContaining({ from: day(10), kind: 'per-guest-night', amount: 300, childrenUnder: null }),
      expect.objectContaining({ from: day(12), kind: 'per-guest-night', amount: 400, childrenUnder: null }),
    ]);
    // No rule is in force today.
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toBeNull();

    // The host's 2 × 100, then 600, 600 and 800.
    const quote = await quoted(tom.token, id, 9, 13, 2);
    expect(taxOf(quote)).toBe(2200);

    // The same date replaces that rule; the others stay. A quote given keeps its tax.
    await setRule('Colmar', { kind: 'per-guest-night', amount: 500, from: day(12) });
    expect((await rules('Colmar')).map(each => [each.from, each.amount])).toEqual([
      [day(10), 300],
      [day(12), 500],
    ]);
    expect(taxOf(await api.read(`/quotes/${String(quote.id)}`, tom.token))).toBe(2200);
    expect(taxOf(await quoted(tom.token, id, 9, 13, 2))).toBe(2400);

    // Without `from`, a rule is from today, and is the one in force.
    await setRule('Colmar', { kind: 'per-guest-night', amount: 250 });
    expect((await rules('Colmar')).map(each => [each.from, each.amount])).toEqual([
      [day(0), 250],
      [day(10), 300],
      [day(12), 500],
    ]);
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toMatchObject({
      kind: 'per-guest-night',
      amount: 250,
      childrenUnder: null,
    });
    expect(taxOf(await quoted(tom.token, id, 3, 5, 2))).toBe(1000);
  }, 90000);

  it("applies each rule's own kind and exemption, and the host's figure, nobody exempt, before every rule", async () => {
    const hal = await api.host('hal2@tax-dates.test');
    const tom = await api.traveller('tom2@tax-dates.test');
    const id = await listing(hal.token, 'Sarlat', { nightlyPrice: 12000 });
    await setRule('Sarlat', { kind: 'per-guest-night', amount: 300, childrenUnder: 12, from: day(20) });
    await setRule('Sarlat', { kind: 'percent', percent: 5, capPerGuestNight: 1000, from: day(22) });
    expect(await rules('Sarlat')).toEqual([
      expect.objectContaining({ from: day(20), kind: 'per-guest-night', amount: 300, childrenUnder: 12 }),
      expect.objectContaining({
        from: day(22),
        kind: 'percent',
        percent: 5,
        capPerGuestNight: 1000,
        childrenUnder: null,
      }),
    ]);

    // 3 guests of whom 1 child: 3 × 100, then 2 × 300 twice, then 3 × (12 000 ÷ 3 × 5 %).
    expect(taxOf(await quoted(tom.token, id, 19, 23, 3, 1))).toBe(2100);

    // A booking keeps its tax, even when a rule set afterwards starts on its nights.
    const bookingId = await api.book(tom.token, String((await quoted(tom.token, id, 30, 32, 3, 1)).id));
    expect(taxOf(await api.read(`/bookings/${bookingId}`, tom.token))).toBe(1200);
    await setRule('Sarlat', { kind: 'per-guest-night', amount: 50, from: day(30) });
    expect(taxOf(await api.read(`/bookings/${bookingId}`, tom.token))).toBe(1200);

    // A change of dates is priced as a quote for the new dates would be today.
    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, { checkIn: day(31), checkOut: day(33) });
    expect(taxOf(await api.read(`/bookings/${bookingId}`, tom.token))).toBe(300);
  }, 90000);

  it('refuses a date before today and anyone but an administrator, and writes each rule in the audit log', async () => {
    const tom = await api.traveller('tom3@tax-dates.test');
    const hal = await api.host('hal3@tax-dates.test');
    expect(await rules('Nowhere')).toEqual([]);
    for (const token of [tom.token, hal.token]) {
      expect((await api.call('GET', path('Vannes'), token)).status).toBe(403);
      expect(await api.refused('PUT', path('Vannes'), token, { kind: 'per-guest-night', amount: 100 })).toBe(true);
    }
    expect((await rule('Vannes', { kind: 'per-guest-night', amount: 100, from: day(-1) })).accepted).toBe(false);
    expect((await rule('Vannes', { kind: 'per-guest-night', amount: 100, from: 'next spring' })).accepted).toBe(false);
    expect(await rules('Vannes')).toEqual([]);

    await setRule('Vannes', { kind: 'per-guest-night', amount: 100, from: day(40) });
    await setRule('VANNES', { kind: 'per-guest-night', amount: 120, from: day(50) });
    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=vannes', admin.token),
      found => found.length >= 2,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId: admin.id, action: 'city-tourist-tax-set', subjectId: 'vannes', note: null }),
      expect.objectContaining({ adminId: admin.id, action: 'city-tourist-tax-set', subjectId: 'vannes', note: null }),
    ]);
  }, 60000);

  it("reads today as the server's date moved by CLOCK_OFFSET_DAYS", async () => {
    const hal = await api.host('hal4@tax-dates.test');
    const id = await listing(hal.token, 'Dax');
    await setRule('Dax', { kind: 'per-guest-night', amount: 100, from: day(0) });
    await setRule('Dax', { kind: 'per-guest-night', amount: 200, from: day(4) });
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toMatchObject({ amount: 100 });

    server = await restart(server, db.path, { ...adminEnvironment(ADMIN), ...clock(5) });
    api = client(server.port);
    admin = { ...admin, token: await api.login(ADMIN) };
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toMatchObject({ amount: 200 });
    expect((await rule('Dax', { kind: 'per-guest-night', amount: 300, from: day(3) })).accepted).toBe(false);
    await setRule('Dax', { kind: 'per-guest-night', amount: 300 });
    expect((await rules('Dax')).map(each => [each.from, each.amount])).toEqual([
      [day(0), 100],
      [day(4), 200],
      [day(5), 300],
    ]);
    expect((await api.read(`/listings/${id}`)).cityTouristTax).toMatchObject({ amount: 300 });
  }, 90000);
});
