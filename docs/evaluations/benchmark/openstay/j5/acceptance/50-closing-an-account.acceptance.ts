import { client, Client, database, day, eventually, Json, PASSWORD, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/** Request 50: an account closed, its personal data gone, the money's record kept. */
const db = database('closing');
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

const signsIn = async (email: string) =>
  (await api.call('POST', '/accounts/login', undefined, { email, password: PASSWORD })).status === 200;

describe('closing an account', () => {
  it('refuses to close an account with a stay to come, as traveller or as host', async () => {
    const hal = await api.host('hal@closing.test');
    const una = await api.traveller('una@closing.test');
    const kim = await api.traveller('kim@closing.test');
    const id = await api.listing(hal.token);
    const asked = await api.listing(hal.token);
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    await api.book(una.token, await api.quote(una.token, id, day(10), day(12)));
    await api.book(kim.token, await api.quote(kim.token, asked, day(10), day(12)));

    expect(await api.refused('POST', '/accounts/me/close', una.token)).toBe(true);
    expect(await api.refused('POST', '/accounts/me/close', kim.token)).toBe(true);
    expect(await api.refused('POST', '/accounts/me/close', hal.token)).toBe(true);
    for (const email of [una.email, kim.email, hal.email]) expect(await signsIn(email)).toBe(true);
  }, 60000);

  it("erases the traveller's email and password, holds and favourites, and keeps the booking and its money", async () => {
    const hal = await api.host('hal2@closing.test');
    const tom = await api.traveller('tom2@closing.test');
    const una = await api.traveller('una2@closing.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    await payBooking(api, provider, tom.token, bookingId);
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    await eventually(
      () => api.read(`/bookings/${bookingId}`, hal.token),
      booking => (booking.refund as Json | undefined)?.status === 'refunded',
    );
    expect(((await api.read(`/bookings/${bookingId}`, hal.token)).contact as Json).email).toBe(tom.email);
    await api.create('/holds', tom.token, { listingId: id, checkIn: day(20), checkOut: day(21), guests: 1 });
    await api.done('POST', `/listings/${id}/favourite`, tom.token);

    await api.done('POST', '/accounts/me/close', tom.token);
    expect(
      (await api.call('POST', '/accounts/login', undefined, { email: tom.email, password: PASSWORD })).status,
    ).toBe(401);
    const again = await api.traveller(tom.email);
    expect(again.id).not.toBe(tom.id);
    expect(await api.quote(una.token, id, day(20), day(21))).toEqual(expect.any(String));

    const booking = await api.read(`/bookings/${bookingId}`, hal.token);
    expect(booking).toMatchObject({
      id: bookingId,
      status: 'cancelled',
      total: 12000,
      payment: { amount: 12000 },
      refund: { amount: 12000, status: 'refunded' },
    });
    expect((booking.contact as Json | null | undefined)?.email ?? null).toBeNull();
    expect(JSON.stringify(booking)).not.toContain(tom.email);
    expect(await api.list(`/bookings/${bookingId}/refunds`, hal.token)).toHaveLength(1);
  }, 60000);

  it("archives a closing host's listings, and frees their email", async () => {
    const ian = await api.host('ian3@closing.test');
    const id = await api.listing(ian.token, { city: 'Closeville' });
    expect((await api.list('/listings?city=Closeville')).map(each => each.id)).toEqual([id]);

    await api.done('POST', '/accounts/me/close', ian.token);
    expect(await signsIn(ian.email)).toBe(false);
    expect(await api.list('/listings?city=Closeville')).toEqual([]);
    expect(await api.hidden(`/listings/${id}`)).toBe(true);
    const again = await api.host(ian.email);
    expect(await api.list('/listings/mine', again.token)).toEqual([]);
  }, 60000);
});
