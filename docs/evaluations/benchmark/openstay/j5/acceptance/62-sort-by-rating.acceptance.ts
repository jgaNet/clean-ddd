import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 62: a search sorted by rating when asked, the order it used stated in `X-Order`, the same
 * listings found whatever the order, and the order following the reviews.
 */
const db = database('sort-by-rating');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
type Person = { id: string; email: string; token: string };
let hal: Person;
let tom: Person;
let una: Person;
/**
 * Five listings in one city, by nightly price: E 90 €, A 100 €, C 110 €, B 120 €, D 130 €. A, B, C and
 * D had a stay that took place; A and D are rated 3.0, B 5.0, C and E not yet.
 */
const listings = { A: '', B: '', C: '', D: '', E: '' };
const bookings = { A: '', B: '', C: '', D: '' };
const CITY = 'Starville';

/** The traveller's review and the host's review of the guest: both written, both published (request 58). */
async function reviewed(stay: keyof typeof bookings, score: number) {
  const bookingId = bookings[stay];
  await api.create(`/bookings/${bookingId}/review`, tom.token, {
    cleanliness: score,
    accuracy: score,
    communication: score,
    comment: 'A stay exactly as the listing said.',
  });
  await api.create(`/bookings/${bookingId}/guest-review`, hal.token, {
    rating: 5,
    comment: 'A careful guest, welcome back any time.',
  });
}

beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await api.host('hal@sort-by-rating.test');
  tom = await api.traveller('tom@sort-by-rating.test');
  una = await api.traveller('una@sort-by-rating.test');
  const prices = { A: 10000, B: 12000, C: 11000, D: 13000, E: 9000 };
  for (const name of ['A', 'B', 'C', 'D', 'E'] as const)
    listings[name] = await api.listing(hal.token, { city: CITY, nightlyPrice: prices[name] });
  for (const name of ['A', 'B', 'C', 'D'] as const) {
    bookings[name] = await api.book(tom.token, await api.quote(tom.token, listings[name], day(0), day(1)));
    await payBooking(api, provider, tom.token, bookings[name]);
  }
  // A, B and C inside a box, D outside it, E never placed (request 14).
  for (const name of ['A', 'B', 'C'] as const)
    await api.done('PUT', `/listings/${listings[name]}/location`, hal.token, { latitude: 45.5, longitude: 4.5 });
  await api.done('PUT', `/listings/${listings.D}/location`, hal.token, { latitude: 10, longitude: 10 });

  // Three days later, the stays took place and can be reviewed (request 57).
  server = await restart(server, db.path, { ...environment, ...clock(3) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of [hal, tom, una]) person.token = await api.login(person.email);
  await reviewed('A', 3);
  await reviewed('B', 5);
  await reviewed('D', 3);
  await eventually(
    () => api.list(`/listings?city=${CITY}`),
    found =>
      [listings.A, listings.B, listings.D].every(id => (found.find(each => each.id === id)?.rating as Json | null)?.count === 1),
  );
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** A search, its listings' ids in the order answered, and its `X-Order` header. */
async function search(query: string, token?: string) {
  const answer = await api.readWith(`/listings?${query}`, token);
  expect(answer.status).toBe(200);
  const found = answer.body as unknown as Json[];
  return { ids: found.map(each => String(each.id)), found, order: answer.headers.get('x-order') };
}
const named = (ids: string[]) =>
  ids.map(id => Object.entries(listings).find(([, each]) => each === id)?.[0] ?? id).join('');

describe('sorting by rating', () => {
  it('puts the highest overall first, the unrated last, and ties in the default order, and says so', async () => {
    const sorted = await search(`city=${CITY}&sort=rating`);
    expect(named(sorted.ids)).toBe('BADEC');
    expect(sorted.order).toBe('rating');
    expect(sorted.found.find(each => each.id === listings.B)?.rating).toMatchObject({ overall: 5, count: 1 });
    expect(sorted.found.find(each => each.id === listings.C)?.rating).toBeNull();

    // The order is the same for everyone.
    expect(named((await search(`city=${CITY}&sort=rating`, una.token)).ids)).toBe('BADEC');
    expect(named((await search(`city=starville&sort=rating`, tom.token)).ids)).toBe('BADEC');
  }, 60000);

  it('keeps the default order without sort or with sort=default, and says so', async () => {
    for (const query of [`city=${CITY}`, `city=${CITY}&sort=default`]) {
      const answer = await search(query);
      expect(named(answer.ids)).toBe('EACBD');
      expect(answer.order).toBe('default');
    }
  }, 60000);

  it('finds the same listings, with the same fields, whatever the sort', async () => {
    const plain = await search(`city=${CITY}`);
    const sorted = await search(`city=${CITY}&sort=rating`);
    expect([...sorted.ids].sort()).toEqual([...plain.ids].sort());
    for (const listing of sorted.found) expect(listing).toEqual(plain.found.find(each => each.id === listing.id));
  }, 60000);

  it('refuses any other sort as a search that makes no sense', async () => {
    for (const sort of ['price', 'random', 'rating-desc'])
      expect((await api.call('GET', `/listings?city=${CITY}&sort=${sort}`)).status).toBe(400);
  }, 60000);

  it('applies the area, the dates and the filters as before, and changes only the order', async () => {
    // At most 120 €: D is not found.
    const cheap = await search(`city=${CITY}&maxPrice=12000&sort=rating`);
    expect(named(cheap.ids)).toBe('BAEC');
    expect(cheap.order).toBe('rating');
    expect(named((await search(`city=${CITY}&maxPrice=12000`)).ids)).toBe('EACB');

    // An area holding A, B and C only.
    const area = await search('south=45&west=4&north=46&east=5&sort=rating');
    expect(named(area.ids)).toBe('BAC');
    expect(area.order).toBe('rating');

    // Nights booked on A: A is not found for them.
    await api.book(una.token, await api.quote(una.token, listings.A, day(20), day(21)));
    const dated = await search(`city=${CITY}&checkIn=${day(20)}&checkOut=${day(21)}&guests=2&sort=rating`);
    expect(named(dated.ids)).toBe('BDEC');
    expect(named((await search(`city=${CITY}&checkIn=${day(20)}&checkOut=${day(21)}&guests=2`)).ids)).toBe('ECBD');
  }, 60000);

  it('follows the reviews: a review published changes the order of the next search', async () => {
    // C rated 5.0, as B: of the two, C comes first in the default order.
    await reviewed('C', 5);
    const sorted = await eventually(
      () => search(`city=${CITY}&sort=rating`),
      answer => named(answer.ids) === 'CBADE',
    );
    expect(named(sorted.ids)).toBe('CBADE');
    expect(sorted.order).toBe('rating');
    expect(named((await search(`city=${CITY}`)).ids)).toBe('EACBD');
  }, 60000);
});
