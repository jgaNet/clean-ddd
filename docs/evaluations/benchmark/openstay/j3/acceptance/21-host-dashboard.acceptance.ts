import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 21: a host's dashboard. */
const db = database('dashboard');
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

describe("a host's dashboard", () => {
  it('lists the requested and confirmed bookings of all their listings that overlap a range, by check-in', async () => {
    const hal = await api.host('hal@dashboard.test');
    const ian = await api.host('ian@dashboard.test');
    const tom = await api.traveller('tom@dashboard.test');
    const first = await api.listing(hal.token);
    const second = await api.listing(hal.token);
    await api.done('PUT', `/listings/${second}/booking-mode`, hal.token, { mode: 'request' });
    const elsewhere = await api.listing(ian.token);

    const confirmed = await api.book(tom.token, await api.quote(tom.token, first, day(10), day(12)));
    const requested = await api.book(tom.token, await api.quote(tom.token, second, day(11), day(13)));
    const cancelled = await api.book(tom.token, await api.quote(tom.token, first, day(13), day(14)));
    await api.done('POST', `/bookings/${cancelled}/cancel`, tom.token);
    await api.book(tom.token, await api.quote(tom.token, first, day(30), day(31)));
    const iansBooking = await api.book(tom.token, await api.quote(tom.token, elsewhere, day(10), day(12)));

    const listed = await api.list(`/hosts/me/bookings?from=${day(10)}&to=${day(15)}`, hal.token);
    expect(listed.map(each => [each.id, each.status])).toEqual([
      [confirmed, 'confirmed'],
      [requested, 'requested'],
    ]);
    expect(
      (await api.list(`/hosts/me/bookings?from=${day(10)}&to=${day(15)}`, ian.token)).map(each => each.id),
    ).toEqual([iansBooking]);
  }, 60000);

  it("counts each listing's bookable and booked nights over a range, and its occupancy rounded down", async () => {
    const hal = await api.host('hal2@dashboard.test');
    const tom = await api.traveller('tom2@dashboard.test');
    const busy = await api.listing(hal.token);
    const quiet = await api.listing(hal.token);
    await api.done('POST', `/listings/${busy}/block`, hal.token, { from: day(15), to: day(16) });
    await api.book(tom.token, await api.quote(tom.token, busy, day(10), day(12)));
    await api.done('PUT', `/listings/${quiet}/booking-mode`, hal.token, { mode: 'request' });
    await api.book(tom.token, await api.quote(tom.token, quiet, day(10), day(12)));

    const occupancy = await api.list(`/hosts/me/occupancy?from=${day(10)}&to=${day(20)}`, hal.token);
    const expected = [
      { listingId: busy, availableNights: 9, bookedNights: 2, occupancy: 22 },
      { listingId: quiet, availableNights: 10, bookedNights: 0, occupancy: 0 },
    ].sort((a, b) => (a.listingId < b.listingId ? -1 : 1));
    expect(occupancy).toEqual(expected.map(each => expect.objectContaining(each)));
  }, 60000);
});
