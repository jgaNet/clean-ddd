import {
  calendarServer,
  client,
  Client,
  database,
  day,
  eventually,
  ics,
  Json,
  kill,
  notificationService,
  Running,
  sleep,
  start,
  stop,
} from './openstay';

/**
 * Request 97: an imported event that shares a night with a confirmed booking. The booking keeps its nights,
 * the conflict is listed while it lasts, and the host gets one notice per event and booking, sent until
 * accepted, never twice, never lost.
 */
const db = database('import-conflicts');
const outside = calendarServer();
const service = notificationService(0);
const services = [service];
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { JOBS_INTERVAL_SECONDS: '1', NOTIFY_URL: await service.url() });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await outside.close();
  await Promise.all(services.map(each => each.close()));
  db.remove();
});

const link = (listingId: string, token: string, urls: string[], through = api) =>
  through.done('PUT', `/listings/${listingId}/imported-calendars`, token, { urls });
const conflictsOf = (listingId: string, token: string, through = api) =>
  through.list(`/listings/${listingId}/calendar-conflicts`, token);
/** Reads the conflicts until there are `count` of them. */
const conflicts = (listingId: string, token: string, count: number, through = api) =>
  eventually(
    () => conflictsOf(listingId, token, through),
    found => found.length === count,
    60000,
  );
const night = async (listingId: string, at: number) =>
  (await api.list(`/listings/${listingId}/calendar?from=${day(at)}&to=${day(at + 1)}`))[0];
/** Waits until `name` was fetched `count` more times: that many sweeps have read it. */
const sweeps = async (name: string, count: number) => {
  const target = outside.fetchesOf(name) + count;
  await eventually(
    async () => outside.fetchesOf(name),
    fetches => fetches >= target,
    60000,
  );
};
const noticesOf = (bookingId: string, from = service) =>
  from.notices('calendar-conflict').filter(each => each.bookingId === bookingId);

describe('import conflicts', () => {
  it('lists a conflict while it lasts, keeps the shared nights for the booking, and tells the host once', async () => {
    const hal = await api.host('hal@import-conflicts.test');
    const tom = await api.traveller('tom@import-conflicts.test');
    await api.done('PUT', '/accounts/me/language', hal.token, { language: 'fr' });
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(13)));
    outside.serve('one', ics([{ uid: 'c1@elsewhere', from: day(12), to: day(15) }]));
    const url = await outside.url('one');
    await link(id, hal.token, [url]);

    expect(await conflicts(id, hal.token, 1)).toEqual([
      expect.objectContaining({ bookingId, url, uid: 'c1@elsewhere', from: day(12), to: day(15) }),
    ]);
    expect(await night(id, 12)).toMatchObject({ available: false, source: null });
    for (const at of [13, 14]) expect(await night(id, at)).toMatchObject({ available: false, source: 'import' });
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({
      status: 'confirmed',
      checkIn: day(10),
      checkOut: day(13),
    });
    const [notice] = await eventually(
      async () => noticesOf(bookingId),
      found => found.length >= 1,
      60000,
    );
    expect(notice).toMatchObject({
      id: expect.any(String),
      kind: 'calendar-conflict',
      hostId: hal.id,
      bookingId,
      listingId: id,
      url,
      uid: 'c1@elsewhere',
      from: day(12),
      to: day(15),
      lang: 'fr',
    });

    // Not at every sweep, and not again when the event moves, nor when it comes back after leaving.
    outside.serve('one', ics([{ uid: 'c1@elsewhere', from: day(11), to: day(14) }]));
    await eventually(
      () => conflictsOf(id, hal.token),
      found => found[0]?.from === day(11),
      60000,
    );
    expect(await conflictsOf(id, hal.token)).toEqual([
      expect.objectContaining({ bookingId, url, uid: 'c1@elsewhere', from: day(11), to: day(14) }),
    ]);
    outside.serve('one', ics([{ uid: 'c1@elsewhere', from: day(20), to: day(21) }]));
    await conflicts(id, hal.token, 0);
    outside.serve('one', ics([{ uid: 'c1@elsewhere', from: day(12), to: day(13) }]));
    await conflicts(id, hal.token, 1);
    await sweeps('one', 3);
    expect(noticesOf(bookingId)).toHaveLength(1);

    outside.serve('one', ics([]));
    expect(await conflicts(id, hal.token, 0)).toEqual([]);
  }, 300000);

  it('makes a waiting request no conflict until it is accepted, and ends a conflict when the booking leaves', async () => {
    const hal = await api.host('hal2@import-conflicts.test');
    const tom = await api.traveller('tom2@import-conflicts.test');
    const una = await api.traveller('una2@import-conflicts.test');
    const id = await api.listing(hal.token);
    const moving = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(32)));
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    const requested = await api.book(una.token, await api.quote(una.token, id, day(10), day(12)));
    outside.serve(
      'two',
      ics([
        { uid: 'r1', from: day(11), to: day(13) },
        { uid: 'm1', from: day(31), to: day(33) },
      ]),
    );
    const url = await outside.url('two');
    await link(id, hal.token, [url]);

    expect(await conflicts(id, hal.token, 1)).toEqual([expect.objectContaining({ bookingId: moving, uid: 'm1' })]);
    await sweeps('two', 2);
    expect(await conflictsOf(id, hal.token)).toEqual([expect.objectContaining({ bookingId: moving, uid: 'm1' })]);
    // The request keeps its nights; the event blocks the other.
    expect(await night(id, 11)).toMatchObject({ available: false, source: null });
    expect(await night(id, 12)).toMatchObject({ available: false, source: 'import' });
    expect(noticesOf(requested)).toEqual([]);

    await api.done('POST', `/bookings/${requested}/accept`, hal.token);
    await conflicts(id, hal.token, 2);
    expect(
      (
        await eventually(
          async () => noticesOf(requested),
          found => found.length >= 1,
          60000,
        )
      )[0],
    ).toMatchObject({ kind: 'calendar-conflict', bookingId: requested, uid: 'r1', from: day(11), to: day(13) });

    // A booking that leaves frees its nights: an event still there blocks them at the next sweep.
    await api.done('POST', `/bookings/${requested}/cancel`, una.token);
    await api.done('POST', `/bookings/${moving}/change-dates`, tom.token, { checkIn: day(40), checkOut: day(42) });
    expect(await conflicts(id, hal.token, 0)).toEqual([]);
    for (const at of [11, 31])
      expect(
        await eventually(
          () => night(id, at),
          found => found?.source === 'import',
          60000,
        ),
      ).toMatchObject({ available: false, source: 'import' });
  }, 300000);

  it("lists the conflicts by the booking's check-in, then uid, to the host side only", async () => {
    const hal = await api.host('hal3@import-conflicts.test');
    const mia = await api.host('mia3@import-conflicts.test');
    const val = await api.host('val3@import-conflicts.test');
    const ian = await api.host('ian3@import-conflicts.test');
    const tom = await api.traveller('tom3@import-conflicts.test');
    const una = await api.traveller('una3@import-conflicts.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const id = await api.listing(hal.token);
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });
    const later = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    const earlier = await api.book(una.token, await api.quote(una.token, id, day(10), day(12)));
    outside.serve(
      'three',
      ics([
        { uid: 'zeta', from: day(11), to: day(12) },
        { uid: 'alpha', from: day(21), to: day(23) },
        { uid: 'beta', from: day(10), to: day(11) },
      ]),
    );
    await link(id, mia.token, [await outside.url('three')]);

    await conflicts(id, hal.token, 3);
    for (const token of [hal.token, mia.token, val.token])
      expect((await conflictsOf(id, token)).map(each => [each.bookingId, each.uid])).toEqual([
        [earlier, 'beta'],
        [earlier, 'zeta'],
        [later, 'alpha'],
      ]);
    for (const token of [ian.token, tom.token])
      expect((await api.call('GET', `/listings/${id}/calendar-conflicts`, token)).status).toBe(404);
  }, 90000);

  it('sends the notice until it is accepted, the same body, never lost to a crash, once with two servers, whatever the host turned off', async () => {
    const notices = notificationService(0);
    services.push(notices);
    notices.state.accepting = false;
    const shared = database('import-conflicts-notices');
    const environment = { JOBS_INTERVAL_SECONDS: '1', NOTIFY_URL: await notices.url() };
    let first = await start(shared.path, environment);
    let second = await start(shared.path, environment);
    try {
      let there = client(first.port);
      const hal = await there.host('hal4@import-conflicts.test');
      const tom = await there.traveller('tom4@import-conflicts.test');
      await there.done('PUT', '/accounts/me/notices', hal.token, {
        'booking-confirmed': false,
        'booking-requested': false,
        message: false,
      });
      const id = await there.listing(hal.token);
      const bookingId = await there.book(tom.token, await there.quote(tom.token, id, day(10), day(12)));
      outside.serve('four', ics([{ uid: 'n1', from: day(11), to: day(13) }]));
      await link(id, hal.token, [await outside.url('four')], there);
      const conflictAttempts = () => notices.attempts.filter(each => each.body.kind === 'calendar-conflict');
      await eventually(
        async () => conflictAttempts().length,
        count => count >= 2,
        60000,
      );

      // Both servers die while the service refuses; it then accepts, and the notice comes.
      await kill(first);
      await kill(second);
      notices.state.accepting = true;
      first = await start(shared.path, environment);
      second = await start(shared.path, environment);
      there = client(first.port);
      const [notice] = await eventually(
        async () => noticesOf(bookingId, notices),
        found => found.length >= 1,
        60000,
      );
      expect(notice).toMatchObject({ kind: 'calendar-conflict', hostId: hal.id, bookingId, listingId: id, uid: 'n1' });
      await sweeps('four', 4);
      await sleep(2000);
      expect(noticesOf(bookingId, notices)).toHaveLength(1);
      expect(new Set(conflictAttempts().map(each => each.body.id))).toEqual(new Set([notice.id]));
      for (const attempt of conflictAttempts()) expect(attempt.body).toEqual(notice as Json);
      expect(await conflictsOf(id, await there.login(hal.email), there)).toHaveLength(1);
    } finally {
      await stop(first);
      await stop(second);
      shared.remove();
    }
  }, 300000);

  it('lists the conflict all the same without NOTIFY_URL', async () => {
    const quiet = database('import-conflicts-quiet');
    const running = await start(quiet.path, { JOBS_INTERVAL_SECONDS: '1' });
    try {
      const there = client(running.port);
      const hal = await there.host('hal5@import-conflicts.test');
      const tom = await there.traveller('tom5@import-conflicts.test');
      const id = await there.listing(hal.token);
      const bookingId = await there.book(tom.token, await there.quote(tom.token, id, day(10), day(12)));
      outside.serve('five', ics([{ uid: 'q1', from: day(10), to: day(11) }]));
      const url = await outside.url('five');
      await link(id, hal.token, [url], there);
      expect(await conflicts(id, hal.token, 1, there)).toEqual([
        expect.objectContaining({ bookingId, url, uid: 'q1', from: day(10), to: day(11) }),
      ]);
    } finally {
      await stop(running);
      quiet.remove();
    }
  }, 90000);
});
