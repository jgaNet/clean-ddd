import { client, Client, database, day, Json, Running, sleep, start, stop } from './openstay';

/** Request 9: a booking's history, and contact details only once a stay is agreed. */
const db = database('history');
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

const steps = (history: Json[]) => history.map(each => [each.status, each.by]);
const inOrder = (history: Json[]) =>
  history.every((each, n) => n === 0 || Date.parse(String(each.at)) >= Date.parse(String(history[n - 1].at)));
const contact = (booking: Json) => (booking.contact as { email?: string } | undefined | null)?.email;

describe("a booking's history", () => {
  it('records a booking confirmed at once by nobody, and a request accepted then cancelled by whoever acted', async () => {
    const hal = await api.host('hal@history.test');
    const tom = await api.traveller('tom@history.test');
    const instant = await api.listing(hal.token, { city: 'Dijon' });
    const asked = await api.listing(hal.token, { city: 'Dijon' });
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });

    const now = await api.book(tom.token, await api.quote(tom.token, instant, day(10), day(12)));
    const history = await api.list(`/bookings/${now}/history`, tom.token);
    expect(steps(history)).toEqual([['confirmed', null]]);
    expect(Date.parse(String(history[0].at))).not.toBeNaN();

    const later = await api.book(tom.token, await api.quote(tom.token, asked, day(10), day(12)));
    await api.done('POST', `/bookings/${later}/accept`, hal.token);
    await api.done('POST', `/bookings/${later}/cancel`, tom.token);
    const lived = await api.list(`/bookings/${later}/history`, hal.token);
    expect(steps(lived)).toEqual([
      ['requested', tom.id],
      ['confirmed', hal.id],
      ['cancelled', tom.id],
    ]);
    expect(inOrder(lived)).toBe(true);
  }, 60000);

  it('records a declined request, and shows it to the traveller and the host only', async () => {
    const hal = await api.host('hal2@history.test');
    const tom = await api.traveller('tom2@history.test');
    const una = await api.traveller('una2@history.test');
    const id = await api.listing(hal.token, { city: 'Dijon' });
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(21)));
    await api.done('POST', `/bookings/${bookingId}/decline`, hal.token);

    expect(steps(await api.list(`/bookings/${bookingId}/history`, tom.token))).toEqual([
      ['requested', tom.id],
      ['declined', hal.id],
    ]);
    expect(await api.hidden(`/bookings/${bookingId}/history`, una.token)).toBe(true);
    expect(await api.hidden(`/bookings/${bookingId}/history`)).toBe(true);
    expect(contact(await api.read(`/bookings/${bookingId}`, hal.token))).toBeUndefined();
    expect(contact(await api.read(`/bookings/${bookingId}`, tom.token))).toBeUndefined();
  }, 60000);

  it("shows each party the other one's email once the booking is confirmed, and not before", async () => {
    const hal = await api.host('hal3@history.test');
    const tom = await api.traveller('tom3@history.test');
    const id = await api.listing(hal.token, { city: 'Beaune' });
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(32)));

    expect(contact(await api.read(`/bookings/${bookingId}`, hal.token))).toBeUndefined();
    expect(contact(await api.read(`/bookings/${bookingId}`, tom.token))).toBeUndefined();
    await api.done('POST', `/bookings/${bookingId}/accept`, hal.token);
    expect(contact(await api.read(`/bookings/${bookingId}`, hal.token))).toBe('tom3@history.test');
    expect(contact(await api.read(`/bookings/${bookingId}`, tom.token))).toBe('hal3@history.test');
    await api.done('POST', `/bookings/${bookingId}/cancel`, hal.token);
    expect(contact(await api.read(`/bookings/${bookingId}`, hal.token))).toBe('tom3@history.test');

    const instant = await api.listing(hal.token, { city: 'Beaune' });
    const now = await api.book(tom.token, await api.quote(tom.token, instant, day(30), day(32)));
    expect(contact(await api.read(`/bookings/${now}`, tom.token))).toBe('hal3@history.test');
  }, 60000);

  it('records an expired request as changed by nobody, and never shows its contact', async () => {
    const expiring = database('history-ttl');
    const short = await start(expiring.path, { BOOKING_REQUEST_TTL_SECONDS: '1' });
    try {
      const quick = client(short.port);
      const hal = await quick.host('hal4@history.test');
      const tom = await quick.traveller('tom4@history.test');
      const id = await quick.listing(hal.token, { city: 'Beaune' });
      await quick.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
      const bookingId = await quick.book(tom.token, await quick.quote(tom.token, id, day(5), day(6)));
      await sleep(2500);

      expect(steps(await quick.list(`/bookings/${bookingId}/history`, tom.token))).toEqual([
        ['requested', tom.id],
        ['expired', null],
      ]);
      expect(contact(await quick.read(`/bookings/${bookingId}`, hal.token))).toBeUndefined();
    } finally {
      await stop(short);
      expiring.remove();
    }
  }, 90000);
});
