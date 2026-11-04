import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 64: every open report, of a message, a review or a listing, waits for the administrators, the
 * oldest first; one decision closes every open report on its subject, once, even when two administrators
 * decide at the same moment on two servers.
 */
const db = database('moderation-queue');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let other: Running;
let api: Client;
let otherApi: Client;
type Person = { id: string; email: string; token: string };
let ada: Person;
let bob: Person;
let hal: Person;
let tom: Person;
let una: Person;
let kim: Person;
/** The traveller's published review of a stay at hal's (requests 57, 58). */
let reviewId: string;

beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    JOBS_INTERVAL_SECONDS: '1',
    ...adminEnvironment('ada@moderation.test', 'bob@moderation.test'),
  };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  ada = await api.admin('ada@moderation.test');
  bob = await api.admin('bob@moderation.test');
  hal = await api.host('hal@moderation.test');
  tom = await api.traveller('tom@moderation.test');
  una = await api.traveller('una@moderation.test');
  kim = await api.traveller('kim@moderation.test');
  const listingId = await api.listing(hal.token, { city: 'Moderville' });
  const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(0), day(1)));
  await payBooking(api, provider, tom.token, bookingId);
  // Three days later the stay took place; both reviews written, both are published (requests 57, 58).
  server = await restart(server, db.path, { ...environment, ...clock(3) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of [ada, bob, hal, tom, una, kim]) person.token = await api.login(person.email);
  reviewId = await api.create(`/bookings/${bookingId}/review`, tom.token, {
    cleanliness: 4,
    accuracy: 4,
    communication: 4,
    comment: 'A stay exactly as the listing said.',
  });
  await api.create(`/bookings/${bookingId}/guest-review`, hal.token, {
    rating: 5,
    comment: 'A careful guest, welcome back any time.',
  });
  await eventually(
    () => api.list(`/listings/${listingId}/reviews`),
    reviews => reviews.some(each => each.id === reviewId),
  );
  other = await start(db.path, { ...environment, ...clock(3) });
  otherApi = client(other.port);
}, 180000);
afterAll(async () => {
  await stop(server);
  await stop(other);
  await provider.close();
  db.remove();
});

const queue = (token = ada.token) => api.list('/admin/reports', token);
const reportOf = (id: string, token = ada.token) => api.read(`/admin/reports/${id}`, token);
const listingReport = (listingId: string, person: Person, reason = 'scam') =>
  api.create(`/listings/${listingId}/report`, person.token, { reason });
/** The queue's reports among `ids`, in the order the queue gives them. */
const among = async (ids: string[]) => (await queue()).filter(each => ids.includes(String(each.id)));

describe('the moderation queue', () => {
  it('answers 403 to anyone but an administrator, and leaves the report as it was', async () => {
    const listingId = await api.listing(hal.token, { city: 'Moderville' });
    const id = await listingReport(listingId, tom);
    for (const person of [tom, hal]) {
      expect((await api.call('GET', '/admin/reports', person.token)).status).toBe(403);
      expect((await api.call('GET', `/admin/reports/${id}`, person.token)).status).toBe(403);
      expect(await api.refused('POST', `/admin/reports/${id}/dismiss`, person.token, { note: 'Not mine to say' })).toBe(
        true,
      );
      expect(await api.refused('POST', `/admin/reports/${id}/uphold`, person.token, { note: 'Not mine to say' })).toBe(
        true,
      );
    }
    expect(await reportOf(id)).toMatchObject({ id, status: 'open', note: null, closedBy: null, closedAt: null });
  }, 60000);

  it('lists the open reports of a message, a review and a listing, the oldest first, as they were made', async () => {
    const listingId = await api.listing(hal.token, { city: 'Moderville' });
    const conversationId = await api.create('/conversations', tom.token, {
      listingId,
      text: 'Is the flat near the station?',
    });
    await api.done('POST', `/conversations/${conversationId}/messages`, hal.token, { text: 'Pay me outside, it is cheaper.' });
    const messages = (await api.read(`/conversations/${conversationId}`, tom.token)).messages as Json[];
    const messageId = String(messages.find(each => each.senderId === hal.id)?.id);

    const ofMessage = await api.create(`/messages/${messageId}/report`, tom.token, { reason: 'Asks to pay outside' });
    await sleep(1100);
    const ofReview = await api.create(`/reviews/${reviewId}/report`, una.token, { reason: 'This stay never happened' });
    await sleep(1100);
    const ofListing = await api.create(`/listings/${listingId}/report`, kim.token, {
      reason: 'scam',
      details: 'Asks for a bank transfer.',
    });
    await sleep(1100);
    const plain = await listingReport(listingId, una, 'inaccurate');

    const listed = await among([ofMessage, ofReview, ofListing, plain]);
    expect(listed).toEqual([
      expect.objectContaining({
        id: ofMessage,
        kind: 'message',
        subjectId: messageId,
        reporterId: tom.id,
        reason: 'Asks to pay outside',
        details: null,
        createdAt: expect.any(String),
      }),
      expect.objectContaining({
        id: ofReview,
        kind: 'review',
        subjectId: reviewId,
        reporterId: una.id,
        reason: 'This stay never happened',
        details: null,
      }),
      expect.objectContaining({
        id: ofListing,
        kind: 'listing',
        subjectId: listingId,
        reporterId: kim.id,
        reason: 'scam',
        details: 'Asks for a bank transfer.',
      }),
      expect.objectContaining({ id: plain, kind: 'listing', subjectId: listingId, reason: 'inaccurate', details: null }),
    ]);
    // Every administrator reads the same queue, and any report in it.
    expect((await queue(bob.token)).filter(each => [ofMessage, ofReview].includes(String(each.id)))).toHaveLength(2);
    expect(await reportOf(ofMessage, bob.token)).toMatchObject({
      id: ofMessage,
      kind: 'message',
      subjectId: messageId,
      reporterId: tom.id,
      reason: 'Asks to pay outside',
      status: 'open',
      note: null,
      closedBy: null,
      closedAt: null,
    });
  }, 60000);

  it('dismisses a report with a note of 1 to 500 characters, once, and changes nothing else', async () => {
    const listingId = await api.listing(hal.token, { city: 'Dismissville' });
    const id = await listingReport(listingId, tom);
    expect(await api.refused('POST', `/admin/reports/${id}/dismiss`, ada.token, { note: '' })).toBe(true);
    expect(await api.refused('POST', `/admin/reports/${id}/dismiss`, ada.token, { note: 'x'.repeat(501) })).toBe(true);
    expect(await reportOf(id)).toMatchObject({ status: 'open', note: null });

    const note = 'x'.repeat(500);
    await api.done('POST', `/admin/reports/${id}/dismiss`, ada.token, { note });
    expect(await among([id])).toEqual([]);
    expect(await reportOf(id, bob.token)).toMatchObject({
      id,
      kind: 'listing',
      subjectId: listingId,
      reporterId: tom.id,
      status: 'dismissed',
      note,
      closedBy: ada.id,
      closedAt: expect.any(String),
    });

    expect(await api.refused('POST', `/admin/reports/${id}/dismiss`, ada.token, { note: 'Again' })).toBe(true);
    expect(await api.refused('POST', `/admin/reports/${id}/uphold`, bob.token, { note: 'On second thoughts' })).toBe(true);
    expect(await reportOf(id)).toMatchObject({ status: 'dismissed', note, closedBy: ada.id });
    expect(await api.read(`/listings/${listingId}`)).toMatchObject({ status: 'published' });
    expect((await api.list('/listings?city=Dismissville')).map(each => each.id)).toEqual([listingId]);
  }, 60000);

  it('closes every open report on the same subject with one decision, and a report made afterwards is open', async () => {
    const dismissed = await api.listing(hal.token, { city: 'Moderville' });
    const upheld = await api.listing(hal.token, { city: 'Moderville' });
    const three = [await listingReport(dismissed, tom), await listingReport(dismissed, una), await listingReport(dismissed, kim)];
    const two = [await listingReport(upheld, tom), await listingReport(upheld, una)];

    await api.done('POST', `/admin/reports/${three[1]}/dismiss`, ada.token, { note: 'The photos match the place.' });
    expect(await among([...three, ...two])).toEqual(two.map(id => expect.objectContaining({ id })));
    for (const id of three)
      expect(await reportOf(id)).toMatchObject({
        status: 'dismissed',
        note: 'The photos match the place.',
        closedBy: ada.id,
        closedAt: expect.any(String),
      });

    // Closed, the account may report the listing again: an open report, alone on its subject.
    const again = await listingReport(dismissed, tom, 'other');
    expect(await reportOf(again)).toMatchObject({ status: 'open', subjectId: dismissed });

    await api.done('POST', `/admin/reports/${two[0]}/uphold`, bob.token, { note: 'A known scam.' });
    for (const id of two)
      expect(await reportOf(id)).toMatchObject({ status: 'upheld', note: 'A known scam.', closedBy: bob.id });
    // Another subject's report stays open.
    expect(await among([...three, ...two, again])).toEqual([expect.objectContaining({ id: again })]);
    expect(await reportOf(again)).toMatchObject({ status: 'open' });
  }, 60000);

  it('lets exactly one of two administrators close a report at the same moment, on one server or two', async () => {
    for (const [round, apis] of [
      [api, otherApi],
      [api, api],
      [otherApi, api],
    ].entries()) {
      const listingId = await api.listing(hal.token, { city: 'Moderville' });
      const id = await listingReport(listingId, round % 2 ? una : kim);
      const [dismissal, upholding] = await Promise.all([
        apis[0].act('POST', `/admin/reports/${id}/dismiss`, ada.token, { note: 'Fine as it is.' }),
        apis[1].act('POST', `/admin/reports/${id}/uphold`, bob.token, { note: 'Not fine at all.' }),
      ]);
      expect([dismissal.accepted, upholding.accepted].filter(Boolean)).toHaveLength(1);
      expect(await reportOf(id)).toMatchObject(
        dismissal.accepted
          ? { status: 'dismissed', note: 'Fine as it is.', closedBy: ada.id }
          : { status: 'upheld', note: 'Not fine at all.', closedBy: bob.id },
      );
    }
  }, 90000);

  it('reads no report that does not exist, and closes none', async () => {
    expect((await api.call('GET', '/admin/reports/no-such-report', ada.token)).status).toBe(404);
    expect(await api.refused('POST', '/admin/reports/no-such-report/dismiss', ada.token, { note: 'Nothing' })).toBe(true);
  }, 60000);
});
