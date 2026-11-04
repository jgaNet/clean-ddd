import { randomUUID } from 'crypto';

import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 59: ratings. A listing's rating is computed from its published reviews only (requests 57 and
 * 58), shows on the listing and in search, and a host's across every listing they host. The days pass by
 * starting the server again with CLOCK_OFFSET_DAYS: `clock(n)` makes its today `day(n)`.
 *
 * Four one-night stays of Tom's on `rated`, from today to `day(4)`, booked and paid today, reviewed at
 * `clock(5)` by Tom and by the host, so published at once; one stay of Una's on `waiting` from today,
 * reviewed by Una only, published when its window closes (from `day(16)`).
 */
const db = database('ratings');
const provider = paymentProvider();
let base: Record<string, string>;
let server: Running;
let api: Client;

interface Person {
  id: string;
  email: string;
}
const tokens = new Map<string, string>();
const tokenOf = async (person: Person) => {
  if (!tokens.has(person.email)) tokens.set(person.email, await api.login(person.email));
  return tokens.get(person.email)!;
};
async function at(days: number) {
  server = await restart(server, db.path, { ...base, ...clock(days) });
  provider.attach(server.port);
  api = client(server.port);
  tokens.clear();
}

/** A comment of `length` characters, with no contact details and no link (request 61). */
const comment = (length: number) =>
  'Bright rooms and a warm welcome, thank you. '.repeat(50).slice(0, length - 1) + '.';
const CITY = 'Colmar';
const ratingOf = async (listingId: string, person?: Person) =>
  (await api.read(`/listings/${listingId}`, person && (await tokenOf(person)))).rating as Json | null;
const hostRating = (hostId: string) => api.read(`/hosts/${hostId}/rating`);
const search = () => api.list(`/listings?city=${CITY}`);
/** A rating as the request computes it, compared to one decimal. */
const expectRating = (
  rating: unknown,
  expected: { cleanliness: number; accuracy: number; communication: number; overall: number; count: number },
) => {
  const actual = rating as Json;
  expect(actual).not.toBeNull();
  for (const key of ['cleanliness', 'accuracy', 'communication', 'overall'] as const)
    expect(actual[key] as number).toBeCloseTo(expected[key], 5);
  expect(actual.count).toBe(expected.count);
};

const people: Record<string, Person> = {};
const listings: Record<string, string> = {};
const stays: string[] = [];
let waiting = '';

beforeAll(async () => {
  base = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, { ...base, ...clock(0) });
  provider.attach(server.port);
  api = client(server.port);
  for (const [name, roles] of [
    ['hal', ['host']],
    ['ian', ['host']],
    ['tom', ['traveller']],
    ['una', ['traveller']],
  ] as const) {
    const person = await api.account(`${name}@ratings.test`, [...roles]);
    people[name] = person;
    tokens.set(person.email, person.token);
  }
  const hal = await tokenOf(people.hal);
  listings.cheapest = await api.listing(hal, { city: CITY, nightlyPrice: 8000 });
  listings.rated = await api.listing(hal, { city: CITY, nightlyPrice: 10000 });
  listings.waiting = await api.listing(hal, { city: CITY, nightlyPrice: 12000 });
  listings.ians = await api.listing(await tokenOf(people.ian), { city: 'Sélestat' });
  for (const [person, listing, from] of [
    [people.tom, listings.rated, 0],
    [people.tom, listings.rated, 1],
    [people.tom, listings.rated, 2],
    [people.tom, listings.rated, 3],
    [people.una, listings.waiting, 0],
  ] as const) {
    const token = await tokenOf(person);
    const bookingId = await api.book(token, await api.quote(token, listing, day(from), day(from + 1)));
    await payBooking(api, provider, token, bookingId);
    if (person === people.tom) stays.push(bookingId);
    else waiting = bookingId;
  }
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const review = async (bookingId: string, person: Person, ratings: [number, number, number]) => {
  const [cleanliness, accuracy, communication] = ratings;
  const body = { cleanliness, accuracy, communication, comment: comment(40) };
  await api.done('POST', `/bookings/${bookingId}/review`, await tokenOf(person), body);
};
const guestReview = async (bookingId: string) =>
  api.done('POST', `/bookings/${bookingId}/guest-review`, await tokenOf(people.hal), {
    rating: 1,
    comment: comment(30),
  });

describe('ratings', () => {
  it('has no rating for a listing or a host with no published review, and answers 404 for no account', async () => {
    expect(await ratingOf(listings.rated)).toBeNull();
    expect(await hostRating(people.hal.id)).toMatchObject({ overall: null, count: 0 });
    expect((await api.call('GET', `/hosts/${randomUUID()}/rating`)).status).toBe(404);
  }, 60000);

  it("rates a listing from its published reviews only, the traveller's, rounded half up, and follows each one published", async () => {
    await at(5);
    const { tom, una } = people;
    // Written by the traveller alone: not published, it counts for nothing.
    await review(stays[0], tom, [5, 5, 3]);
    await review(waiting, una, [5, 5, 5]);
    expect(await ratingOf(listings.rated)).toBeNull();
    expect(await ratingOf(listings.waiting)).toBeNull();

    // The host's review of the guest publishes both, and rates no listing.
    await guestReview(stays[0]);
    expectRating(
      await eventually(
        () => ratingOf(listings.rated),
        rating => rating !== null,
      ),
      { cleanliness: 5, accuracy: 5, communication: 3, overall: 4.3, count: 1 },
    );

    for (const [n, ratings] of [
      [1, [4, 5, 4]],
      [2, [4, 4, 4]],
      [3, [4, 4, 4]],
    ] as const) {
      await review(stays[n], tom, [...ratings]);
      await guestReview(stays[n]);
    }
    // 17/4 = 4.25 is 4.3; 18/4 = 4.5; 15/4 = 3.75 is 3.8; (4.3 + 4.5 + 3.8) / 3 = 4.2.
    const four = { cleanliness: 4.3, accuracy: 4.5, communication: 3.8, overall: 4.2, count: 4 };
    expectRating(
      await eventually(
        () => ratingOf(listings.rated),
        rating => rating?.count === 4,
      ),
      four,
    );
    expectRating(await ratingOf(listings.rated, una), four);
  }, 90000);

  it("shows each listing's rating in search, in search's own order", async () => {
    const found = await search();
    expect(found.map(each => each.id)).toEqual([listings.cheapest, listings.rated, listings.waiting]);
    expect(found[0].rating).toBeNull();
    expectRating(found[1].rating, { cleanliness: 4.3, accuracy: 4.5, communication: 3.8, overall: 4.2, count: 4 });
    expect(found[2].rating).toBeNull();
  }, 60000);

  it('rates a host over every published review of every listing they host, whatever its state, for anyone', async () => {
    const rating = await hostRating(people.hal.id);
    expect(rating.count).toBe(4);
    expect(rating.overall as number).toBeCloseTo(4.2, 5);
    expect(await hostRating(people.ian.id)).toMatchObject({ overall: null, count: 0 });

    // Archived, the listing's reviews still count for its host.
    await api.done('POST', `/listings/${listings.rated}/archive`, await tokenOf(people.hal));
    await at(16);
    // Una's lone review is published by a server whose today closes its window.
    expectRating(
      await eventually(
        () => ratingOf(listings.waiting),
        each => each !== null,
      ),
      { cleanliness: 5, accuracy: 5, communication: 5, overall: 5, count: 1 },
    );
    const found = await search();
    expect(found.map(each => each.id)).toEqual([listings.cheapest, listings.waiting]);
    expectRating(found[1].rating, { cleanliness: 5, accuracy: 5, communication: 5, overall: 5, count: 1 });

    // Over the five reviews together: 22/5 = 4.4, 23/5 = 4.6, 20/5 = 4.0, (4.4 + 4.6 + 4.0) / 3 = 4.3
    // (not 4.6, the mean of the two listings' ratings).
    const all = await eventually(
      () => hostRating(people.hal.id),
      each => each.count === 5,
    );
    expect(all.count).toBe(5);
    expect(all.overall as number).toBeCloseTo(4.3, 5);
    expect(await hostRating(people.ian.id)).toMatchObject({ overall: null, count: 0 });
  }, 90000);
});
