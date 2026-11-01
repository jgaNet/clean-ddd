import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 17: how soon, and how far ahead. */
const db = database('window');
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

describe('the booking window', () => {
  it('refuses a stay with too little notice or too far ahead, and search keeps to it', async () => {
    const hal = await api.host('hal@window.test');
    const tom = await api.traveller('tom@window.test');
    const id = await api.listing(hal.token, { city: 'Annecy' });
    expect((await api.read(`/listings/${id}`)).bookingWindow).toEqual({ minNoticeDays: 0, maxAdvanceDays: 365 });
    await api.done('PUT', `/listings/${id}/booking-window`, hal.token, { minNoticeDays: 3, maxAdvanceDays: 30 });
    expect((await api.read(`/listings/${id}`)).bookingWindow).toEqual({ minNoticeDays: 3, maxAdvanceDays: 30 });

    const asked = (checkIn: number) =>
      api.refused('POST', '/quotes', tom.token, {
        listingId: id,
        checkIn: day(checkIn),
        checkOut: day(checkIn + 1),
        guests: 1,
      });
    expect(await asked(2)).toBe(true);
    expect(await asked(3)).toBe(false);
    expect(await asked(30)).toBe(false);
    expect(await asked(31)).toBe(true);

    const found = async (checkIn: number) =>
      (await api.list(`/listings?city=Annecy&checkIn=${day(checkIn)}&checkOut=${day(checkIn + 1)}`)).some(
        each => each.id === id,
      );
    expect(await found(1)).toBe(false);
    expect(await found(5)).toBe(true);
    expect(await found(40)).toBe(false);
  }, 60000);

  it('refuses a stay beyond 365 days by default, a window out of range, and anyone but the host', async () => {
    const hal = await api.host('hal2@window.test');
    const ian = await api.host('ian2@window.test');
    const tom = await api.traveller('tom2@window.test');
    const id = await api.listing(hal.token);
    expect(
      await api.refused('POST', '/quotes', tom.token, {
        listingId: id,
        checkIn: day(366),
        checkOut: day(367),
        guests: 1,
      }),
    ).toBe(true);
    const window = (minNoticeDays: number, maxAdvanceDays: number, token = hal.token) =>
      api.refused('PUT', `/listings/${id}/booking-window`, token, { minNoticeDays, maxAdvanceDays });
    expect(await window(31, 100)).toBe(true);
    expect(await window(0, 0)).toBe(true);
    expect(await window(0, 731)).toBe(true);
    expect(await window(1, 10, ian.token)).toBe(true);
  }, 60000);
});
