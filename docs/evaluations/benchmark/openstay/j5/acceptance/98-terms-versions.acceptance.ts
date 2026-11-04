import { adminEnvironment, client, Client, database, day, eventually, Running, start, stop } from './openstay';

/**
 * Request 98: versions of the terms, published by administrators, accepted by each account before it books
 * or publishes, and kept by each booking. The cases run in order on one database: nothing is published
 * until the second.
 */
const db = database('terms-versions');
const ADMIN = 'ada@terms.test';
let server: Running;
let api: Client;
let admin: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, adminEnvironment(ADMIN));
  api = client(server.port);
  admin = await api.admin(ADMIN);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const publish = (version: string, text: string, token = admin.token) =>
  api.act('POST', '/admin/terms', token, { version, text });
const accept = (token: string, version: string) => api.act('POST', '/accounts/me/terms/accept', token, { version });
const accepted = async (token: string) => (await api.read('/accounts/me', token)).termsAccepted;
const bookingBody = async (token: string, listingId: string, from: number, to: number) => ({
  quoteId: await api.quote(token, listingId, day(from), day(to)),
});
/** A booking made before any version existed, read again once versions exist. */
let early: { bookingId: string; token: string };

describe('versions of the terms', () => {
  it('needs nothing while no version exists, and a booking then shows no version', async () => {
    const hal = await api.host('hal@terms.test');
    const tom = await api.traveller('tom@terms.test');
    expect((await api.call('GET', '/terms')).status).toBe(404);
    expect(await accepted(tom.token)).toBeNull();
    expect((await accept(tom.token, 'v1')).accepted).toBe(false);
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).termsVersion).toBeNull();
    early = { bookingId, token: tom.token };
  }, 60000);

  it('is published by administrators only, a version never changing, and read by anyone', async () => {
    const tom = await api.traveller('tom2@terms.test');
    expect(await api.refused('POST', '/admin/terms', tom.token, { version: 'v1', text: 'The terms.' })).toBe(true);
    for (const [version, text] of [
      ['v 1', 'The terms.'],
      ['v/1', 'The terms.'],
      ['', 'The terms.'],
      ['a'.repeat(21), 'The terms.'],
      ['v1', ''],
      ['v1', 'x'.repeat(100_001)],
    ])
      expect((await publish(version, text)).accepted).toBe(false);
    expect((await api.call('GET', '/terms')).status).toBe(404);

    const before = Date.now();
    expect((await publish('2026.1-a', 'The terms of OpenStay, first version.')).accepted).toBe(true);
    const current = await api.read('/terms');
    expect(current).toMatchObject({ version: '2026.1-a', text: 'The terms of OpenStay, first version.' });
    expect(Date.parse(String(current.publishedAt))).toBeGreaterThanOrEqual(before - 5000);
    expect(await api.read('/terms/2026.1-a', tom.token)).toMatchObject(current);
    expect((await publish('2026.1-a', 'Another text.')).accepted).toBe(false);
    expect(await api.read('/terms')).toMatchObject({ text: 'The terms of OpenStay, first version.' });

    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=2026.1-a', admin.token),
      found => found.length >= 1,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId: admin.id, action: 'terms-published', subjectId: '2026.1-a', note: null }),
    ]);
    // A booking made before any version keeps none.
    expect((await api.read(`/bookings/${early.bookingId}`, early.token)).termsVersion).toBeNull();
  }, 60000);

  it('refuses a booking and a publication by an account that has not accepted the current version', async () => {
    const hal = await api.host('hal3@terms.test');
    const mia = await api.host('mia3@terms.test');
    const tom = await api.traveller('tom3@terms.test');
    // Creating a draft needs nothing; publishing it does.
    const id = await api.listing(hal.token, {}, false);
    expect(await api.refused('POST', `/listings/${id}/publish`, hal.token)).toBe(true);
    expect((await accept(hal.token, 'v0')).accepted).toBe(false);
    expect((await accept(hal.token, 'not-a-version')).accepted).toBe(false);
    expect(await accepted(hal.token)).toBeNull();
    expect((await accept(hal.token, '2026.1-a')).accepted).toBe(true);
    expect(await accepted(hal.token)).toBe('2026.1-a');
    await api.done('POST', `/listings/${id}/publish`, hal.token);

    // A manager publishes the organisation's listing only once they have accepted too.
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const draft = await api.listing(hal.token, {}, false);
    await api.done('POST', `/listings/${draft}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    expect(await api.refused('POST', `/listings/${draft}/publish`, mia.token)).toBe(true);
    await accept(mia.token, '2026.1-a');
    await api.done('POST', `/listings/${draft}/publish`, mia.token);

    // The traveller quotes and holds, but books (at once or on request) only once accepted.
    const asked = await api.listing(hal.token);
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    await api.create('/holds', tom.token, { listingId: id, checkIn: day(30), checkOut: day(31), guests: 1 });
    expect(await api.refused('POST', '/bookings', tom.token, await bookingBody(tom.token, id, 10, 12))).toBe(true);
    expect(await api.refused('POST', '/bookings', tom.token, await bookingBody(tom.token, asked, 10, 12))).toBe(true);
    expect((await accept(tom.token, '2026.1-a')).accepted).toBe(true);
    const instant = await api.create('/bookings', tom.token, await bookingBody(tom.token, id, 10, 12));
    const requested = await api.create('/bookings', tom.token, await bookingBody(tom.token, asked, 10, 12));
    expect(await api.read(`/bookings/${instant}`, tom.token)).toMatchObject({
      status: 'confirmed',
      termsVersion: '2026.1-a',
    });
    expect(await api.read(`/bookings/${requested}`, tom.token)).toMatchObject({
      status: 'requested',
      termsVersion: '2026.1-a',
    });
  }, 90000);

  it('asks everyone to accept a new version before their next booking or publication, and nothing else', async () => {
    const hal = await api.host('hal4@terms.test');
    const tom = await api.traveller('tom4@terms.test');
    for (const token of [hal.token, tom.token]) await accept(token, '2026.1-a');
    const id = await api.listing(hal.token);
    const asked = await api.listing(hal.token);
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const confirmed = await api.create('/bookings', tom.token, await bookingBody(tom.token, id, 10, 12));
    const cancelled = await api.create('/bookings', tom.token, await bookingBody(tom.token, id, 20, 22));
    const requested = await api.create('/bookings', tom.token, await bookingBody(tom.token, asked, 10, 12));

    expect((await publish('v2', 'The terms of OpenStay, second version.')).accepted).toBe(true);
    expect(await api.read('/terms')).toMatchObject({ version: 'v2' });
    expect(await api.read('/terms/2026.1-a')).toMatchObject({ version: '2026.1-a' });
    expect(await accepted(tom.token)).toBe('2026.1-a');
    expect((await api.read(`/bookings/${confirmed}`, tom.token)).termsVersion).toBe('2026.1-a');

    // Nothing else needs it: a quote, a hold, accepting a request, a change of dates, a cancellation.
    const quoteId = await api.quote(tom.token, id, day(40), day(42));
    await api.create('/holds', tom.token, { listingId: id, checkIn: day(50), checkOut: day(51), guests: 1 });
    await api.done('POST', `/bookings/${requested}/accept`, hal.token);
    await api.done('POST', `/bookings/${confirmed}/change-dates`, tom.token, { checkIn: day(11), checkOut: day(13) });
    await api.done('POST', `/bookings/${cancelled}/cancel`, tom.token);
    expect((await api.read(`/listings/${id}`)).status).toBe('published');

    // A booking or a publication needs the new version.
    expect(await api.refused('POST', '/bookings', tom.token, { quoteId })).toBe(true);
    const draft = await api.listing(hal.token, {}, false);
    expect(await api.refused('POST', `/listings/${draft}/publish`, hal.token)).toBe(true);
    expect((await accept(tom.token, '2026.1-a')).accepted).toBe(false);
    expect((await accept(tom.token, 'v2')).accepted).toBe(true);
    expect((await accept(hal.token, 'v2')).accepted).toBe(true);
    expect(await accepted(tom.token)).toBe('v2');
    const later = await api.create('/bookings', tom.token, { quoteId });
    await api.done('POST', `/listings/${draft}/publish`, hal.token);
    expect((await api.read(`/bookings/${later}`, tom.token)).termsVersion).toBe('v2');
    for (const each of [confirmed, requested, cancelled])
      expect((await api.read(`/bookings/${each}`, tom.token)).termsVersion).toBe('2026.1-a');
  }, 90000);
});
