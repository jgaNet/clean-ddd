import {
  calendarServer,
  client,
  Client,
  database,
  day,
  eventually,
  ics,
  parseCalendar,
  Running,
  sleep,
  start,
  stop,
} from './openstay';

/**
 * Request 96: outside calendars linked to a listing, fetched at each sweep, whose events block their nights
 * as the host's blocks do, follow the outside calendar as it changes, and leave the host's own blocks, the
 * bookings and the holds alone.
 */
const db = database('calendar-import');
const outside = calendarServer();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { JOBS_INTERVAL_SECONDS: '1' });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await outside.close();
  db.remove();
});

const compact = (date: string) => date.replaceAll('-', '');
/** `calendar` with events written by hand added: what request 96 says is ignored. */
const withRaw = (calendar: string, ...events: string[][]) =>
  calendar.replace(
    'END:VCALENDAR\r\n',
    [...events.flatMap(lines => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n'),
  );
const link = (listingId: string, token: string, urls: string[]) =>
  api.done('PUT', `/listings/${listingId}/imported-calendars`, token, { urls });
/** Each night from `from` to the night before `to`, as `[date, available, source]`. */
const nights = async (listingId: string, from: number, to: number, through = api) =>
  (await through.list(`/listings/${listingId}/calendar?from=${day(from)}&to=${day(to)}`)).map(each => [
    each.date,
    each.available,
    each.source,
  ]);
const free = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, n) => [day(from + n), true, null] as unknown[]);
const imported = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, n) => [day(from + n), false, 'import'] as unknown[]);
/** Reads the nights until they are `expected`, across sweeps. */
const until = (listingId: string, from: number, to: number, expected: unknown[][], through = api) =>
  eventually(
    () => nights(listingId, from, to, through),
    found => JSON.stringify(found) === JSON.stringify(expected),
    20000,
  );
/** Waits until `name` was fetched `count` more times. */
const fetchedAgain = async (name: string, count: number) => {
  const target = outside.fetchesOf(name) + count;
  await eventually(
    async () => outside.fetchesOf(name),
    fetches => fetches >= target,
    30000,
  );
};
const listed = (listingId: string, token: string) => api.list(`/listings/${listingId}/imported-calendars`, token);

describe('calendar import', () => {
  it('links up to ten addresses, given by the host side and read with when each was fetched', async () => {
    const hal = await api.host('hal@calendar-import.test');
    const mia = await api.host('mia@calendar-import.test');
    const val = await api.host('val@calendar-import.test');
    const ian = await api.host('ian@calendar-import.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const id = await api.listing(hal.token);
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });
    outside.serve('links-ok', ics([]));
    const ok = await outside.url('links-ok');
    const missing = await outside.url('links-missing');
    const path = `/listings/${id}/imported-calendars`;

    expect(
      await api.refused('PUT', path, hal.token, { urls: Array.from({ length: 11 }, (_, n) => `${ok}?${n}`) }),
    ).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { urls: ['ftp://elsewhere.test/calendar.ics'] })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { urls: ['not an address'] })).toBe(true);
    expect(await api.refused('PUT', path, val.token, { urls: [ok] })).toBe(true);
    expect(await api.refused('PUT', path, ian.token, { urls: [ok] })).toBe(true);
    expect(await listed(id, hal.token)).toEqual([]);

    await link(
      id,
      hal.token,
      Array.from({ length: 10 }, (_, n) => `${ok}?${n}`),
    );
    expect((await listed(id, val.token)).map(each => each.url)).toEqual(
      Array.from({ length: 10 }, (_, n) => `${ok}?${n}`),
    );
    // Given again, the list is replaced, in the order given.
    await link(id, mia.token, [missing, ok]);
    expect((await listed(id, hal.token)).map(each => each.url)).toEqual([missing, ok]);
    expect(await api.hidden(path, ian.token)).toBe(true);

    const fetched = await eventually(
      () => listed(id, mia.token),
      found => found.every(each => each.lastAttemptAt !== null) && found[1]?.lastSyncAt !== null,
      20000,
    );
    expect(fetched).toEqual([
      expect.objectContaining({ url: missing, lastAttemptAt: expect.any(String), lastSyncAt: null }),
      expect.objectContaining({ url: ok, lastAttemptAt: expect.any(String), lastSyncAt: expect.any(String) }),
    ]);
  }, 90000);

  it("blocks each event's nights at the next sweep, as the host's blocks do, and ignores what it cannot read", async () => {
    const hal = await api.host('hal2@calendar-import.test');
    const tom = await api.traveller('tom2@calendar-import.test');
    const id = await api.listing(hal.token, { city: 'Quimper' });
    const quoteBefore = await api.quote(tom.token, id, day(12), day(13));
    outside.serve(
      'blocks',
      withRaw(
        ics([
          { uid: 'stay-1@elsewhere', from: day(10), to: day(13) },
          { uid: 'stay-2@elsewhere', from: day(20) },
          { from: day(30), to: day(32) },
          { uid: 'backwards@elsewhere', from: day(36), to: day(36) },
        ]),
        ['UID:timed@elsewhere', `DTSTART:${compact(day(34))}T120000Z`, `DTEND:${compact(day(35))}T120000Z`],
      ),
    );
    outside.serve('blocks-lf', ics([{ uid: 'stay-3@elsewhere', from: day(40), to: day(41) }], '\n'));
    await link(id, hal.token, [await outside.url('blocks'), await outside.url('blocks-lf')]);

    await until(id, 10, 14, [...imported(10, 13), ...free(13, 14)]);
    expect(await nights(id, 20, 22)).toEqual([...imported(20, 21), ...free(21, 22)]);
    expect(await nights(id, 30, 37)).toEqual(free(30, 37));
    await until(id, 40, 41, imported(40, 41));

    expect(
      await api.refused('POST', '/quotes', tom.token, {
        listingId: id,
        checkIn: day(11),
        checkOut: day(12),
        guests: 1,
      }),
    ).toBe(true);
    expect(await api.refused('POST', '/bookings', tom.token, { quoteId: quoteBefore })).toBe(true);
    expect(
      await api.refused('POST', '/holds', tom.token, { listingId: id, checkIn: day(20), checkOut: day(21), guests: 1 }),
    ).toBe(true);
    const search = (checkIn: number, checkOut: number) =>
      api.list(`/listings?city=Quimper&checkIn=${day(checkIn)}&checkOut=${day(checkOut)}`);
    expect((await search(11, 12)).map(each => each.id)).toEqual([]);
    expect((await search(13, 14)).map(each => each.id)).toEqual([id]);

    // Not exported again: the nights belong to the other site (request 95).
    const { url } = await api.read(`/listings/${id}/calendar-link`, hal.token);
    expect(parseCalendar((await api.download(String(url))).bytes.toString('utf8')).events).toEqual([]);
  }, 90000);

  it('follows the outside calendar: a moved event, a removed one, a night another still blocks, an address unlinked', async () => {
    const hal = await api.host('hal3@calendar-import.test');
    const id = await api.listing(hal.token);
    outside.serve(
      'follow-a',
      ics([
        { uid: 'a1', from: day(10), to: day(12) },
        { uid: 'a2', from: day(20), to: day(22) },
      ]),
    );
    outside.serve('follow-b', ics([{ uid: 'b1', from: day(21), to: day(23) }]));
    const [a, b] = [await outside.url('follow-a'), await outside.url('follow-b')];
    await link(id, hal.token, [a, b]);
    await until(id, 10, 23, [...imported(10, 12), ...free(12, 20), ...imported(20, 23)]);

    outside.serve('follow-a', ics([{ uid: 'a1', from: day(14), to: day(15) }]));
    await until(id, 10, 23, [...free(10, 14), ...imported(14, 15), ...free(15, 21), ...imported(21, 23)]);

    // Unlinked: the nights only its events blocked are free at once.
    await link(id, hal.token, [a]);
    expect(await nights(id, 10, 23)).toEqual([...free(10, 14), ...imported(14, 15), ...free(15, 23)]);
  }, 90000);

  it('changes nothing when a fetch fails, answers no calendar or takes too long, and fetches again at the next sweep', async () => {
    const hal = await api.host('hal4@calendar-import.test');
    const id = await api.listing(hal.token);
    const blocked = [...imported(10, 12), ...free(12, 13)];
    outside.serve('flaky', ics([{ uid: 'f1', from: day(10), to: day(12) }]));
    await link(id, hal.token, [await outside.url('flaky')]);
    await until(id, 10, 13, blocked);
    const synced = await eventually(
      () => listed(id, hal.token),
      found => found[0]?.lastSyncAt !== null,
    );
    const lastSync = synced[0].lastSyncAt;

    outside.serve('flaky', ics([]), { status: 500 });
    await fetchedAgain('flaky', 2);
    expect(await nights(id, 10, 13)).toEqual(blocked);
    outside.serve('flaky', '<html><body>Not a calendar</body></html>', { contentType: 'text/html' });
    await fetchedAgain('flaky', 2);
    expect(await nights(id, 10, 13)).toEqual(blocked);
    outside.serve('flaky', ics([]), { delayMs: 15000 });
    await fetchedAgain('flaky', 1);
    await sleep(12000);
    expect(await nights(id, 10, 13)).toEqual(blocked);
    const after = (await listed(id, hal.token))[0];
    expect(after.lastSyncAt).toBe(lastSync);
    expect(Date.parse(String(after.lastAttemptAt))).toBeGreaterThan(Date.parse(String(lastSync)));

    outside.serve('flaky', ics([]));
    await until(id, 10, 13, free(10, 13));
  }, 120000);

  it("leaves the host's own blocks apart, and takes nothing from a booking or a hold", async () => {
    const hal = await api.host('hal5@calendar-import.test');
    const tom = await api.traveller('tom5@calendar-import.test');
    const una = await api.traveller('una5@calendar-import.test');
    const id = await api.listing(hal.token);
    await api.done('POST', `/listings/${id}/block`, hal.token, { from: day(30), to: day(31) });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    await api.create('/holds', una.token, { listingId: id, checkIn: day(20), checkOut: day(22), guests: 1 });
    outside.serve(
      'apart',
      ics([
        { uid: 'over-booking', from: day(10), to: day(13) },
        { uid: 'over-hold', from: day(20), to: day(23) },
        { uid: 'over-block', from: day(30), to: day(32) },
      ]),
    );
    await link(id, hal.token, [await outside.url('apart')]);
    await until(id, 31, 32, imported(31, 32));
    await until(id, 12, 13, imported(12, 13));
    await until(id, 22, 23, imported(22, 23));

    // The booking stays as it was; the hold's traveller books the held nights.
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({
      status: 'confirmed',
      checkIn: day(10),
      checkOut: day(12),
    });
    await api.book(una.token, await api.quote(una.token, id, day(20), day(22)));

    // The host's unblock frees only the host's own blocks; an event never frees a night the host blocked.
    await api.done('POST', `/listings/${id}/unblock`, hal.token, { from: day(31), to: day(32) });
    expect(await nights(id, 31, 32)).toEqual(imported(31, 32));
    outside.serve('apart', ics([]));
    await until(id, 31, 32, free(31, 32));
    expect((await nights(id, 30, 31))[0][1]).toBe(false);
  }, 90000);

  it('gives with two servers the outcome one server gives', async () => {
    const hal = await api.host('hal6@calendar-import.test');
    const id = await api.listing(hal.token);
    const second = await start(db.path, { JOBS_INTERVAL_SECONDS: '1' });
    try {
      const other = client(second.port);
      outside.serve('both', ics([{ uid: 'b1', from: day(10), to: day(12) }]));
      await link(id, hal.token, [await outside.url('both')]);
      const expected = [...imported(10, 12), ...free(12, 13)];
      await until(id, 10, 13, expected);
      await until(id, 10, 13, expected, other);
      outside.serve('both', ics([{ uid: 'b1', from: day(11), to: day(13) }]));
      const moved = [...free(10, 11), ...imported(11, 13)];
      await until(id, 10, 13, moved);
      await fetchedAgain('both', 4);
      expect(await nights(id, 10, 13)).toEqual(moved);
      expect(await nights(id, 10, 13, other)).toEqual(moved);
      outside.serve('both', ics([]));
      await until(id, 10, 13, free(10, 13), other);
      await fetchedAgain('both', 4);
      expect(await nights(id, 10, 13)).toEqual(free(10, 13));
    } finally {
      await stop(second);
    }
  }, 120000);
});
