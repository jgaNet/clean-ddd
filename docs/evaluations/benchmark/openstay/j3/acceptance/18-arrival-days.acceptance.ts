import { client, Client, database, day, daysTo, Running, start, stop } from './openstay';

/** Request 18: arrival and departure days. */
const db = database('days');
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

describe('arrival and departure days', () => {
  it('refuses a check-in or a check-out on a day the listing does not allow, and search keeps to it', async () => {
    const hal = await api.host('hal@days.test');
    const tom = await api.traveller('tom@days.test');
    const id = await api.listing(hal.token, { city: 'Colmar' });
    expect((await api.read(`/listings/${id}`)).arrivalDays).toEqual({
      checkInDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      checkOutDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    });
    await api.done('PUT', `/listings/${id}/arrival-days`, hal.token, {
      checkInDays: ['saturday'],
      checkOutDays: ['saturday', 'sunday'],
    });

    const saturday = daysTo('saturday', 5);
    const asked = (checkIn: number, checkOut: number) =>
      api.refused('POST', '/quotes', tom.token, {
        listingId: id,
        checkIn: day(checkIn),
        checkOut: day(checkOut),
        guests: 1,
      });
    expect(await asked(saturday, saturday + 7)).toBe(false);
    expect(await asked(saturday, saturday + 8)).toBe(false);
    expect(await asked(saturday + 1, saturday + 8)).toBe(true);
    expect(await asked(saturday, saturday + 6)).toBe(true);

    const found = async (checkIn: number, checkOut: number) =>
      (await api.list(`/listings?city=Colmar&checkIn=${day(checkIn)}&checkOut=${day(checkOut)}`)).some(
        each => each.id === id,
      );
    expect(await found(saturday, saturday + 7)).toBe(true);
    expect(await found(saturday + 2, saturday + 7)).toBe(false);
  }, 60000);

  it('refuses a day outside the seven, an empty list, and anyone but the host', async () => {
    const hal = await api.host('hal2@days.test');
    const ian = await api.host('ian2@days.test');
    const id = await api.listing(hal.token);
    const days = (checkInDays: string[], checkOutDays: string[], token = hal.token) =>
      api.refused('PUT', `/listings/${id}/arrival-days`, token, { checkInDays, checkOutDays });
    expect(await days(['funday'], ['monday'])).toBe(true);
    expect(await days([], ['monday'])).toBe(true);
    expect(await days(['monday'], [])).toBe(true);
    expect(await days(['monday'], ['monday'], ian.token)).toBe(true);
    expect(await days(['sunday', 'monday'], ['friday'])).toBe(false);
    expect((await api.read(`/listings/${id}`)).arrivalDays).toEqual({
      checkInDays: ['monday', 'sunday'],
      checkOutDays: ['friday'],
    });
  }, 60000);
});
