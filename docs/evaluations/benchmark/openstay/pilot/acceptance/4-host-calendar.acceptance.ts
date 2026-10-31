import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 4: blocked nights, the length of a stay, the calendar and search. */
const db = database('calendar');
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

const found = async (city: string, checkIn: string, checkOut: string, id: string) =>
  (await api.list(`/listings?city=${city}&checkIn=${checkIn}&checkOut=${checkOut}`)).some(each => each.id === id);

describe("the host's calendar", () => {
  it('blocks and frees nights, which the calendar and search show', async () => {
    const hal = await api.host('hal@calendar.test');
    const id = await api.listing(hal.token, { city: 'Nantes' });

    await api.done('POST', `/listings/${id}/block`, hal.token, { from: day(20), to: day(23) });
    const calendar = await api.list(`/listings/${id}/calendar?from=${day(19)}&to=${day(24)}`);
    expect(calendar).toEqual([
      { date: day(19), available: true },
      { date: day(20), available: false },
      { date: day(21), available: false },
      { date: day(22), available: false },
      { date: day(23), available: true },
    ]);
    expect(await found('Nantes', day(21), day(25), id)).toBe(false);
    expect(await found('Nantes', day(18), day(21), id)).toBe(false);
    expect(await found('Nantes', day(23), day(25), id)).toBe(true);
    expect(await found('Nantes', day(18), day(20), id)).toBe(true);

    await api.done('POST', `/listings/${id}/unblock`, hal.token, { from: day(21), to: day(22) });
    expect(
      (await api.list(`/listings/${id}/calendar?from=${day(20)}&to=${day(23)}`)).map(each => each.available),
    ).toEqual([false, true, false]);
    expect(await found('Nantes', day(21), day(22), id)).toBe(true);

    await api.done('POST', `/listings/${id}/unblock`, hal.token, { from: day(30), to: day(32) });
    expect(
      (await api.list(`/listings/${id}/calendar?from=${day(30)}&to=${day(32)}`)).every(each => each.available),
    ).toBe(true);
  }, 60000);

  it('refuses a range with no night or with more than 365, and anyone but the host', async () => {
    const hal = await api.host('hal2@calendar.test');
    const ian = await api.host('ian2@calendar.test');
    const tom = await api.traveller('tom2@calendar.test');
    const id = await api.listing(hal.token, { city: 'Nantes' });

    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(20), to: day(20) })).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(20), to: day(19) })).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(1), to: day(367) })).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, ian.token, { from: day(20), to: day(21) })).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, tom.token, { from: day(20), to: day(21) })).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(1), to: day(366) })).toBe(false);
  }, 60000);

  it('sets the shortest and longest stay, 1 and 365 until then, and search keeps to them', async () => {
    const hal = await api.host('hal3@calendar.test');
    const ian = await api.host('ian3@calendar.test');
    const id = await api.listing(hal.token, { city: 'Brest' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ minNights: 1, maxNights: 365 });

    await api.done('PUT', `/listings/${id}/stay-limits`, hal.token, { minNights: 2, maxNights: 5 });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ minNights: 2, maxNights: 5 });
    expect(await found('Brest', day(10), day(11), id)).toBe(false);
    expect(await found('Brest', day(10), day(12), id)).toBe(true);
    expect(await found('Brest', day(10), day(15), id)).toBe(true);
    expect(await found('Brest', day(10), day(16), id)).toBe(false);

    const limits = (minNights: number, maxNights: number, token = hal.token) =>
      api.refused('PUT', `/listings/${id}/stay-limits`, token, { minNights, maxNights });
    expect(await limits(0, 5)).toBe(true);
    expect(await limits(1, 366)).toBe(true);
    expect(await limits(6, 5)).toBe(true);
    expect(await limits(1, 3, ian.token)).toBe(true);
    expect(await api.read(`/listings/${id}`)).toMatchObject({ minNights: 2, maxNights: 5 });
  }, 60000);

  it("hides a draft's calendar from anyone but its host", async () => {
    const hal = await api.host('hal4@calendar.test');
    const id = await api.listing(hal.token, { city: 'Brest' }, false);
    expect(await api.hidden(`/listings/${id}/calendar?from=${day(1)}&to=${day(3)}`)).toBe(true);
    expect(await api.list(`/listings/${id}/calendar?from=${day(1)}&to=${day(3)}`, hal.token)).toHaveLength(2);
  }, 60000);
});
