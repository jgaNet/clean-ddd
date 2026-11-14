import { client, Client, clock, database, day, Json, restart, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * K4, task 4 (predicting impact). The agent is not asked to make the change, only to predict what it touches;
 * this test holds the reference solution the ground truth was read from: a stay's review window is 30 days
 * after its check-out instead of 14 (request 57), and what the window decides follows it — a review is
 * written up to 30 days after the check-out, and a review alone is published when that window closes.
 */
const db = database('k4-review-window');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
type Person = { id: string; email: string; token: string };
let hal: Person;
let tom: Person;
const early = { listingId: '', bookingId: '' };
const late = { listingId: '', bookingId: '' };

async function at(days: number) {
  server = await restart(server, db.path, { ...environment, ...clock(days) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of [hal, tom]) person.token = await api.login(person.email);
}

beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, { ...environment, ...clock(0) });
  provider.attach(server.port);
  api = client(server.port);
  hal = await api.host('hal@k4-window.test');
  tom = await api.traveller('tom@k4-window.test');
  for (const stay of [early, late]) {
    stay.listingId = await api.listing(hal.token, { city: 'Windowville' });
    stay.bookingId = await api.book(tom.token, await api.quote(tom.token, stay.listingId, day(0), day(1)));
    await payBooking(api, provider, tom.token, stay.bookingId);
  }
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const review = { cleanliness: 5, accuracy: 4, communication: 5, comment: 'A calm flat and a kind host, thank you' };
const published = async (listingId: string) => (await api.list(`/listings/${listingId}/reviews`)) as Json[];

describe('a review window of 30 days', () => {
  it('takes a review up to 30 days after the check-out, and publishes a review alone only when those 30 days are over', async () => {
    // Nine days after the check-out (day 1): in the window, as before.
    await at(10);
    await api.done('POST', `/bookings/${early.bookingId}/review`, tom.token, review);

    // Nineteen days after the check-out: in the window now, refused before; the early review is not published yet.
    await at(20);
    expect(await published(early.listingId)).toEqual([]);
    expect((await api.act('POST', `/bookings/${late.bookingId}/review`, tom.token, review)).accepted).toBe(true);
    expect(await published(late.listingId)).toEqual([]);

    // Thirty days after the check-out: the last day of the window, still unpublished.
    await at(31);
    expect(await published(early.listingId)).toEqual([]);

    // Thirty-one days after: the window has closed, both are published, and no review is taken any more.
    await at(32);
    expect((await published(early.listingId)).map(each => each.bookingId)).toEqual([early.bookingId]);
    expect((await published(late.listingId)).map(each => each.bookingId)).toEqual([late.bookingId]);
    const hosted = await api.act('POST', `/bookings/${late.bookingId}/guest-review`, hal.token, {
      rating: 5,
      comment: 'A perfect guest, welcome back any time',
    });
    expect(hosted.accepted).toBe(false);
  }, 240000);
});
