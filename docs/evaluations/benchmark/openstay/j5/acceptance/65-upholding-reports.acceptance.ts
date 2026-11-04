import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  idOf,
  Json,
  PDF,
  restart,
  Running,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 65: an upheld report changes its subject, once — a listing suspended by moderation until an
 * administrator reinstates it, a review removed with its reply and out of every rating, a message hidden
 * from both parties — and a dismissed one changes nothing.
 */
const db = database('upholding-reports');
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
let mia: Person;
let vic: Person;
let tom: Person;
let una: Person;
let kim: Person;
let organisationId: string;
/** L1 has two stays that took place (tom's, una's), L2 one (tom's), each to be reviewed both ways. */
const stays = { L1: '', L2: '', s1: '', s2: '', s3: '' };

beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    JOBS_INTERVAL_SECONDS: '1',
    ...adminEnvironment('ada@upholding.test', 'bob@upholding.test'),
  };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  ada = await api.admin('ada@upholding.test');
  bob = await api.admin('bob@upholding.test');
  hal = await api.host('hal@upholding.test');
  mia = await api.host('mia@upholding.test');
  vic = await api.traveller('vic@upholding.test');
  tom = await api.traveller('tom@upholding.test');
  una = await api.traveller('una@upholding.test');
  kim = await api.traveller('kim@upholding.test');
  organisationId = await api.create('/organisations', hal.token, { name: 'Hal Stays' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });

  stays.L1 = await api.listing(hal.token, { city: 'Reviewville', nightlyPrice: 10000 });
  stays.L2 = await api.listing(hal.token, { city: 'Reviewville', nightlyPrice: 12000 });
  stays.s1 = await api.book(tom.token, await api.quote(tom.token, stays.L1, day(0), day(1)));
  stays.s2 = await api.book(una.token, await api.quote(una.token, stays.L1, day(1), day(2)));
  stays.s3 = await api.book(tom.token, await api.quote(tom.token, stays.L2, day(0), day(1)));
  await payBooking(api, provider, tom.token, stays.s1);
  await payBooking(api, provider, una.token, stays.s2);
  await payBooking(api, provider, tom.token, stays.s3);

  // Three days later the stays took place (request 57).
  server = await restart(server, db.path, { ...environment, ...clock(3) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of [ada, bob, hal, mia, vic, tom, una, kim]) person.token = await api.login(person.email);
  other = await start(db.path, { ...environment, ...clock(3) });
  otherApi = client(other.port);
}, 180000);
afterAll(async () => {
  await stop(server);
  await stop(other);
  await provider.close();
  db.remove();
});

const listing = (id: string, token?: string) => api.read(`/listings/${id}`, token);
const report = (listingId: string, person: Person, reason = 'scam') =>
  api.create(`/listings/${listingId}/report`, person.token, { reason });
const uphold = (reportId: string, admin = ada, note = 'Confirmed by our checks.') =>
  api.done('POST', `/admin/reports/${reportId}/uphold`, admin.token, { note });
const suspendedByModeration = (id: string) =>
  eventually(
    () => listing(id, hal.token),
    each => each.status === 'suspended' && each.suspendedBy === 'moderation',
  );
const found = async (city: string) => (await api.list(`/listings?city=${city}`)).map(each => String(each.id));
const scores = (score: number) => ({ cleanliness: score, accuracy: score, communication: score });
/** The host's rating once it reads `count` reviews (it follows the reviews, request 59). */
const hostRating = (count: number) =>
  eventually(
    () => api.read(`/hosts/${hal.id}/rating`),
    rating => rating.count === count,
  );
/** The ids a search of Reviewville sorted by rating finds, once they are `expected`. */
const byRating = (expected: string[]) =>
  eventually(
    async () => (await api.list('/listings?city=Reviewville&sort=rating')).map(each => String(each.id)),
    ids => JSON.stringify(ids) === JSON.stringify(expected),
  );

describe('upholding a report', () => {
  it('suspends a listing by moderation: nobody books, quotes or holds it, only its host side sees it, its bookings stay', async () => {
    const id = await api.listing(hal.token, { city: 'Suspendville' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    expect(await listing(id)).toMatchObject({ status: 'published', suspendedBy: null });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    const quoteId = await api.quote(tom.token, id, day(30), day(31));
    const first = await report(id, una);
    const second = await report(id, kim, 'inaccurate');

    await uphold(first);
    expect(await suspendedByModeration(id)).toMatchObject({ status: 'suspended', suspendedBy: 'moderation' });
    expect(await api.read(`/admin/reports/${second}`, ada.token)).toMatchObject({ status: 'upheld' });
    for (const person of [mia, vic]) expect(await listing(id, person.token)).toMatchObject({ status: 'suspended' });
    for (const token of [undefined, tom.token, una.token]) expect(await api.hidden(`/listings/${id}`, token)).toBe(true);
    expect(await found('Suspendville')).toEqual([]);
    expect(await api.refused('POST', '/quotes', una.token, { listingId: id, checkIn: day(40), checkOut: day(41), guests: 1 })).toBe(true);
    expect(await api.refused('POST', '/bookings', tom.token, { quoteId })).toBe(true);
    expect(await api.refused('POST', '/holds', una.token, { listingId: id, checkIn: day(40), checkOut: day(41), guests: 1 })).toBe(
      true,
    );
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ status: 'confirmed' });

    // Its host and its managers cannot publish it again.
    expect(await api.refused('POST', `/listings/${id}/publish`, hal.token)).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/publish`, mia.token)).toBe(true);
    expect(await listing(id, hal.token)).toMatchObject({ status: 'suspended', suspendedBy: 'moderation' });
  }, 90000);

  it('is undone only by an administrator reinstating it, with a note, and only when suspended by moderation', async () => {
    const id = await api.listing(hal.token, { city: 'Reinstateville' });
    expect(await api.refused('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: 'Not suspended' })).toBe(true);
    await uphold(await report(id, una));
    await suspendedByModeration(id);

    expect(await api.refused('POST', `/admin/listings/${id}/reinstate`, hal.token, { note: 'Please' })).toBe(true);
    expect(await api.refused('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: '' })).toBe(true);
    expect(await api.refused('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: 'x'.repeat(501) })).toBe(true);
    expect(await listing(id, hal.token)).toMatchObject({ status: 'suspended', suspendedBy: 'moderation' });

    await api.done('POST', `/admin/listings/${id}/reinstate`, bob.token, { note: 'The host sent proof of ownership.' });
    expect(await listing(id)).toMatchObject({ status: 'published', suspendedBy: null });
    expect(await found('Reinstateville')).toEqual([id]);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(21)));
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ status: 'confirmed' });
    expect(await api.refused('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: 'Again' })).toBe(true);
  }, 90000);

  it("tells a host's own suspension from moderation's, and keeps an archived listing archived", async () => {
    const own = await api.listing(hal.token, { city: 'Hostville' });
    await api.done('POST', `/listings/${own}/suspend`, hal.token);
    expect(await listing(own, hal.token)).toMatchObject({ status: 'suspended', suspendedBy: 'host' });
    expect(await api.refused('POST', `/admin/listings/${own}/reinstate`, ada.token, { note: 'Not ours' })).toBe(true);
    await api.done('POST', `/listings/${own}/publish`, hal.token);
    expect(await listing(own)).toMatchObject({ status: 'published', suspendedBy: null });

    // Suspended by its host, then upheld: suspended by moderation, and the host cannot publish it.
    const reportId = await report(own, tom);
    await api.done('POST', `/listings/${own}/suspend`, hal.token);
    await uphold(reportId);
    await suspendedByModeration(own);
    expect(await api.refused('POST', `/listings/${own}/publish`, hal.token)).toBe(true);
    // The host may still archive it.
    await api.done('POST', `/listings/${own}/archive`, hal.token);
    expect(await listing(own, hal.token)).toMatchObject({ status: 'archived' });

    const archived = await api.listing(hal.token, { city: 'Hostville' });
    const late = await report(archived, tom);
    await api.done('POST', `/listings/${archived}/archive`, hal.token);
    await uphold(late);
    expect(await api.read(`/admin/reports/${late}`, ada.token)).toMatchObject({ status: 'upheld' });
    expect(await listing(archived, hal.token)).toMatchObject({ status: 'archived' });
  }, 90000);

  it('changes nothing for a dismissed report', async () => {
    const id = await api.listing(hal.token, { city: 'Dismissville' });
    const reportId = await report(id, una);
    await api.done('POST', `/admin/reports/${reportId}/dismiss`, ada.token, { note: 'The listing is genuine.' });
    expect(await listing(id)).toMatchObject({ status: 'published', suspendedBy: null });
    expect(await found('Dismissville')).toEqual([id]);
    expect(await api.quote(tom.token, id, day(20), day(21))).toEqual(expect.any(String));
  }, 60000);

  it('removes a review for everyone, its author included, with its reply, and the ratings and the order follow', async () => {
    const { L1, L2, s1, s2, s3 } = stays;
    const kept = await api.create(`/bookings/${s1}/review`, tom.token, { ...scores(5), comment: 'Spotless, and the host was lovely.' });
    const removed = await api.create(`/bookings/${s2}/review`, una.token, { ...scores(1), comment: 'Nothing was as the photos showed.' });
    const third = await api.create(`/bookings/${s3}/review`, tom.token, { ...scores(4), comment: 'A good stay, a little noisy at night.' });
    for (const bookingId of [s1, s2, s3])
      await api.create(`/bookings/${bookingId}/guest-review`, hal.token, {
        rating: 5,
        comment: 'A careful guest, welcome back any time.',
      });
    await eventually(
      () => api.list(`/listings/${L1}/reviews`),
      reviews => reviews.length === 2,
    );
    await api.done('POST', `/reviews/${removed}/reply`, hal.token, { text: 'We are sorry, the photos are recent.' });
    // L1: (5 + 1) / 2 = 3.0 on each criterion; L2: 4.0; the host: (5 + 1 + 4) / 3 = 3.3.
    await eventually(
      () => listing(L1),
      each => (each.rating as Json | null)?.count === 2,
    );
    expect((await listing(L1)).rating).toMatchObject({ overall: 3, count: 2 });
    expect(await hostRating(3)).toMatchObject({ overall: 3.3, count: 3 });
    expect(await byRating([L2, L1])).toEqual([L2, L1]);

    const reportId = await api.create(`/reviews/${removed}/report`, kim.token, { reason: 'Written by a competitor' });
    await api.create(`/reviews/${removed}/report`, tom.token, { reason: 'Not what happened' });
    await uphold(reportId, bob, 'The review breaks our rules.');

    const reviews = await eventually(
      () => api.list(`/listings/${L1}/reviews`),
      list => !list.some(each => each.id === removed),
    );
    expect(reviews.map(each => each.id)).toEqual([kept]);
    for (const person of [una, hal]) {
      const both = await api.read(`/bookings/${s2}/reviews`, person.token);
      expect(both.traveller).toBeNull();
      expect(both.host).toMatchObject({ rating: 5 });
    }
    expect(JSON.stringify(await api.list(`/listings/${L1}/reviews`))).not.toContain('the photos are recent');
    expect(
      await eventually(
        () => listing(L1),
        each => (each.rating as Json | null)?.count === 1,
      ),
    ).toMatchObject({ rating: { cleanliness: 5, accuracy: 5, communication: 5, overall: 5, count: 1 } });
    expect(await hostRating(2)).toMatchObject({ overall: 4.5, count: 2 });
    const searched = await eventually(
      () => api.list('/listings?city=Reviewville'),
      found => (found.find(each => each.id === L1)?.rating as Json | null)?.count === 1,
    );
    expect(searched.find(each => each.id === L1)?.rating).toMatchObject({ overall: 5, count: 1 });
    expect(await byRating([L1, L2])).toEqual([L1, L2]);
    // Its author wrote their one review of that stay.
    expect(await api.refused('POST', `/bookings/${s2}/review`, una.token, { ...scores(3), comment: 'Trying once more, kindly.' })).toBe(true);

    // The last review of L2 removed: L2 has no rating, and comes last.
    await uphold(await api.create(`/reviews/${third}/report`, una.token, { reason: 'Not true' }));
    expect(
      await eventually(
        () => listing(L2),
        each => each.rating === null,
      ),
    ).toMatchObject({ rating: null });
    expect(await hostRating(1)).toMatchObject({ overall: 5, count: 1 });
    expect(await byRating([L1, L2])).toEqual([L1, L2]);
    expect((await api.list('/listings?city=Reviewville')).find(each => each.id === L2)?.rating).toBeNull();
  }, 120000);

  it("removes a host's review of a guest from every list, and its author cannot write it again", async () => {
    const { s1 } = stays;
    const both = await api.read(`/bookings/${s1}/reviews`, hal.token);
    let guestReviewId = String((both.host as Json | null)?.id ?? '');
    if (!guestReviewId) {
      // Written by the case before; written here when that case did not get so far.
      await api.act('POST', `/bookings/${s1}/review`, tom.token, { ...scores(5), comment: 'Spotless, and the host was lovely.' });
      guestReviewId = idOf(
        (
          await api.act('POST', `/bookings/${s1}/guest-review`, hal.token, {
            rating: 5,
            comment: 'A careful guest, welcome back any time.',
          })
        ).result,
      );
    }
    await eventually(
      () => api.list(`/accounts/${tom.id}/guest-reviews`, una.token),
      list => list.some(each => each.id === guestReviewId),
    );
    await uphold(await api.create(`/reviews/${guestReviewId}/report`, tom.token, { reason: 'Unfair to me' }));
    expect(
      await eventually(
        () => api.list(`/accounts/${tom.id}/guest-reviews`, una.token),
        list => !list.some(each => each.id === guestReviewId),
      ),
    ).not.toContainEqual(expect.objectContaining({ id: guestReviewId }));
    for (const person of [tom, hal]) expect((await api.read(`/bookings/${s1}/reviews`, person.token)).host).toBeNull();
    expect(
      await api.refused('POST', `/bookings/${s1}/guest-review`, hal.token, { rating: 4, comment: 'Writing it once more.' }),
    ).toBe(true);
  }, 60000);

  it('hides an upheld message from both parties: out of the conversation, not unread, its attachments not served', async () => {
    const id = await api.listing(hal.token, { city: 'Messageville' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    const conversationId = await api.create('/conversations', tom.token, { listingId: id, text: 'Hello, is it free in May?' });
    const upload = await api.upload(`/conversations/${conversationId}/attachments`, tom.token, PDF, 'id-scan.pdf');
    expect(upload.accepted).toBe(true);
    const attachmentId = idOf(upload.result);
    await api.done('POST', `/conversations/${conversationId}/messages`, tom.token, {
      text: 'Here is my ID, pay me back outside.',
      attachmentIds: [attachmentId],
    });
    const messageIds = async (token: string) =>
      ((await api.read(`/conversations/${conversationId}`, token)).messages as Json[]).map(each => String(each.id));
    const [first, reported] = await messageIds(tom.token);
    await api.create(`/messages/${reported}/report`, hal.token, { reason: 'Asks to pay outside' });
    const unread = async () => Number((await api.read('/conversations/unread', mia.token)).total);
    const before = await unread();
    expect(await messageIds(mia.token)).toEqual([first, reported]);
    expect((await api.download(`/attachments/${attachmentId}`, mia.token)).status).toBe(200);

    const [reportId] = (await api.list('/admin/reports', ada.token))
      .filter(each => each.subjectId === reported)
      .map(each => String(each.id));
    await uphold(reportId);
    for (const person of [tom, hal, mia])
      expect(
        await eventually(
          () => messageIds(person.token),
          ids => !ids.includes(reported),
        ),
      ).toEqual([first]);
    expect(
      await eventually(
        unread,
        total => total === before - 1,
      ),
    ).toBe(before - 1);
    for (const person of [tom, hal, mia])
      expect((await api.download(`/attachments/${attachmentId}`, person.token)).status).toBe(404);
  }, 60000);

  it('lets one of two administrators upholding two reports of one listing at the same moment close both, on one server or two', async () => {
    // A token is used on the server that gave it: each administrator signs in on the second server too.
    const tokens = new Map([
      [api, { ada: ada.token, bob: bob.token }],
      [otherApi, { ada: await otherApi.login(ada.email), bob: await otherApi.login(bob.email) }],
    ]);
    for (const apis of [
      [api, otherApi],
      [api, api],
    ]) {
      const id = await api.listing(hal.token, { city: 'Raceville' });
      const first = await report(id, tom);
      const second = await report(id, una, 'unsafe');
      const outcomes = await Promise.all([
        apis[0].act('POST', `/admin/reports/${first}/uphold`, tokens.get(apis[0])!.ada, { note: 'A scam.' }),
        apis[1].act('POST', `/admin/reports/${second}/uphold`, tokens.get(apis[1])!.bob, { note: 'Unsafe.' }),
      ]);
      expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
      const winner = outcomes[0].accepted ? { note: 'A scam.', closedBy: ada.id } : { note: 'Unsafe.', closedBy: bob.id };
      for (const reportId of [first, second])
        expect(await api.read(`/admin/reports/${reportId}`, ada.token)).toMatchObject({ status: 'upheld', ...winner });
      expect(await suspendedByModeration(id)).toMatchObject({ status: 'suspended', suspendedBy: 'moderation' });
    }
  }, 90000);
});
