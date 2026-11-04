import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 58: the host reviews the guest. The listing's host, or a manager of its organisation, reviews
 * the traveller of a stay that took place, once, in the traveller's window; the two reviews of a stay are
 * published together, when the second is written or when the window closes. The days pass by starting
 * the server again with CLOCK_OFFSET_DAYS: `clock(n)` makes its today `day(n)`.
 *
 * The stays are booked and paid today, one night each from today (check-out `day(1)`, window `day(2)` to
 * `day(15)`, closed from `day(16)`), on listings of an organisation with a manager and a viewer, and one
 * of Tom's from `day(5)` (check-out `day(6)`, window to `day(20)`).
 */
const db = database('guest-reviews');
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
const comment = (length: number) => 'A careful guest, who left the place spotless. '.repeat(50).slice(0, length - 1) + '.';
const GUEST = { rating: 5, comment: comment(25) };
const STAY = { cleanliness: 4, accuracy: 4, communication: 5, comment: comment(30) };
const guestReview = async (bookingId: string, person: Person, body: Json = GUEST) =>
  api.act('POST', `/bookings/${bookingId}/guest-review`, await tokenOf(person), body);
const review = async (bookingId: string, person: Person, body: Json = STAY) =>
  api.act('POST', `/bookings/${bookingId}/review`, await tokenOf(person), body);
const idOf = (result: unknown) => (typeof result === 'string' ? result : String((result as Json).id));
const reviewsOf = async (bookingId: string, person: Person) =>
  api.read(`/bookings/${bookingId}/reviews`, await tokenOf(person));
const guestReviewsOf = async (traveller: Person, reader: Person) =>
  api.list(`/accounts/${traveller.id}/guest-reviews`, await tokenOf(reader));

const people: Record<string, Person> = {};
const stays: Record<string, string> = {};
const written: Record<string, string> = {};

beforeAll(async () => {
  base = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, { ...base, ...clock(0) });
  provider.attach(server.port);
  api = client(server.port);

  for (const name of ['hal', 'mia', 'vic', 'ian']) {
    const person = await api.host(`${name}@guest-reviews.test`);
    people[name] = person;
    tokens.set(person.email, person.token);
  }
  for (const name of ['tom', 'una', 'zoe', 'kim', 'amy']) {
    const person = await api.traveller(`${name}@guest-reviews.test`);
    people[name] = person;
    tokens.set(person.email, person.token);
  }
  const hal = await tokenOf(people.hal);
  const organisationId = await api.create('/organisations', hal, { name: 'Hal & Co' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal, { email: people.mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal, { email: people.vic.email, role: 'viewer' });
  const listing = async () => {
    const id = await api.listing(hal);
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal, { organisationId });
    return id;
  };
  const book = async (name: string, listingId: string, from: number, to: number) => {
    const token = await tokenOf(people[name]);
    return api.book(token, await api.quote(token, listingId, day(from), day(to)));
  };
  const paid = async (name: string, listingId: string, from: number, to: number) => {
    const bookingId = await book(name, listingId, from, to);
    await payBooking(api, provider, await tokenOf(people[name]), bookingId);
    return bookingId;
  };
  const shared = await listing();
  stays.tom = await paid('tom', shared, 0, 1);
  stays.future = await paid('tom', shared, 5, 6);
  stays.una = await paid('una', await listing(), 0, 1);
  stays.zoe = await paid('zoe', await listing(), 0, 1);
  stays.amy = await paid('amy', await listing(), 0, 1);
  // Never paid: lapsed once its payment's deadline has passed.
  stays.lapsed = await book('kim', await listing(), 0, 1);
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

describe('the host reviews the guest', () => {
  it('refuses a review of the guest before the stay is over', async () => {
    expect((await guestReview(stays.tom, people.hal)).accepted).toBe(false);
  }, 60000);

  it('refuses the traveller, a viewer, another host, a stay that did not take place, and a rating or comment out of range', async () => {
    await at(2);
    const { hal, tom, vic, ian } = people;
    expect((await guestReview(stays.tom, tom)).accepted).toBe(false);
    expect((await guestReview(stays.tom, vic)).accepted).toBe(false);
    expect((await guestReview(stays.tom, ian)).accepted).toBe(false);
    expect((await guestReview(stays.lapsed, hal)).accepted).toBe(false);
    expect((await guestReview(stays.future, hal)).accepted).toBe(false);
    for (const wrong of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { comment: comment(19) }, { comment: comment(2001) }])
      expect((await guestReview(stays.tom, hal, { ...GUEST, ...wrong })).accepted).toBe(false);
    expect(await reviewsOf(stays.tom, hal)).toMatchObject({ traveller: null, host: null });
  }, 60000);

  it('keeps each review to its author until both are written, then publishes both at once, before the window closes', async () => {
    const { hal, mia, vic, tom, una } = people;
    const outcome = await guestReview(stays.tom, hal, { rating: 4, comment: comment(20) });
    expect(outcome.accepted).toBe(true);
    written.hal = idOf(outcome.result);
    expect((await guestReview(stays.tom, hal)).accepted).toBe(false);
    expect((await guestReview(stays.tom, mia)).accepted).toBe(false);

    const halsReview = {
      id: written.hal,
      bookingId: stays.tom,
      authorId: hal.id,
      rating: 4,
      comment: comment(20),
    };
    const { host } = await reviewsOf(stays.tom, hal);
    expect(host).toMatchObject(halsReview);
    expect(String((host as Json).createdAt).slice(0, 10)).toBe(day(2));
    for (const reader of [tom, mia, vic]) expect(await reviewsOf(stays.tom, reader)).toMatchObject({ host: null });
    expect(await guestReviewsOf(tom, una)).toEqual([]);

    const traveller = await review(stays.tom, tom);
    expect(traveller.accepted).toBe(true);
    written.tom = idOf(traveller.result);
    for (const reader of [tom, hal, mia, vic])
      expect(
        await eventually(
          () => reviewsOf(stays.tom, reader),
          both => both.traveller !== null && both.host !== null,
        ),
      ).toMatchObject({
        traveller: expect.objectContaining({ id: written.tom, authorId: tom.id }),
        host: expect.objectContaining(halsReview),
      });
    const listingId = String((await api.read(`/bookings/${stays.tom}`, await tokenOf(tom))).listingId);
    expect(await api.list(`/listings/${listingId}/reviews`)).toEqual([
      expect.objectContaining({ id: written.tom, bookingId: stays.tom, authorId: tom.id }),
    ]);
    const guestReviews = await guestReviewsOf(tom, una);
    expect(guestReviews).toEqual([expect.objectContaining(halsReview)]);
    expect(typeof guestReviews[0].createdAt).toBe('string');
    expect(await api.hidden(`/bookings/${stays.tom}/reviews`, await tokenOf(una))).toBe(true);
    expect((await api.call('GET', `/accounts/${tom.id}/guest-reviews`)).status).toBe(401);
  }, 60000);

  it("lets a manager review the guest for the host, the review read by the manager alone while the traveller's is missing", async () => {
    const { hal, mia, una } = people;
    const outcome = await guestReview(stays.una, mia, { rating: 3, comment: comment(2000) });
    expect(outcome.accepted).toBe(true);
    written.mia = idOf(outcome.result);
    expect((await guestReview(stays.una, hal)).accepted).toBe(false);
    expect(await reviewsOf(stays.una, mia)).toMatchObject({
      host: expect.objectContaining({ id: written.mia, authorId: mia.id, rating: 3 }),
    });
    expect(await reviewsOf(stays.una, hal)).toMatchObject({ host: null });
    expect(await reviewsOf(stays.una, una)).toMatchObject({ host: null, traveller: null });
    expect(await guestReviewsOf(una, hal)).toEqual([]);
  }, 60000);

  it('gives one review of the guest for two sent at the same moment to two servers', async () => {
    const second = await start(db.path, { ...base, ...clock(2) });
    try {
      const other = client(second.port);
      const [here, there] = [await tokenOf(people.hal), await other.login(people.mia.email)];
      const outcomes = await Promise.all([
        api.act('POST', `/bookings/${stays.zoe}/guest-review`, here, { rating: 2, comment: comment(40) }),
        other.act('POST', `/bookings/${stays.zoe}/guest-review`, there, { rating: 1, comment: comment(50) }),
      ]);
      expect(outcomes.filter(each => each.accepted)).toHaveLength(1);
    } finally {
      await stop(second);
    }
  }, 120000);

  it("publishes a lone review when the window closes, refuses one after it, and lists a traveller's reviews the most recent first", async () => {
    await at(16);
    const { hal, mia, una, tom, zoe, amy, ian } = people;
    expect((await guestReview(stays.amy, hal)).accepted).toBe(false);
    expect(await reviewsOf(stays.amy, amy)).toMatchObject({ host: null });

    const lone = await eventually(
      () => guestReviewsOf(una, ian),
      found => found.length > 0,
    );
    expect(lone).toEqual([
      expect.objectContaining({ id: written.mia, bookingId: stays.una, authorId: mia.id, rating: 3, comment: comment(2000) }),
    ]);
    expect(await reviewsOf(stays.una, una)).toMatchObject({
      host: expect.objectContaining({ id: written.mia }),
      traveller: null,
    });
    expect(await reviewsOf(stays.una, hal)).toMatchObject({ host: expect.objectContaining({ id: written.mia }) });
    expect(await guestReviewsOf(zoe, una)).toHaveLength(1);

    // Tom's second stay, reviewed by both today: published at once, before the first one in Tom's list.
    const later = await guestReview(stays.future, hal, { rating: 5, comment: comment(60) });
    expect(later.accepted).toBe(true);
    expect((await review(stays.future, tom)).accepted).toBe(true);
    const reviews = await eventually(
      () => guestReviewsOf(tom, ian),
      found => found.length >= 2,
    );
    expect(reviews.map(each => each.id)).toEqual([idOf(later.result), written.hal]);
    expect(String(reviews[0].createdAt).slice(0, 10)).toBe(day(16));
  }, 60000);
});
