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

/**
 * Request 68: a traveller cancelling more than 3 bookings in 24 hours, or sending the same first message
 * to more than 5 hosts in an hour, is flagged for the administrators, once a day per kind, even at the
 * same moment on two servers; a flag changes nothing else.
 */
const db = database('suspicious-accounts');
const environment = { JOBS_INTERVAL_SECONDS: '1', ...adminEnvironment('ada@flags.test') };
let server: Running;
let other: Running;
let api: Client;
let otherApi: Client;
type Person = { id: string; email: string; token: string };
let ada: Person;
let hal: Person;
let tom: Person;
let listingId: string;
beforeAll(async () => {
  server = await start(db.path, environment);
  other = await start(db.path, environment);
  api = client(server.port);
  otherApi = client(other.port);
  ada = await api.admin('ada@flags.test');
  hal = await api.host('hal@flags.test');
  tom = await api.traveller('tom@flags.test');
  listingId = await api.listing(hal.token, { city: 'Flagville' });
}, 60000);
afterAll(async () => {
  await stop(server);
  await stop(other);
  db.remove();
});

const flags = () => api.list('/admin/flags', ada.token);
const flagsOf = async (accountId: string, kind?: string) =>
  (await flags()).filter(each => each.accountId === accountId && (kind === undefined || each.kind === kind));
/** `count` confirmed bookings of one night each, on nights from `from` days ahead, every other day. */
async function bookings(person: Person, count: number, from: number) {
  const ids: string[] = [];
  for (let n = 0; n < count; n++)
    ids.push(
      await api.book(person.token, await api.quote(person.token, listingId, day(from + 2 * n), day(from + 2 * n + 1))),
    );
  return ids;
}
const cancel = (bookingId: string, token: string, on = api) => on.done('POST', `/bookings/${bookingId}/cancel`, token);
/** Hosts of a listing each, to write to. */
async function hosts(prefix: string, count: number) {
  const listings: string[] = [];
  for (let n = 0; n < count; n++) {
    const host = await api.host(`${prefix}${n}@flags.test`);
    listings.push(await api.listing(host.token, { city: 'Flagville' }));
  }
  return listings;
}
/** Whether `at` falls between two instants of the machine's clock, moved `days` ahead. */
const within = (at: unknown, from: number, to: number, days = 0) => {
  const time = Date.parse(String(at)) - days * 86_400_000;
  return time >= from - 1000 && time <= to + 1000;
};

describe('suspicious accounts', () => {
  it('answers 403 to anyone but an administrator', async () => {
    for (const person of [tom, hal]) expect((await api.call('GET', '/admin/flags', person.token)).status).toBe(403);
    expect(await flags()).toEqual(expect.any(Array));
  }, 60000);

  it('flags a traveller at the fourth cancellation in 24 hours, not before, and once that day', async () => {
    const [first, second, third, fourth, fifth] = await bookings(tom, 5, 10);
    for (const bookingId of [first, second, third]) await cancel(bookingId, tom.token);
    await sleep(2000);
    expect(await flagsOf(tom.id)).toEqual([]);

    const from = Date.now();
    await cancel(fourth, tom.token);
    const to = Date.now();
    const flagged = await eventually(
      () => flagsOf(tom.id),
      found => found.length > 0,
    );
    expect(flagged).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        accountId: tom.id,
        kind: 'many-cancellations',
        at: expect.any(String),
      }),
    ]);
    expect(within(flagged[0].at, from, to)).toBe(true);

    await cancel(fifth, tom.token);
    await sleep(2000);
    expect(await flagsOf(tom.id)).toHaveLength(1);

    // A flag decides nothing: the account signs in, books and cancels as before.
    const token = await api.login(tom.email);
    expect((await api.read('/accounts/me', token)).id).toBe(tom.id);
    const [again] = await bookings({ ...tom, token }, 1, 40);
    expect(await api.read(`/bookings/${again}`, token)).toMatchObject({ status: 'confirmed' });
    await cancel(again, token);
    expect(await api.read(`/bookings/${again}`, token)).toMatchObject({ status: 'cancelled' });
  }, 90000);

  it('counts only the cancellations a traveller makes, not those of the host', async () => {
    const una = await api.traveller('una@flags.test');
    for (const bookingId of await bookings(una, 4, 50)) await cancel(bookingId, hal.token);
    await sleep(2000);
    expect(await flagsOf(una.id)).toEqual([]);
    expect(await flagsOf(hal.id)).toEqual([]);
  }, 90000);

  it('flags the same first message to a sixth host in an hour, counting hosts and first messages only', async () => {
    const sam = await api.traveller('sam@flags.test');
    const listings = await hosts('host-sam-', 7);
    const host0 = await api.read(`/listings/${listings[0]}`);
    // A second listing of the first host: two listings of one host are one host.
    const sameHost = await api.listing(await api.login('host-sam-0@flags.test'), { city: 'Flagville' });
    expect((await api.read(`/listings/${sameHost}`)).hostId).toBe(host0.hostId);

    const text = 'Hello! Is the place free next weekend?';
    for (const id of [listings[0], sameHost, listings[1], listings[2], listings[3], listings[4]])
      await api.create('/conversations', sam.token, { listingId: id, text });
    // Written again to a conversation that exists, and another text to a sixth host: neither counts.
    await api.create('/conversations', sam.token, { listingId: listings[1], text });
    await api.create('/conversations', sam.token, { listingId: listings[5], text: `${text} Thanks.` });
    await api.create('/conversations', sam.token, { listingId: listings[5], text });
    await sleep(2000);
    expect(await flagsOf(sam.id)).toEqual([]);

    const from = Date.now();
    await api.create('/conversations', sam.token, { listingId: listings[6], text });
    const to = Date.now();
    const flagged = await eventually(
      () => flagsOf(sam.id),
      found => found.length > 0,
    );
    expect(flagged).toEqual([expect.objectContaining({ accountId: sam.id, kind: 'same-message' })]);
    expect(within(flagged[0].at, from, to)).toBe(true);
    // Flagged, the account writes as before.
    const listing7 = await hosts('host-sam-late-', 1);
    expect(await api.create('/conversations', sam.token, { listingId: listing7[0], text })).toEqual(expect.any(String));
    await sleep(2000);
    expect(await flagsOf(sam.id)).toHaveLength(1);
  }, 120000);

  it('raises one flag of each kind for cancellations or messages sent at the same moment to two servers', async () => {
    // A token is used on the server that gave it: each traveller signs in on the second server too.
    const vic = await api.traveller('vic@flags.test');
    const vicThere = await otherApi.login(vic.email);
    const booked = await bookings(vic, 6, 70);
    const cancelled = await Promise.all(
      booked.map((bookingId, n) =>
        n % 2
          ? otherApi.act('POST', `/bookings/${bookingId}/cancel`, vicThere)
          : api.act('POST', `/bookings/${bookingId}/cancel`, vic.token),
      ),
    );
    // The request promises one flag, not that every one of them is taken at once: one refused is sent again.
    for (const [n, outcome] of cancelled.entries()) if (!outcome.accepted) await cancel(booked[n], vic.token);

    const wes = await api.traveller('wes@flags.test');
    const wesThere = await otherApi.login(wes.email);
    const listings = await hosts('host-wes-', 8);
    const message = { text: 'Free in May? We are four.' };
    const written = await Promise.all(
      listings.map((id, n) =>
        n % 2
          ? otherApi.act('POST', '/conversations', wesThere, { listingId: id, ...message })
          : api.act('POST', '/conversations', wes.token, { listingId: id, ...message }),
      ),
    );
    for (const [n, outcome] of written.entries())
      if (!outcome.accepted) await api.create('/conversations', wes.token, { listingId: listings[n], ...message });

    await eventually(
      async () => [...(await flagsOf(vic.id)), ...(await flagsOf(wes.id))],
      found => found.length >= 2,
    );
    await sleep(3000);
    expect(await flagsOf(vic.id)).toEqual([expect.objectContaining({ kind: 'many-cancellations' })]);
    expect(await flagsOf(wes.id)).toEqual([expect.objectContaining({ kind: 'same-message' })]);
  }, 120000);

  it('lists every flag, the newest first', async () => {
    const found = await flags();
    expect(found.length).toBeGreaterThanOrEqual(4);
    const times = found.map(each => Date.parse(String((each as Json).at)));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  }, 60000);

  it('flags the same behaviour again the next day', async () => {
    await stop(other);
    server = await restart(server, db.path, { ...environment, ...clock(1) });
    other = await start(db.path, { ...environment, ...clock(1) });
    api = client(server.port);
    otherApi = client(other.port);
    ada.token = await api.login(ada.email);
    tom.token = await api.login(tom.email);

    const booked = await bookings(tom, 4, 90);
    for (const bookingId of booked.slice(0, 3)) await cancel(bookingId, tom.token);
    const from = Date.now();
    await cancel(booked[3], tom.token);
    const to = Date.now();
    const flagged = await eventually(
      () => flagsOf(tom.id, 'many-cancellations'),
      found => found.length >= 2,
    );
    expect(flagged).toHaveLength(2);
    expect(String(flagged[0].at).slice(0, 10)).toBe(day(1));
    expect(within(flagged[0].at, from, to, 1)).toBe(true);
    expect(String(flagged[1].at).slice(0, 10)).toBe(day(0));
  }, 120000);
});
