import { client, Client, clock, database, day, eventually, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * K4, task 2 (a change of behaviour no request announced): a phone number written with a single hyphen between
 * its digits (`06-12-34-56-78`, `+33-6-12-34-56-78`) is a phone number, wherever OpenStay recognises contact
 * details: in a message (request 53) and in a review's comment or a host's reply (request 61). A date such as
 * `2026-12-01` still is not one.
 */
const db = database('k4-hyphens');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
type Person = { id: string; email: string; token: string };
let hal: Person;
let tom: Person;
const stays: Record<'review' | 'reply' | 'dates', { listingId: string; bookingId: string }> = {} as never;

beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await api.host('hal@k4-hyphens.test');
  tom = await api.traveller('tom@k4-hyphens.test');
  for (const name of ['review', 'reply', 'dates'] as const) {
    const listingId = await api.listing(hal.token, { city: 'Hyphenville' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(0), day(1)));
    await payBooking(api, provider, tom.token, bookingId);
    stays[name] = { listingId, bookingId };
  }
  // Three days later, every check-out has passed and every review window is open (request 57).
  server = await restart(server, db.path, { ...environment, ...clock(3) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of [hal, tom]) person.token = await api.login(person.email);
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** What a command came to: `accepted`, or the name of the rule a refusal gives, at once (`422`) or as the operation's error. */
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

/** The messages of a conversation as `token` is shown them: `[text, masked]`, in order. */
const shown = async (id: string, token: string) =>
  ((await api.read(`/conversations/${id}`, token)).messages as Json[]).map(each => [each.text, each.masked]);

const scores = { cleanliness: 5, accuracy: 4, communication: 5 };

describe('phone numbers written with hyphens', () => {
  it('holds them back in a message, as any phone number, and leaves a date as written', async () => {
    const listingId = await api.listing(hal.token, { city: 'Hyphenville' });
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Can I call you? Mine is 06-12-34-56-78' });
    await api.done('POST', `/conversations/${id}/messages`, hal.token, {
      text: 'Sure, +33-6-98-76-54-32 any time from 2026-12-01',
    });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'We arrive on 2026-12-01, thanks' });
    expect(await shown(id, hal.token)).toEqual([
      ['Can I call you? Mine is [hidden]', true],
      ['Sure, +33-6-98-76-54-32 any time from 2026-12-01', false],
      ['We arrive on 2026-12-01, thanks', false],
    ]);
    expect(await shown(id, tom.token)).toEqual([
      ['Can I call you? Mine is 06-12-34-56-78', false],
      ['Sure, [hidden] any time from 2026-12-01', true],
      ['We arrive on 2026-12-01, thanks', false],
    ]);
  }, 60000);

  it("refuses a traveller's review whose comment holds one, naming the rule, and takes one that holds a date", async () => {
    const path = `/bookings/${stays.review.bookingId}/review`;
    for (const comment of [
      'Lovely flat, call the host on 06-12-34-56-78 to get the keys',
      'Lovely flat, the host answers on +33-6-12-34-56-78 at any hour',
    ])
      expect(await ruling(path, tom.token, { ...scores, comment })).toBe('CONTACT_DETAILS');
    const dated = await ruling(`/bookings/${stays.dates.bookingId}/review`, tom.token, {
      ...scores,
      comment: 'We stayed from 2026-12-01 and loved every minute of it',
    });
    expect(dated).toBe('accepted');
    expect(await ruling(path, tom.token, { ...scores, comment: 'Lovely flat, the host answers at any hour' })).toBe(
      'accepted',
    );
  }, 90000);

  it("refuses a host's guest review and a host's reply that hold one", async () => {
    const { bookingId } = stays.reply;
    expect(
      await ruling(`/bookings/${bookingId}/guest-review`, hal.token, {
        rating: 5,
        comment: 'A perfect guest, reach him on 06-12-34-56-78',
      }),
    ).toBe('CONTACT_DETAILS');
    await api.done('POST', `/bookings/${bookingId}/guest-review`, hal.token, {
      rating: 5,
      comment: 'A perfect guest, welcome back any time',
    });
    await api.done('POST', `/bookings/${bookingId}/review`, tom.token, {
      ...scores,
      comment: 'A calm flat and a kind host, thank you',
    });
    // Both reviews written: published at once (request 58), so the host may reply (request 60).
    const reviews = await eventually(
      () => api.read(`/listings/${stays.reply.listingId}/reviews`),
      list => Array.isArray(list) && (list as unknown as Json[]).length === 1,
    );
    const reviewId = String((reviews as unknown as Json[])[0].id);
    expect(
      await ruling(`/reviews/${reviewId}/reply`, hal.token, { text: 'Thank you! Call 06-12-34-56-78 next time' }),
    ).toBe('CONTACT_DETAILS');
    expect(await ruling(`/reviews/${reviewId}/reply`, hal.token, { text: 'Thank you, come back any time!' })).toBe(
      'accepted',
    );
  }, 90000);
});
