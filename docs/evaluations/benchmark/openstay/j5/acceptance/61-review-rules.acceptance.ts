import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 61: review rules. The published rules; a comment or a reply that breaks one is refused naming
 * it, and does not count as the author's one; a published review reported once per account.
 */
const db = database('review-rules');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
type Person = { id: string; email: string; token: string };
let hal: Person;
let tom: Person;
let una: Person;
let kim: Person;
/** One stay that took place per case, each on a listing of its own (a booking of today, the server then 3 days on). */
const stays: Record<
  'traveller' | 'guest' | 'reply' | 'report' | 'unpublished',
  { listingId: string; bookingId: string }
> = {} as never;

beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await api.host('hal@review-rules.test');
  tom = await api.traveller('tom@review-rules.test');
  una = await api.traveller('una@review-rules.test');
  kim = await api.traveller('kim@review-rules.test');
  for (const name of ['traveller', 'guest', 'reply', 'report', 'unpublished'] as const) {
    const listingId = await api.listing(hal.token, { city: 'Rulesville' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(0), day(1)));
    await payBooking(api, provider, tom.token, bookingId);
    stays[name] = { listingId, bookingId };
  }
  // Three days later, every check-out has passed and every review window is open (request 57).
  server = await restart(server, db.path, { ...environment, ...clock(3) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of [hal, tom, una, kim]) person.token = await api.login(person.email);
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/**
 * What a command came to under the review rules: `accepted`, or the name of the rule a refusal gives —
 * `422 { error }` at once, or the operation's `{ status: "ERROR", error }` later (request 61). Any other
 * refusal reads as its status and body, so that a test expecting a name fails with what was answered.
 */
async function ruling(path: string, token: string, body: Json): Promise<string> {
  const answer = await api.call('POST', path, token, body);
  if (answer.status >= 500) throw new Error(`POST ${path} answered ${answer.status}`);
  if (answer.status === 202 && typeof answer.body?.operationId === 'string') {
    const ended = await eventually(
      async () => (await api.call('GET', `/operations/${String(answer.body.operationId)}`, token)).body,
      operation => operation?.status === 'SUCCESS' || operation?.status === 'ERROR',
      60000,
    );
    if (ended?.status === 'SUCCESS') return 'accepted';
    if (ended?.status === 'ERROR') return String(ended.error);
    throw new Error(`POST ${path}: the operation never ended`);
  }
  if (answer.status >= 200 && answer.status < 300) return 'accepted';
  return answer.status === 422 ? String(answer.body?.error) : `${answer.status} ${JSON.stringify(answer.body)}`;
}

/** A text of exactly `length` characters, with no contact details and no link. */
const text = (length: number) =>
  'Quiet and clean flat, a kind host. '.repeat(Math.ceil(length / 35) + 1).slice(0, length);
const scores = { cleanliness: 5, accuracy: 4, communication: 5 };
/** Each text that breaks one rule, with the rule's name. */
const breaking: [string, string][] = [
  ['Clean, calm, lovely', 'COMMENT_TOO_SHORT'],
  [text(2001), 'COMMENT_TOO_LONG'],
  ['Write to me at anna.b@mail.example.com after your stay', 'CONTACT_DETAILS'],
  ['Call me on +33 6 12 34 56 78 when you arrive', 'CONTACT_DETAILS'],
  ['My number is 06.12.34.56.78 for the keys', 'CONTACT_DETAILS'],
  ['Ring 0612345678 before you come over', 'CONTACT_DETAILS'],
  ['See the photos at http://example.org/flat', 'LINK'],
  ['See the photos at HTTPS://example.org/flat', 'LINK'],
  ['More pictures on WWW.example.org of the flat', 'LINK'],
  // Several broken: the first in the order COMMENT_TOO_SHORT, COMMENT_TOO_LONG, CONTACT_DETAILS, LINK.
  ['See www.x.fr', 'COMMENT_TOO_SHORT'],
  [`${text(1995)} a@b.fr and https://example.org`, 'COMMENT_TOO_LONG'],
  ['Mail anna.b@mail.example.com or see https://example.org', 'CONTACT_DETAILS'],
];

describe('review rules', () => {
  it('publishes the rules to anyone, signed in or not', async () => {
    for (const token of [undefined, tom.token]) {
      const rules = await api.read('/review-rules', token);
      expect(rules).toMatchObject({ minLength: 20, maxLength: 2000 });
      expect(rules.forbidden).toEqual(expect.arrayContaining(['contact-details', 'links']));
    }
  }, 60000);

  it("refuses a traveller's comment that breaks a rule, naming it, and takes a review after the refusals", async () => {
    const { bookingId } = stays.traveller;
    const path = `/bookings/${bookingId}/review`;
    for (const [comment, rule] of breaking)
      expect([comment.slice(0, 40), await ruling(path, tom.token, { ...scores, comment })]).toEqual([
        comment.slice(0, 40),
        rule,
      ]);

    // A refused review does not count as the traveller's one: 20 characters, spaces included, are enough.
    const comment = 'Clean, calm, lovely!';
    expect(comment).toHaveLength(20);
    const id = await api.create(path, tom.token, { ...scores, comment });
    const { traveller } = await api.read(`/bookings/${bookingId}/reviews`, tom.token);
    expect(traveller).toMatchObject({ id, bookingId, comment, ...scores });
  }, 120000);

  it("refuses a host's comment on a guest that breaks a rule, naming it, and takes a date and 2,000 characters", async () => {
    const { bookingId } = stays.guest;
    const path = `/bookings/${bookingId}/guest-review`;
    for (const [comment, rule] of breaking)
      expect([comment.slice(0, 40), await ruling(path, hal.token, { rating: 4, comment })]).toEqual([
        comment.slice(0, 40),
        rule,
      ]);

    // A date is no phone number.
    const dated = 'Arrived on 2026-12-01 and left the flat spotless.';
    expect(await ruling(path, hal.token, { rating: 4, comment: dated })).toBe('accepted');
    const { host } = await api.read(`/bookings/${bookingId}/reviews`, hal.token);
    expect(host).toMatchObject({ rating: 4, comment: dated });

    // The traveller's review at the longest a comment may be.
    const longest = text(2000);
    expect(await ruling(`/bookings/${bookingId}/review`, tom.token, { ...scores, comment: longest })).toBe('accepted');
    const { traveller } = await api.read(`/bookings/${bookingId}/reviews`, tom.token);
    expect(traveller).toMatchObject({ comment: longest });
  }, 120000);

  it("refuses a host's reply that breaks a rule, naming it, and takes a reply after the refusals", async () => {
    const { listingId, bookingId } = stays.reply;
    const reviewId = await api.create(`/bookings/${bookingId}/review`, tom.token, {
      ...scores,
      comment: 'A quiet flat and a very kind host.',
    });
    await api.create(`/bookings/${bookingId}/guest-review`, hal.token, {
      rating: 5,
      comment: 'A careful guest, welcome back any time.',
    });
    // Both reviews written: published (request 58).
    await eventually(
      () => api.list(`/listings/${listingId}/reviews`),
      reviews => reviews.some(each => each.id === reviewId),
    );

    const path = `/reviews/${reviewId}/reply`;
    for (const [reply, rule] of breaking)
      expect([reply.slice(0, 40), await ruling(path, hal.token, { text: reply })]).toEqual([reply.slice(0, 40), rule]);
    const reply = 'Thank you, come back whenever you like.';
    expect(await ruling(path, hal.token, { text: reply })).toBe('accepted');
    const reviews = await eventually(
      () => api.list(`/listings/${listingId}/reviews`),
      found => (found.find(each => each.id === reviewId)?.reply as Json | null | undefined)?.text === reply,
    );
    expect(reviews.find(each => each.id === reviewId)).toMatchObject({ reply: { text: reply } });
  }, 120000);

  it('lets any signed-in account but its author report a published review, once, with a reason of 1 to 500 characters', async () => {
    const { listingId, bookingId } = stays.report;
    const comment = 'Exactly as described, and spotless too.';
    const reviewId = await api.create(`/bookings/${bookingId}/review`, tom.token, { ...scores, comment });
    const guestReviewId = await api.create(`/bookings/${bookingId}/guest-review`, hal.token, {
      rating: 5,
      comment: 'A careful guest, welcome back any time.',
    });
    await eventually(
      () => api.list(`/listings/${listingId}/reviews`),
      reviews => reviews.some(each => each.id === reviewId),
    );
    const report = (id: string, token: string | undefined, reason: unknown) =>
      api.act('POST', `/reviews/${id}/report`, token, { reason });

    expect(await api.refused('POST', `/reviews/${reviewId}/report`, undefined, { reason: 'Not true' })).toBe(true);
    expect(await api.refused('POST', `/reviews/${reviewId}/report`, tom.token, { reason: 'My own' })).toBe(true);
    expect(await api.refused('POST', `/reviews/${reviewId}/report`, una.token, { reason: '' })).toBe(true);
    expect(await api.refused('POST', `/reviews/${reviewId}/report`, una.token, { reason: 'x'.repeat(501) })).toBe(true);

    expect(await api.create(`/reviews/${reviewId}/report`, una.token, { reason: 'This stay never happened' })).toEqual(
      expect.any(String),
    );
    expect((await report(reviewId, una.token, 'Reported again')).accepted).toBe(false);
    // Any account but the author: the reviewed host too, and a reason of 500 characters.
    expect(await api.create(`/reviews/${reviewId}/report`, hal.token, { reason: 'Unfair' })).toEqual(
      expect.any(String),
    );
    expect(await api.create(`/reviews/${reviewId}/report`, kim.token, { reason: 'x'.repeat(500) })).toEqual(
      expect.any(String),
    );

    // A host's review of a guest is reported the same way, never by its author.
    expect(await api.refused('POST', `/reviews/${guestReviewId}/report`, hal.token, { reason: 'My own' })).toBe(true);
    expect(await api.create(`/reviews/${guestReviewId}/report`, tom.token, { reason: 'Unfair to me' })).toEqual(
      expect.any(String),
    );
    expect((await report(guestReviewId, tom.token, 'Again')).accepted).toBe(false);

    // Until the administrators decide, the review stays as it is, for everyone.
    for (const token of [undefined, una.token, tom.token]) {
      const reviews = await api.list(`/listings/${listingId}/reviews`, token);
      expect(reviews.find(each => each.id === reviewId)).toMatchObject({ id: reviewId, comment });
    }
    const both = await api.read(`/bookings/${bookingId}/reviews`, tom.token);
    expect(both.traveller).toMatchObject({ id: reviewId, comment });
    expect(both.host).toMatchObject({ id: guestReviewId });
    expect(await api.list(`/accounts/${tom.id}/guest-reviews`, una.token)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: guestReviewId })]),
    );
  }, 120000);

  it('refuses to report a review that is not published yet, or none', async () => {
    const { bookingId } = stays.unpublished;
    const reviewId = await api.create(`/bookings/${bookingId}/review`, tom.token, {
      ...scores,
      comment: 'Lovely, would come back without a doubt.',
    });
    // Only the traveller has written: until the host writes, or the window closes, it is its author's alone.
    for (const token of [una.token, hal.token, tom.token])
      expect(await api.refused('POST', `/reviews/${reviewId}/report`, token, { reason: 'Not true' })).toBe(true);
    expect(await api.refused('POST', '/reviews/no-such-review/report', una.token, { reason: 'Not true' })).toBe(true);
  }, 60000);
});
