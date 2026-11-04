import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 57: a review after a stay. The traveller of a stay that took place reviews it once, from the day
 * after its check-out up to 14 days after it; the review is published when that window has closed. The
 * days pass by starting the server again with CLOCK_OFFSET_DAYS: `clock(n)` makes its today `day(n)`.
 *
 * The stays, all booked and paid today (a server at `clock(0)`), one night each, so that a later clock
 * finds them over: Tom's from today on `listing` (its check-out `day(1)`, its window `day(2)` to
 * `day(15)`, published from `day(16)`), Una's from tomorrow on the same listing (published from `day(17)`),
 * and others on listings of their own.
 */
const db = database('reviews');
const provider = paymentProvider();
let base: Record<string, string>;
let server: Running;
let api: Client;

interface Person {
  id: string;
  email: string;
}
const tokens = new Map<string, string>();
/** A token of `person` on the server running now (signed in again after each restart). */
const tokenOf = async (person: Person) => {
  if (!tokens.has(person.email)) tokens.set(person.email, await api.login(person.email));
  return tokens.get(person.email)!;
};
/** The server started again on the same database, `days` after today. */
async function at(days: number) {
  server = await restart(server, db.path, { ...base, ...clock(days) });
  provider.attach(server.port);
  api = client(server.port);
  tokens.clear();
}

/** A comment of `length` characters, with no contact details and no link (request 61). */
const comment = (length: number) => 'Clean, quiet and bright, a lovely stay. '.repeat(60).slice(0, length - 1) + '.';
const review = (bookingId: string, person: Person, body: Json) =>
  tokenOf(person).then(token => api.act('POST', `/bookings/${bookingId}/review`, token, body));
const VALID = { cleanliness: 5, accuracy: 4, communication: 3, comment: comment(20) };
const reviewsOf = async (bookingId: string, person: Person) =>
  api.read(`/bookings/${bookingId}/reviews`, await tokenOf(person));
/** The published reviews of a listing, read by `person`, or by someone not signed in. */
const published = async (listingId: string, person?: Person) =>
  api.list(`/listings/${listingId}/reviews`, person ? await tokenOf(person) : undefined);

const people: Record<string, Person> = {};
const stays: Record<string, string> = {};
const listings: Record<string, string> = {};
const written: Record<string, string> = {};

beforeAll(async () => {
  base = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, { ...base, ...clock(0) });
  provider.attach(server.port);
  api = client(server.port);

  const hal = await api.host('hal@reviews.test');
  people.hal = hal;
  tokens.set(hal.email, hal.token);
  for (const name of ['tom', 'una', 'ned', 'kim', 'pat', 'zoe', 'yan', 'ivy', 'amy']) {
    const person = await api.traveller(`${name}@reviews.test`);
    people[name] = person;
    tokens.set(person.email, person.token);
  }
  for (const name of ['listing', 'lapsed', 'cancelled', 'requested', 'race1', 'race2', 'last', 'late'])
    listings[name] = await api.listing(hal.token, { title: `The ${name} room` });
  await api.done('PUT', `/listings/${listings.requested}/booking-mode`, hal.token, { mode: 'request' });

  const book = async (name: string, listing: string, from: number, to: number) => {
    const token = await tokenOf(people[name]);
    return api.book(token, await api.quote(token, listings[listing], day(from), day(to)));
  };
  const paid = async (name: string, listing: string, from: number, to: number) => {
    const bookingId = await book(name, listing, from, to);
    await payBooking(api, provider, await tokenOf(people[name]), bookingId);
    return bookingId;
  };
  stays.tom = await paid('tom', 'listing', 0, 1);
  stays.una = await paid('una', 'listing', 1, 2);
  stays.future = await paid('tom', 'listing', 5, 6);
  // Never paid: lapsed once its payment's deadline has passed.
  stays.lapsed = await book('ned', 'lapsed', 0, 1);
  stays.cancelled = await book('kim', 'cancelled', 0, 1);
  await api.done('POST', `/bookings/${stays.cancelled}/cancel`, await tokenOf(people.kim));
  // A request the host never decides.
  stays.requested = await book('pat', 'requested', 0, 1);
  stays.zoe = await paid('zoe', 'race1', 0, 1);
  stays.yan = await paid('yan', 'race2', 0, 1);
  stays.ivy = await paid('ivy', 'last', 0, 1);
  stays.amy = await paid('amy', 'late', 0, 1);
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

describe('a review after a stay', () => {
  it('refuses a review before the day after the check-out', async () => {
    expect((await review(stays.tom, people.tom, VALID)).accepted).toBe(false);
    await at(1);
    expect((await review(stays.tom, people.tom, VALID)).accepted).toBe(false);
    expect(await reviewsOf(stays.tom, people.tom)).toMatchObject({ traveller: null });
  }, 60000);

  it('refuses anyone but the traveller, a stay that did not take place, and ratings or comments out of range', async () => {
    await at(2);
    const { tom, una, hal, ned, kim, pat } = people;
    expect((await review(stays.tom, una, VALID)).accepted).toBe(false);
    expect((await review(stays.tom, hal, VALID)).accepted).toBe(false);
    expect((await review(stays.lapsed, ned, VALID)).accepted).toBe(false);
    expect((await review(stays.cancelled, kim, VALID)).accepted).toBe(false);
    expect((await review(stays.requested, pat, VALID)).accepted).toBe(false);
    expect((await review(stays.future, tom, VALID)).accepted).toBe(false);

    for (const wrong of [
      { cleanliness: 0 },
      { cleanliness: 6 },
      { accuracy: 4.5 },
      { communication: 0 },
      { communication: 6 },
      { comment: comment(19) },
      { comment: comment(2001) },
    ])
      expect((await review(stays.tom, tom, { ...VALID, ...wrong })).accepted).toBe(false);
    expect(await reviewsOf(stays.tom, tom)).toMatchObject({ traveller: null });
  }, 60000);

  it('takes one review from the traveller of a stay that took place, read on the booking by its author alone', async () => {
    const { tom, una, hal } = people;
    const outcome = await review(stays.tom, tom, VALID);
    expect(outcome.accepted).toBe(true);
    written.tom = typeof outcome.result === 'string' ? outcome.result : String((outcome.result as Json).id);
    expect((await review(stays.tom, tom, { ...VALID, cleanliness: 1 })).accepted).toBe(false);

    const { traveller } = await reviewsOf(stays.tom, tom);
    expect(traveller).toMatchObject({
      id: written.tom,
      bookingId: stays.tom,
      authorId: tom.id,
      cleanliness: 5,
      accuracy: 4,
      communication: 3,
      comment: comment(20),
    });
    // Written on OpenStay's today.
    expect(String((traveller as Json).createdAt).slice(0, 10)).toBe(day(2));

    expect(await reviewsOf(stays.tom, hal)).toMatchObject({ traveller: null });
    expect(await api.hidden(`/bookings/${stays.tom}/reviews`, await tokenOf(una))).toBe(true);
    expect(await published(listings.listing)).toEqual([]);
    expect(await published(listings.listing, una)).toEqual([]);
  }, 60000);

  it('gives one review for two sent at the same moment to two servers', async () => {
    const second = await start(db.path, { ...base, ...clock(2) });
    try {
      const other = client(second.port);
      for (const name of ['zoe', 'yan']) {
        const person = people[name];
        const comments = [comment(30), comment(40)];
        const [here, there] = [await tokenOf(person), await other.login(person.email)];
        const outcomes = await Promise.all([
          api.act('POST', `/bookings/${stays[name]}/review`, here, { ...VALID, comment: comments[0] }),
          other.act('POST', `/bookings/${stays[name]}/review`, there, { ...VALID, comment: comments[1] }),
        ]);
        expect(outcomes.filter(each => each.accepted)).toHaveLength(1);
        const { traveller } = await reviewsOf(stays[name], person);
        expect(comments).toContain((traveller as Json).comment);
      }
    } finally {
      await stop(second);
    }
  }, 120000);

  it('takes a review on the 14th day after the check-out, and publishes none before its window has closed', async () => {
    await at(15);
    const { ivy, una, hal } = people;
    expect((await review(stays.ivy, ivy, VALID)).accepted).toBe(true);
    const later = { cleanliness: 3, accuracy: 3, communication: 4, comment: comment(2000) };
    const outcome = await review(stays.una, una, later);
    expect(outcome.accepted).toBe(true);
    written.una = typeof outcome.result === 'string' ? outcome.result : String((outcome.result as Json).id);

    expect(await reviewsOf(stays.tom, hal)).toMatchObject({ traveller: null });
    expect(await published(listings.listing)).toEqual([]);
    expect(await published(listings.last)).toEqual([]);
  }, 60000);

  it('publishes a review, to anyone, once its window has closed, without anyone acting, and refuses a review after it', async () => {
    await at(16);
    const { tom, una, hal, amy } = people;
    expect((await review(stays.amy, amy, VALID)).accepted).toBe(false);

    const shown = await eventually(
      () => published(listings.listing),
      found => found.length > 0,
    );
    expect(shown).toEqual([
      expect.objectContaining({ id: written.tom, bookingId: stays.tom, authorId: tom.id, comment: comment(20) }),
    ]);
    expect(await published(listings.listing, una)).toEqual(shown);
    expect(await published(listings.last, hal)).toEqual([
      expect.objectContaining({ bookingId: stays.ivy, authorId: people.ivy.id }),
    ]);
    expect(await reviewsOf(stays.tom, hal)).toMatchObject({ traveller: expect.objectContaining({ id: written.tom }) });
    expect(await api.hidden(`/bookings/${stays.tom}/reviews`, await tokenOf(una))).toBe(true);
    // The two sent at the same moment gave one review each.
    expect(await published(listings.race1)).toHaveLength(1);
    expect(await published(listings.race2)).toHaveLength(1);
  }, 60000);

  it("lists a listing's published reviews, the most recently written first", async () => {
    await at(17);
    const reviews = await eventually(
      () => published(listings.listing),
      found => found.length >= 2,
    );
    expect(reviews.map(each => each.id)).toEqual([written.una, written.tom]);
    expect(reviews[0]).toMatchObject({
      bookingId: stays.una,
      authorId: people.una.id,
      cleanliness: 3,
      accuracy: 3,
      communication: 4,
      comment: comment(2000),
    });
    expect(String(reviews[0].createdAt).slice(0, 10)).toBe(day(15));
  }, 60000);
});
