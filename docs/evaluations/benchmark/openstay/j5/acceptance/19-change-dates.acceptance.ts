import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 19: changing a booking's dates. */
const db = database('changes');
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

describe("changing a booking's dates", () => {
  it("moves a confirmed booking to free nights, prices it at today's terms, keeps its policy, and frees the old nights", async () => {
    const hal = await api.host('hal@changes.test');
    const tom = await api.traveller('tom@changes.test');
    const una = await api.traveller('una@changes.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000, cleaningFee: 2000, cancellationPolicy: 'flexible' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(23)));

    await api.done('PUT', `/listings/${id}`, hal.token, {
      title: 'A room with a view',
      city: 'Lyon',
      capacity: 2,
      nightlyPrice: 12000,
      cleaningFee: 2000,
      cancellationPolicy: 'strict',
    });
    await api.done('POST', `/bookings/${bookingId}/change-dates`, tom.token, { checkIn: day(21), checkOut: day(25) });
    const changed = await api.read(`/bookings/${bookingId}`, tom.token);
    expect(changed).toMatchObject({
      id: bookingId,
      checkIn: day(21),
      checkOut: day(25),
      total: 4 * 12000 + 2000,
      cancellationPolicy: 'flexible',
      status: 'confirmed',
    });
    const lines = changed.lines as Json[];
    expect(
      lines
        .filter(line => line.for === 'host')
        .map(line => line.amount)
        .sort((a, b) => Number(a) - Number(b)),
    ).toEqual([2000, 4 * 12000]);
    expect(lines.reduce((sum, line) => sum + Number(line.amount), 0)).toBe(4 * 12000 + 2000);
    expect(await api.quote(una.token, id, day(20), day(21))).toEqual(expect.any(String));
    expect(
      await api.refused('POST', '/quotes', una.token, {
        listingId: id,
        checkIn: day(22),
        checkOut: day(23),
        guests: 1,
      }),
    ).toBe(true);
    const history = await api.list(`/bookings/${bookingId}/history`, hal.token);
    expect(history.map(each => [each.status, each.by])).toEqual([
      ['confirmed', null],
      ['changed', tom.id],
    ]);
  }, 60000);

  it("refuses nights someone else has taken, a stay the listing does not take, someone else's booking and a request", async () => {
    const hal = await api.host('hal2@changes.test');
    const tom = await api.traveller('tom2@changes.test');
    const una = await api.traveller('una2@changes.test');
    const id = await api.listing(hal.token);
    await api.done('PUT', `/listings/${id}/stay-limits`, hal.token, { minNights: 2, maxNights: 10 });
    const toms = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(23)));
    await api.book(una.token, await api.quote(una.token, id, day(30), day(33)));
    const change = (bookingId: string, checkIn: number, checkOut: number, token = tom.token) =>
      api.refused('POST', `/bookings/${bookingId}/change-dates`, token, {
        checkIn: day(checkIn),
        checkOut: day(checkOut),
      });

    expect(await change(toms, 29, 31)).toBe(true);
    expect(await change(toms, 20, 21)).toBe(true);
    expect(await change(toms, 20, 22, una.token)).toBe(true);
    expect(await change(toms, 20, 22, hal.token)).toBe(true);
    expect((await api.read(`/bookings/${toms}`, tom.token)).checkIn).toBe(day(20));

    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    const requested = await api.book(tom.token, await api.quote(tom.token, id, day(40), day(42)));
    expect(await change(requested, 41, 43)).toBe(true);
  }, 60000);
});
