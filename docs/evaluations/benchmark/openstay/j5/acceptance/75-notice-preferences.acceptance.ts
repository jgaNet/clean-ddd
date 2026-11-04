import {
  client,
  Client,
  database,
  day,
  eventually,
  kill,
  notificationService,
  Running,
  sleep,
  start,
  stop,
} from './openstay';

/**
 * Request 75: each account turns its notices of bookings and messages off and on; a notice of a kind
 * turned off when it arises is never sent, and a notice of a kind on is sent as before. The kinds
 * about money and safety cannot be turned off. The notices are request 10's, 55's, 66's and 76's.
 */
const db = database('notice-preferences');
const service = notificationService(0);
let url: string;
let server: Running;
let api: Client;
beforeAll(async () => {
  url = await service.url();
  server = await start(db.path, { NOTIFY_URL: url });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await service.close();
  db.remove();
});

const PATH = '/accounts/me/notices';
const DEFAULTS = {
  'booking-confirmed': true,
  'booking-requested': true,
  message: true,
  'booking-cancelled': true,
  'email-verification': true,
};
const noticesOf = (key: string, value: string) => service.notices().filter(notice => notice[key] === value);
/** Books one night `from` days from today on `listingId`, as `token`. */
const booked = async (token: string, listingId: string, from: number) =>
  api.book(token, await api.quote(token, listingId, day(from), day(from + 1)));

describe('notice preferences', () => {
  it('has every kind on until its account turns it off, for the signed-in account only', async () => {
    const tom = await api.traveller('tom@notice-preferences.test');
    expect(await api.read(PATH, tom.token)).toMatchObject(DEFAULTS);
    expect((await api.call('GET', PATH)).status).toBe(401);
    expect(await api.refused('PUT', PATH, undefined, { message: false })).toBe(true);
  }, 60000);

  it('changes only the kinds a change names, and only for the account that makes it', async () => {
    const hal = await api.host('hal@notice-preferences.test');
    const ian = await api.host('ian@notice-preferences.test');
    await api.done('PUT', PATH, hal.token, { message: false });
    expect(await api.read(PATH, hal.token)).toMatchObject({ ...DEFAULTS, message: false });
    await api.done('PUT', PATH, hal.token, { 'booking-requested': false, 'booking-confirmed': false });
    expect(await api.read(PATH, hal.token)).toMatchObject({
      ...DEFAULTS,
      message: false,
      'booking-requested': false,
      'booking-confirmed': false,
    });
    await api.done('PUT', PATH, hal.token, { message: true });
    expect(await api.read(PATH, hal.token)).toMatchObject({
      ...DEFAULTS,
      'booking-requested': false,
      'booking-confirmed': false,
    });
    // Turning on what is on, and saying it of an always-on kind, change nothing.
    await api.done('PUT', PATH, hal.token, { message: true, 'booking-cancelled': true, 'email-verification': true });
    expect(await api.read(PATH, hal.token)).toMatchObject({
      ...DEFAULTS,
      'booking-requested': false,
      'booking-confirmed': false,
    });
    expect(await api.read(PATH, ian.token)).toMatchObject(DEFAULTS);
  }, 60000);

  it('refuses turning off a notice of money or safety, a kind that does not exist, or a value that is not a boolean, and changes nothing then', async () => {
    const una = await api.traveller('una@notice-preferences.test');
    for (const body of [
      { 'booking-cancelled': false },
      { 'email-verification': false },
      { holidays: false },
      { message: 'off' },
      { message: 0 },
      { message: null },
      { message: false, 'booking-cancelled': false },
      { message: false, 'email-verification': false },
      { 'booking-confirmed': false, holidays: true },
      { 'booking-requested': false, message: 'no' },
    ])
      expect(await api.refused('PUT', PATH, una.token, body)).toBe(true);
    expect(await api.read(PATH, una.token)).toMatchObject(DEFAULTS);
  }, 60000);

  it('sends no booking notice of a kind its host turned off, then or later, and sends those that arise once it is on again', async () => {
    const hal = await api.host('hal2@notice-preferences.test');
    const kim = await api.host('kim2@notice-preferences.test');
    const tom = await api.traveller('tom2@notice-preferences.test');
    const instant = await api.listing(hal.token, { city: 'Sète' });
    const asked = await api.listing(hal.token, { city: 'Sète' });
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const control = await api.listing(kim.token, { city: 'Sète' });

    await api.done('PUT', PATH, hal.token, { 'booking-confirmed': false, 'booking-requested': false });
    const silentConfirmed = await booked(tom.token, instant, 10);
    const silentRequested = await booked(tom.token, asked, 10);
    const kims = await booked(tom.token, control, 10);
    await eventually(
      async () => noticesOf('bookingId', kims),
      found => found.length > 0,
    );
    await sleep(3000);
    expect(noticesOf('hostId', hal.id)).toEqual([]);

    await api.done('PUT', PATH, hal.token, { 'booking-confirmed': true });
    const told = await booked(tom.token, instant, 20);
    const stillSilent = await booked(tom.token, asked, 20);
    await eventually(
      async () => noticesOf('bookingId', told),
      found => found.length > 0,
    );
    await sleep(3000);
    expect(noticesOf('hostId', hal.id)).toEqual([
      expect.objectContaining({ kind: 'booking-confirmed', hostId: hal.id, bookingId: told }),
    ]);
    for (const bookingId of [silentConfirmed, silentRequested, stillSilent])
      expect(noticesOf('bookingId', bookingId)).toEqual([]);
    expect(service.attempts.filter(attempt => attempt.body.hostId === hal.id)).toHaveLength(1);

    await api.done('PUT', PATH, hal.token, { 'booking-requested': true });
    const requested = await booked(tom.token, asked, 30);
    expect(
      await eventually(
        async () => noticesOf('bookingId', requested),
        found => found.length > 0,
      ),
    ).toEqual([expect.objectContaining({ kind: 'booking-requested', hostId: hal.id, bookingId: requested })]);
  }, 90000);

  it('sends a message notice turned on again as if the ones not sent had never been, and keeps the other side told', async () => {
    const hal = await api.host('hal3@notice-preferences.test');
    const tom = await api.traveller('tom3@notice-preferences.test');
    const listingId = await api.listing(hal.token, { city: 'Sète' });
    await api.done('PUT', PATH, hal.token, { message: false });

    const conversationId = await api.create('/conversations', tom.token, {
      listingId,
      text: 'Is there a place to leave bicycles?',
    });
    await api.done('POST', `/conversations/${conversationId}/messages`, hal.token, { text: 'Yes, in the courtyard.' });
    // The traveller's kinds are on: told of the host's message.
    const toTom = await eventually(
      async () => noticesOf('accountId', tom.id),
      found => found.length > 0,
    );
    expect(toTom).toEqual([expect.objectContaining({ kind: 'message', accountId: tom.id, conversationId })]);
    await api.done('POST', `/conversations/${conversationId}/messages`, tom.token, { text: 'Thank you, and a lock?' });
    await sleep(3000);
    expect(noticesOf('accountId', hal.id)).toEqual([]);

    // Turned on again, well within the window of request 55 (900 seconds): the next message is told.
    await api.done('PUT', PATH, hal.token, { message: true });
    await api.done('POST', `/conversations/${conversationId}/messages`, tom.token, { text: 'Is a lock provided?' });
    expect(
      await eventually(
        async () => noticesOf('accountId', hal.id),
        found => found.length > 0,
      ),
    ).toEqual([expect.objectContaining({ kind: 'message', accountId: hal.id, conversationId })]);
    await sleep(2000);
    expect(noticesOf('accountId', hal.id)).toHaveLength(1);
  }, 90000);

  it('keeps the preferences across a kill, and never sends later what arose while its kind was off', async () => {
    const hal = await api.host('hal4@notice-preferences.test');
    const kim = await api.host('kim4@notice-preferences.test');
    const tom = await api.traveller('tom4@notice-preferences.test');
    const listingId = await api.listing(hal.token, { city: 'Agde' });
    const control = await api.listing(kim.token, { city: 'Agde' });
    await api.done('PUT', PATH, hal.token, { 'booking-confirmed': false, message: false });
    const silent = await booked(tom.token, listingId, 10);
    await api.done('PUT', PATH, hal.token, { 'booking-confirmed': true });

    await kill(server);
    server = await start(db.path, { NOTIFY_URL: url });
    api = client(server.port);
    const token = await api.login(hal.email);
    expect(await api.read(PATH, token)).toMatchObject({ ...DEFAULTS, message: false });

    const kims = await booked(await api.login(tom.email), control, 10);
    const told = await booked(await api.login(tom.email), listingId, 20);
    await eventually(
      async () => [...noticesOf('bookingId', kims), ...noticesOf('bookingId', told)],
      found => found.length >= 2,
      30000,
    );
    await sleep(3000);
    expect(noticesOf('bookingId', silent)).toEqual([]);
    expect(noticesOf('hostId', hal.id)).toEqual([
      expect.objectContaining({ kind: 'booking-confirmed', bookingId: told }),
    ]);
  }, 120000);
});
