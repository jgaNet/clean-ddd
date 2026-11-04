import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 60: the host's reply. The host of the reviewed listing, or a manager of its organisation,
 * replies once to a published traveller's review, and the reply shows with the review to anyone. The
 * stays are booked and paid today, one night each from today, on listings of an organisation with a
 * manager and a viewer; the server is started again two days later (`clock(2)`: OpenStay's today is
 * `day(2)`), when the stays can be reviewed.
 */
const db = database('host-replies');
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

/** A text of `length` characters, with no contact details and no link (request 61). */
const text = (length: number) =>
  'Thank you for your kind words, come back soon. '.repeat(50).slice(0, length - 1) + '.';
const STAY = { cleanliness: 4, accuracy: 5, communication: 4, comment: 'A quiet flat, close to everything.' };
const GUEST = { rating: 5, comment: 'A perfect guest, welcome back any time.' };
const idOf = (result: unknown) => (typeof result === 'string' ? result : String((result as Json).id));
const write = async (path: string, person: Person, body: Json) => {
  const outcome = await api.act('POST', path, await tokenOf(person), body);
  if (!outcome.accepted) throw new Error(`POST ${path} was refused: ${JSON.stringify(outcome.result)}`);
  return idOf(outcome.result);
};
const reply = async (reviewId: string, person: Person, body: Json = { text: text(40) }) =>
  api.act('POST', `/reviews/${reviewId}/reply`, await tokenOf(person), body);
const listed = (listingId: string) => api.list(`/listings/${listingId}/reviews`);
/** Waits until the listing shows the review: published once both reviews of its stay are written (request 58). */
const publishedOn = (listingId: string) =>
  eventually(
    () => listed(listingId),
    found => found.length > 0,
  );

const people: Record<string, Person> = {};
const stays: Record<string, string> = {};
const listings: Record<string, string> = {};
const reviews: Record<string, string> = {};

beforeAll(async () => {
  base = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, { ...base, ...clock(0) });
  provider.attach(server.port);
  api = client(server.port);
  for (const name of ['hal', 'mia', 'vic', 'ian']) {
    const person = await api.host(`${name}@host-replies.test`);
    people[name] = person;
    tokens.set(person.email, person.token);
  }
  for (const name of ['tom', 'una', 'ned']) {
    const person = await api.traveller(`${name}@host-replies.test`);
    people[name] = person;
    tokens.set(person.email, person.token);
  }
  const hal = await tokenOf(people.hal);
  const organisationId = await api.create('/organisations', hal, { name: 'Hal & Co' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal, { email: people.mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal, { email: people.vic.email, role: 'viewer' });
  for (const name of ['tom', 'una', 'ned']) {
    listings[name] = await api.listing(hal);
    await api.done('POST', `/listings/${listings[name]}/move-to-organisation`, hal, { organisationId });
    const token = await tokenOf(people[name]);
    stays[name] = await api.book(token, await api.quote(token, listings[name], day(0), day(1)));
    await payBooking(api, provider, token, stays[name]);
  }

  server = await restart(server, db.path, { ...base, ...clock(2) });
  provider.attach(server.port);
  api = client(server.port);
  tokens.clear();
  // Tom's review is published at once: the host reviews him too. Una's waits for the host's review.
  reviews.tom = await write(`/bookings/${stays.tom}/review`, people.tom, STAY);
  reviews.guest = await write(`/bookings/${stays.tom}/guest-review`, people.hal, GUEST);
  reviews.una = await write(`/bookings/${stays.una}/review`, people.una, STAY);
  reviews.ned = await write(`/bookings/${stays.ned}/review`, people.ned, STAY);
  await write(`/bookings/${stays.ned}/guest-review`, people.mia, GUEST);
  await publishedOn(listings.tom);
  await publishedOn(listings.ned);
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

describe("the host's reply", () => {
  it('refuses a reply to a review not published yet, and takes one from a manager once it is', async () => {
    const { mia, hal, una } = people;
    expect((await reply(reviews.una, hal)).accepted).toBe(false);
    expect((await reply(reviews.una, mia)).accepted).toBe(false);
    await write(`/bookings/${stays.una}/guest-review`, hal, GUEST);
    await publishedOn(listings.una);
    expect((await reply(reviews.una, mia, { text: text(20) })).accepted).toBe(true);
    expect(await listed(listings.una)).toEqual([
      expect.objectContaining({ id: reviews.una, reply: expect.objectContaining({ text: text(20) }) }),
    ]);
    const { traveller } = await api.read(`/bookings/${stays.una}/reviews`, await tokenOf(una));
    expect(traveller).toMatchObject({ id: reviews.una, reply: { text: text(20) } });
  }, 60000);

  it("lets only the listing's host or a manager reply, never on a guest's review, with a text of 20 to 2,000 characters", async () => {
    const { tom, una, vic, ian, hal, mia } = people;
    expect((await reply(reviews.tom, tom)).accepted).toBe(false);
    expect((await reply(reviews.tom, una)).accepted).toBe(false);
    expect((await reply(reviews.tom, vic)).accepted).toBe(false);
    expect((await reply(reviews.tom, ian)).accepted).toBe(false);
    // A host's review of a guest has no reply, from the host or from the traveller.
    expect((await reply(reviews.guest, hal)).accepted).toBe(false);
    expect((await reply(reviews.guest, tom)).accepted).toBe(false);
    expect((await reply(reviews.tom, hal, { text: text(19) })).accepted).toBe(false);
    expect((await reply(reviews.tom, hal, { text: text(2001) })).accepted).toBe(false);
    expect((await listed(listings.tom))[0]).toMatchObject({ id: reviews.tom, reply: null });

    expect((await reply(reviews.tom, hal, { text: text(2000) })).accepted).toBe(true);
    // One reply, final: a second one is refused, by the host or by a manager.
    expect((await reply(reviews.tom, hal, { text: text(30) })).accepted).toBe(false);
    expect((await reply(reviews.tom, mia, { text: text(30) })).accepted).toBe(false);
  }, 60000);

  it('shows the reply with the review, to anyone, with when it was written', async () => {
    const { tom, una } = people;
    const [shown] = await listed(listings.tom);
    expect(shown).toMatchObject({ id: reviews.tom, reply: { text: text(2000) } });
    // Written on OpenStay's today.
    expect(String((shown.reply as Json).createdAt).slice(0, 10)).toBe(day(2));
    expect(await api.list(`/listings/${listings.tom}/reviews`, await tokenOf(una))).toEqual([shown]);
    const { traveller } = await api.read(`/bookings/${stays.tom}/reviews`, await tokenOf(tom));
    expect(traveller).toMatchObject({
      id: reviews.tom,
      reply: { text: text(2000), createdAt: (shown.reply as Json).createdAt },
    });
  }, 60000);

  it('gives one reply for two sent at the same moment to two servers', async () => {
    const second = await start(db.path, { ...base, ...clock(2) });
    try {
      const other = client(second.port);
      const [here, there] = [await tokenOf(people.hal), await other.login(people.mia.email)];
      const texts = [text(50), text(60)];
      const outcomes = await Promise.all([
        api.act('POST', `/reviews/${reviews.ned}/reply`, here, { text: texts[0] }),
        other.act('POST', `/reviews/${reviews.ned}/reply`, there, { text: texts[1] }),
      ]);
      expect(outcomes.filter(each => each.accepted)).toHaveLength(1);
      const [shown] = await listed(listings.ned);
      expect(texts).toContain((shown.reply as Json).text);
      const [elsewhere] = await other.list(`/listings/${listings.ned}/reviews`);
      expect(elsewhere.reply).toEqual(shown.reply);
    } finally {
      await stop(second);
    }
  }, 120000);
});
