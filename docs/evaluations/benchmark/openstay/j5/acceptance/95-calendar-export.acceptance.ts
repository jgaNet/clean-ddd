import {
  clock,
  client,
  Client,
  database,
  day,
  ExportedEvent,
  parseCalendar,
  restart,
  Running,
  start,
  stop,
} from './openstay';

/**
 * Request 95: a listing's calendar at a secret address, read without signing in by the other sites a host lets
 * on: the booked stays and the host's blocked runs, nothing private, the same address on every server until
 * the host replaces it.
 */
const db = database('calendar-export');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const ADDRESS = /^\/v1\/calendars\/([A-Za-z0-9]{32,})\.ics$/;
const linkOf = async (listingId: string, token: string, through = api) =>
  String((await through.read(`/listings/${listingId}/calendar-link`, token)).url);
/** The file at `url`, read without signing in, and what it holds. */
const exported = async (url: string, through = api) => {
  const file = await through.download(url);
  expect(file.status).toBe(200);
  expect(file.type).toMatch(/^text\/calendar/);
  const text = file.bytes.toString('utf8');
  return { text, ...parseCalendar(text) };
};
const summary = (events: ExportedEvent[]) =>
  events.map(each => [each.summary, each.from, each.to]).sort((a, b) => String(a).localeCompare(String(b)));

describe('calendar export', () => {
  it('gives the host a secret address whose file holds the booked stays and blocked runs, and nothing private', async () => {
    const hal = await api.host('hal@calendar-export.test');
    const tom = await api.traveller('tom@calendar-export.test');
    const una = await api.traveller('una@calendar-export.test');
    const id = await api.listing(hal.token, { title: 'Secret Garden Hideaway', nightlyPrice: 98765 });
    const url = await linkOf(id, hal.token);
    expect(url).toMatch(ADDRESS);
    // A short id (a small number) is found by chance in any random secret: the check holds for ids of 8 or more.
    if (id.length >= 8) expect(url.match(ADDRESS)![1]).not.toContain(id);
    expect(await linkOf(id, hal.token)).toBe(url);

    // A confirmed booking and a waiting request hold their nights; a cancelled booking, a declined request
    // and a hold do not show.
    await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    const cancelled = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(31)));
    await api.done('POST', `/bookings/${cancelled}/cancel`, tom.token);
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    await api.book(una.token, await api.quote(una.token, id, day(20), day(22)));
    const declined = await api.book(una.token, await api.quote(una.token, id, day(32), day(33)));
    await api.done('POST', `/bookings/${declined}/decline`, hal.token);
    await api.create('/holds', una.token, { listingId: id, checkIn: day(40), checkOut: day(41), guests: 1 });
    // Two adjacent blocks are one run; a night freed in the middle splits it.
    await api.done('POST', `/listings/${id}/block`, hal.token, { from: day(50), to: day(53) });
    await api.done('POST', `/listings/${id}/block`, hal.token, { from: day(53), to: day(55) });
    await api.done('POST', `/listings/${id}/unblock`, hal.token, { from: day(51), to: day(52) });
    await api.done('POST', '/hosts/me/block', hal.token, { listingIds: [id], from: day(60), to: day(61) });

    const file = await exported(url);
    expect(file.crlf).toBe(true);
    expect(file.lines[0]).toBe('BEGIN:VCALENDAR');
    expect(file.lines[file.lines.length - 1]).toBe('END:VCALENDAR');
    const firstEvent = file.lines.indexOf('BEGIN:VEVENT');
    for (const line of ['VERSION:2.0', 'PRODID:-//OpenStay//Calendar//EN']) {
      expect(file.lines.indexOf(line)).toBeGreaterThan(0);
      expect(file.lines.indexOf(line)).toBeLessThan(firstEvent);
    }
    expect(summary(file.events)).toEqual(
      summary([
        { summary: 'Booked', from: day(10), to: day(12) },
        { summary: 'Booked', from: day(20), to: day(22) },
        { summary: 'Blocked', from: day(50), to: day(51) },
        { summary: 'Blocked', from: day(52), to: day(55) },
        { summary: 'Blocked', from: day(60), to: day(61) },
      ] as ExportedEvent[]),
    );
    for (const event of file.events) {
      expect(event.uid).toEqual(expect.any(String));
      expect(event.uid!.length).toBeGreaterThan(0);
      expect(event.dtstamp).toMatch(/^\d{8}T\d{6}Z$/);
    }
    expect(new Set(file.events.map(each => each.uid)).size).toBe(file.events.length);

    for (const secret of [tom.email, una.email, hal.email, 'Secret Garden', '98765', String(2 * 98765 + 2000)])
      expect(file.text).not.toContain(secret);
  }, 90000);

  it("keeps a booking's UID when its dates change, and moves its dates", async () => {
    const hal = await api.host('hal2@calendar-export.test');
    const tom = await api.traveller('tom2@calendar-export.test');
    const id = await api.listing(hal.token);
    const url = await linkOf(id, hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    const [before] = (await exported(url)).events;
    expect(before).toMatchObject({ summary: 'Booked', from: day(10), to: day(12) });
    expect((await exported(url)).events.map(each => each.uid)).toEqual([before.uid]);

    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, { checkIn: day(11), checkOut: day(14) });
    expect((await exported(url)).events).toEqual([
      expect.objectContaining({ uid: before.uid, summary: 'Booked', from: day(11), to: day(14) }),
    ]);

    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    expect((await exported(url)).events).toEqual([]);
  }, 60000);

  it('keeps the address across a restart and on every server, and replaces it at once everywhere', async () => {
    const hal = await api.host('hal3@calendar-export.test');
    const id = await api.listing(hal.token);
    await api.done('POST', `/listings/${id}/block`, hal.token, { from: day(5), to: day(7) });
    const second = await start(db.path);
    try {
      const other = client(second.port);
      // Read for the first time on two servers at once: one address.
      const [here, there] = await Promise.all([linkOf(id, hal.token), linkOf(id, await other.login(hal.email), other)]);
      expect(here).toMatch(ADDRESS);
      expect(there).toBe(here);

      server = await restart(server, db.path);
      api = client(server.port);
      const token = await api.login(hal.email);
      expect(await linkOf(id, token)).toBe(here);
      expect(summary((await exported(here, other)).events)).toEqual([['Blocked', day(5), day(7)]]);

      const rotated = await api.act('POST', `/listings/${id}/calendar-link/rotate`, token);
      expect(rotated.accepted).toBe(true);
      const fresh = await linkOf(id, token);
      expect(fresh).toMatch(ADDRESS);
      expect(fresh).not.toBe(here);
      const answered = (rotated.result as { url?: unknown } | undefined)?.url;
      if (answered !== undefined) expect(answered).toBe(fresh);
      for (const through of [api, other]) {
        expect((await through.download(here)).status).toBe(404);
        expect(summary((await exported(fresh, through)).events)).toEqual([['Blocked', day(5), day(7)]]);
      }
      expect(await linkOf(id, await other.login(hal.email), other)).toBe(fresh);
      expect((await api.download('/v1/calendars/not0a0secret0of0any0listing0at0all0.ics')).status).toBe(404);
    } finally {
      await stop(second);
    }
  }, 120000);

  it("lets the host and the organisation's managers read and replace the address, and nobody else", async () => {
    const hal = await api.host('hal4@calendar-export.test');
    const mia = await api.host('mia4@calendar-export.test');
    const val = await api.host('val4@calendar-export.test');
    const ian = await api.host('ian4@calendar-export.test');
    const tom = await api.traveller('tom4@calendar-export.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const id = await api.listing(hal.token);
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });

    const url = await linkOf(id, hal.token);
    expect(await linkOf(id, mia.token)).toBe(url);
    for (const token of [val.token, ian.token, tom.token]) {
      expect((await api.call('GET', `/listings/${id}/calendar-link`, token)).status).toBe(404);
      expect(await api.refused('POST', `/listings/${id}/calendar-link/rotate`, token)).toBe(true);
    }
    expect(await linkOf(id, hal.token)).toBe(url);
    await api.done('POST', `/listings/${id}/calendar-link/rotate`, mia.token);
    const fresh = await linkOf(id, hal.token);
    expect(fresh).not.toBe(url);
    expect((await api.download(url)).status).toBe(404);
    expect((await api.download(fresh)).status).toBe(200);
  }, 60000);

  it("leaves out a blocked run whose last night is before today, today moved by CLOCK_OFFSET_DAYS", async () => {
    const moved = database('calendar-export-clock');
    let running = await start(moved.path);
    try {
      let there = client(running.port);
      const hal = await there.host('hal5@calendar-export.test');
      const id = await there.listing(hal.token);
      await there.done('POST', `/listings/${id}/block`, hal.token, { from: day(1), to: day(3) });
      await there.done('POST', `/listings/${id}/block`, hal.token, { from: day(10), to: day(12) });
      const url = await linkOf(id, hal.token, there);
      expect(summary((await exported(url, there)).events)).toEqual([
        ['Blocked', day(1), day(3)],
        ['Blocked', day(10), day(12)],
      ]);
      running = await restart(running, moved.path, clock(3));
      there = client(running.port);
      expect(summary((await exported(url, there)).events)).toEqual([['Blocked', day(10), day(12)]]);
    } finally {
      await stop(running);
      moved.remove();
    }
  }, 90000);
});
