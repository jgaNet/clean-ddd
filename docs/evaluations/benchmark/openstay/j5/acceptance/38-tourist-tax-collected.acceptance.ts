import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/** Request 38: the tourist tax a host collected, per city and month, to remit. */
const db = database('tourist-tax');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** A listing in `city` with a tourist tax of `tax` cents per guest and night. */
async function taxed(token: string, city: string, tax: number) {
  const id = await api.listing(token, { city });
  await api.done('PUT', `/listings/${id}/tourist-tax`, token, { perGuestPerNight: tax });
  return id;
}

describe('tourist tax collected', () => {
  it('sums, per city, the tax of the paid bookings checking in that month, less what was refunded of it', async () => {
    const hal = await api.host('hal@tourist-tax.test');
    const tom = await api.traveller('tom@tourist-tax.test');
    const lyon = await taxed(hal.token, 'Lyon', 100);
    const otherLyon = await taxed(hal.token, 'Lyon', 100);
    const unpaidLyon = await taxed(hal.token, 'Lyon', 100);
    const annecy = await taxed(hal.token, 'Annecy', 250);
    const paris = await taxed(hal.token, 'Paris', 300);
    const booked = async (listingId: string, checkIn: number, nights: number, guests: number) =>
      api.book(tom.token, await api.quote(tom.token, listingId, day(checkIn), day(checkIn + nights), guests));

    // All check in on the same day: 2 guests × 2 nights × 100, 1 × 3 × 100, 1 × 1 × 250, 1 × 1 × 300.
    const lyonPaid = [await booked(lyon, 10, 2, 2), await booked(otherLyon, 10, 3, 1)];
    const annecyPaid = await booked(annecy, 10, 1, 1);
    const parisCancelled = await booked(paris, 10, 1, 1);
    await booked(unpaidLyon, 10, 1, 1);
    // More than 31 days later: another month.
    const nextMonth = await booked(lyon, 45, 1, 1);
    for (const bookingId of [...lyonPaid, annecyPaid, parisCancelled, nextMonth])
      await payBooking(api, provider, tom.token, bookingId);
    await api.done('POST', `/bookings/${parisCancelled}/cancel`, tom.token);
    await eventually(
      () => api.read(`/bookings/${parisCancelled}`, tom.token),
      booking => (booking.refund as Json | undefined)?.status === 'refunded',
    );

    expect(await api.list(`/hosts/me/tourist-tax?month=${day(10).slice(0, 7)}`, hal.token)).toEqual([
      { city: 'Annecy', collected: 250 },
      { city: 'Lyon', collected: 400 + 300 },
    ]);
    expect(await api.list(`/hosts/me/tourist-tax?month=${day(45).slice(0, 7)}`, hal.token)).toEqual([
      { city: 'Lyon', collected: 100 },
    ]);
  }, 90000);

  it("shows a host nothing of another host's listings", async () => {
    const ian = await api.host('ian@tourist-tax.test');
    const una = await api.traveller('una@tourist-tax.test');
    const id = await taxed(ian.token, 'Nantes', 100);
    const bookingId = await api.book(una.token, await api.quote(una.token, id, day(10), day(11)));
    await payBooking(api, provider, una.token, bookingId);
    const jon = await api.host('jon@tourist-tax.test');
    expect(await api.list(`/hosts/me/tourist-tax?month=${day(10).slice(0, 7)}`, jon.token)).toEqual([]);
    expect(await api.list(`/hosts/me/tourist-tax?month=${day(10).slice(0, 7)}`, ian.token)).toEqual([
      { city: 'Nantes', collected: 100 },
    ]);
  }, 60000);
});
