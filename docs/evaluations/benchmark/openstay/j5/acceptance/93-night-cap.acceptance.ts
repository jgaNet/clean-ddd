import {
  adminEnvironment,
  client,
  Client,
  database,
  day,
  eventually,
  idOf,
  Json,
  Running,
  start,
  stop,
} from './openstay';

/**
 * Request 93: a city's cap on the nights of a listing's confirmed bookings in a calendar year, refusing the
 * booking, the acceptance or the change of dates that would pass it, one of two at once on two servers.
 */
const db = database('night-cap');
const ADMIN = 'ada@night-cap.test';
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

/** Next calendar year, whole within the 730 days ahead a listing below takes (request 17). */
const Y = new Date().getUTCFullYear() + 1;
const date = (month: number, dayOfMonth: number, year = Y) =>
  `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

const capPath = (city: string) => `/admin/cities/${encodeURIComponent(city)}/night-cap`;
const setCap = (city: string, nights: unknown, token = admin.token) => api.act('PUT', capPath(city), token, { nights });
const cap = async (city: string, nights: number | null) => {
  const outcome = await setCap(city, nights);
  if (!outcome.accepted) throw new Error(`the cap of ${city} was refused: ${JSON.stringify(outcome.result)}`);
};
const counted = (listingId: string, token: string, year = Y, through = api) =>
  through.read(`/listings/${listingId}/nights-booked?year=${year}`, token);
/** A published listing in `city` that takes stays up to 730 days ahead. */
const listing = async (token: string, city: string) => {
  const id = await api.listing(token, { city });
  await api.done('PUT', `/listings/${id}/booking-window`, token, { minNoticeDays: 0, maxAdvanceDays: 730 });
  return id;
};
/** A stay asked for: a quote (never refused by the cap), then the booking, followed to its outcome. */
const book = async (token: string, listingId: string, checkIn: string, checkOut: string, through = api) => {
  const quoteId = await through.quote(token, listingId, checkIn, checkOut);
  return through.act('POST', '/bookings', token, { quoteId });
};
const booked = async (token: string, listingId: string, checkIn: string, checkOut: string) => {
  const outcome = await book(token, listingId, checkIn, checkOut);
  if (!outcome.accepted) throw new Error(`the booking was refused: ${JSON.stringify(outcome.result)}`);
  return idOf(outcome.result);
};

describe('a cap on nights per year', () => {
  it('refuses the booking that would pass the cap of its listing, and lets one within it through', async () => {
    const hal = await api.host('hal@night-cap.test');
    const tom = await api.traveller('tom@night-cap.test');
    const id = await listing(hal.token, 'Bruges');
    const other = await listing(hal.token, 'BRUGES');
    expect(await api.read(capPath('Bruges'), admin.token)).toMatchObject({ nights: null });
    expect(await counted(id, hal.token)).toMatchObject({ year: Y, nights: 0, cap: null });

    await cap('bruges', 10);
    expect(await api.read(capPath('Bruges'), admin.token)).toMatchObject({ nights: 10 });
    await booked(tom.token, id, date(3, 1), date(3, 9));
    expect(await counted(id, hal.token)).toMatchObject({ year: Y, nights: 8, cap: 10 });
    // A quote is not refused by the cap; the booking of 3 nights is, and one of 2 is confirmed.
    expect((await book(tom.token, id, date(4, 1), date(4, 4))).accepted).toBe(false);
    const two = await booked(tom.token, id, date(4, 1), date(4, 3));
    expect((await api.read(`/bookings/${two}`, tom.token)).status).toBe('confirmed');
    expect(await counted(id, hal.token)).toMatchObject({ year: Y, nights: 10, cap: 10 });
    expect((await book(tom.token, id, date(5, 1), date(5, 2))).accepted).toBe(false);

    // The cap is per listing.
    await booked(tom.token, other, date(3, 1), date(3, 4));
    expect(await counted(other, hal.token)).toMatchObject({ nights: 3, cap: 10 });

    // Lifted, it refuses nothing.
    await cap('Bruges', null);
    expect(await api.read(capPath('bruges'), admin.token)).toMatchObject({ nights: null });
    await booked(tom.token, id, date(5, 1), date(5, 2));
    expect(await counted(id, hal.token)).toMatchObject({ nights: 11, cap: null });
  }, 90000);

  it('counts each night of a stay in its own year, and only confirmed bookings: a request waits, an acceptance may be refused', async () => {
    const hal = await api.host('hal2@night-cap.test');
    const tom = await api.traveller('tom2@night-cap.test');
    const una = await api.traveller('una2@night-cap.test');
    await cap('Ghent', 3);

    // The coming new year: two nights in one year, one in the next.
    let year = Number(day(1).slice(0, 4));
    if (date(12, 30, year) < day(1)) year += 1;
    const id = await listing(hal.token, 'Ghent');
    await booked(tom.token, id, date(12, 30, year), date(1, 2, year + 1));
    expect(await counted(id, hal.token, year)).toMatchObject({ year, nights: 2, cap: 3 });
    expect(await counted(id, hal.token, year + 1)).toMatchObject({ year: year + 1, nights: 1, cap: 3 });

    // A cancelled booking counts nothing.
    const later = await booked(tom.token, id, date(2, 1, year + 1), date(2, 3, year + 1));
    expect((await book(tom.token, id, date(2, 10, year + 1), date(2, 11, year + 1))).accepted).toBe(false);
    await api.done('POST', `/bookings/${later}/cancel`, tom.token);
    await booked(tom.token, id, date(2, 10, year + 1), date(2, 11, year + 1));
    expect(await counted(id, hal.token, year + 1)).toMatchObject({ nights: 2 });

    // Requests waiting count nothing; the acceptance that would pass the cap is refused, and the request waits.
    const asked = await listing(hal.token, 'Ghent');
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const first = await booked(tom.token, asked, date(3, 1), date(3, 3));
    const second = await booked(una.token, asked, date(3, 10), date(3, 12));
    expect(await counted(asked, hal.token)).toMatchObject({ nights: 0, cap: 3 });
    await api.done('POST', `/bookings/${first}/accept`, hal.token);
    expect(await api.refused('POST', `/bookings/${second}/accept`, hal.token)).toBe(true);
    expect((await api.read(`/bookings/${second}`, una.token)).status).toBe('requested');
    expect(await counted(asked, hal.token)).toMatchObject({ nights: 2, cap: 3 });
    await api.done('POST', `/bookings/${second}/decline`, hal.token);
    const third = await booked(una.token, asked, date(3, 20), date(3, 21));
    await api.done('POST', `/bookings/${third}/accept`, hal.token);
    expect(await counted(asked, hal.token)).toMatchObject({ nights: 3, cap: 3 });
  }, 90000);

  it("refuses a change of dates past the cap, the booking's own nights not counted, and undoes nothing", async () => {
    const hal = await api.host('hal3@night-cap.test');
    const tom = await api.traveller('tom3@night-cap.test');
    await cap('Namur', 5);
    const id = await listing(hal.token, 'Namur');
    const bookingId = await booked(tom.token, id, date(6, 1), date(6, 5));
    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, {
      checkIn: date(6, 1),
      checkOut: date(6, 6),
    });
    expect(
      await api.refused('POST', `/bookings/${bookingId}/change-dates`, tom.token, {
        checkIn: date(6, 1),
        checkOut: date(6, 7),
      }),
    ).toBe(true);
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({
      status: 'confirmed',
      checkIn: date(6, 1),
      checkOut: date(6, 6),
    });
    expect(await counted(id, hal.token)).toMatchObject({ nights: 5, cap: 5 });

    // A cap set lower afterwards leaves the booking confirmed, and refuses what comes after it.
    await cap('Namur', 3);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).status).toBe('confirmed');
    expect(await counted(id, hal.token)).toMatchObject({ nights: 5, cap: 3 });
    expect((await book(tom.token, id, date(7, 1), date(7, 2))).accepted).toBe(false);
  }, 90000);

  it('confirms one of two bookings at once that would pass the cap together, on one server and on two', async () => {
    const hal = await api.host('hal4@night-cap.test');
    const tom = await api.traveller('tom4@night-cap.test');
    const una = await api.traveller('una4@night-cap.test');
    await cap('Liege', 3);

    const one = await listing(hal.token, 'Liege');
    const quotes = [
      await api.quote(tom.token, one, date(8, 1), date(8, 3)),
      await api.quote(una.token, one, date(8, 10), date(8, 12)),
    ];
    const outcomes = await Promise.all([
      api.act('POST', '/bookings', tom.token, { quoteId: quotes[0] }),
      api.act('POST', '/bookings', una.token, { quoteId: quotes[1] }),
    ]);
    expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
    expect(await counted(one, hal.token)).toMatchObject({ nights: 2, cap: 3 });

    const two = await listing(hal.token, 'Liege');
    const second = await start(db.path, adminEnvironment(ADMIN));
    try {
      const other = client(second.port);
      const unaThere = await other.login(una.email);
      const quoted = [
        await api.quote(tom.token, two, date(9, 1), date(9, 3)),
        await other.quote(unaThere, two, date(9, 10), date(9, 12)),
      ];
      const sent = await Promise.all([
        api.act('POST', '/bookings', tom.token, { quoteId: quoted[0] }),
        other.act('POST', '/bookings', unaThere, { quoteId: quoted[1] }),
      ]);
      expect(sent.filter(outcome => outcome.accepted)).toHaveLength(1);
      const confirmed = await eventually(
        async () =>
          (await api.list(`/listings/${two}/bookings`, hal.token)).filter(each => each.status === 'confirmed'),
        found => found.length >= 1,
      );
      expect(confirmed).toHaveLength(1);
      expect(await counted(two, await other.login(hal.email), Y, other)).toMatchObject({ nights: 2, cap: 3 });
    } finally {
      await stop(second);
    }
  }, 120000);

  it('is set by administrators only, read by the host side, and written in the audit log', async () => {
    const hal = await api.host('hal5@night-cap.test');
    const mia = await api.host('mia5@night-cap.test');
    const val = await api.host('val5@night-cap.test');
    const ian = await api.host('ian5@night-cap.test');
    const tom = await api.traveller('tom5@night-cap.test');
    for (const token of [tom.token, hal.token]) {
      expect(await api.refused('PUT', capPath('Mons'), token, { nights: 10 })).toBe(true);
      expect((await api.call('GET', capPath('Mons'), token)).status).toBe(403);
    }
    for (const nights of [0, 366, '10']) expect((await setCap('Mons', nights)).accepted).toBe(false);
    expect(await api.read(capPath('Mons'), admin.token)).toMatchObject({ nights: null });

    await cap('Mons', 365);
    await cap('MONS', 1);
    await cap('mons', null);
    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=mons', admin.token),
      found => found.length >= 3,
    );
    expect(entries).toEqual(
      Array.from({ length: 3 }, () =>
        expect.objectContaining({ adminId: admin.id, action: 'city-night-cap-set', subjectId: 'mons', note: null }),
      ),
    );

    await cap('Mons', 30);
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const id = await listing(hal.token, 'Mons');
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });
    await booked(tom.token, id, date(10, 1), date(10, 4));
    for (const token of [hal.token, mia.token, val.token])
      expect(await counted(id, token)).toMatchObject({ year: Y, nights: 3, cap: 30 });
    for (const token of [ian.token, tom.token])
      expect(await api.hidden(`/listings/${id}/nights-booked?year=${Y}`, token)).toBe(true);
  }, 90000);
});
