import { client, Client, database, day, eventually, Json, PASSWORD, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/** Request 49: everything OpenStay holds about a traveller, and nothing about anyone else. */
const db = database('export');
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

describe("a traveller's data", () => {
  it('exports the account, the bookings with their history and conditions, quotes, holds, favourites and receipts', async () => {
    const hal = await api.host('hal@export.test');
    const ian = await api.host('ian@export.test');
    const tom = await api.traveller('tom@export.test');
    const una = await api.traveller('una@export.test');
    const listing = await api.listing(hal.token);
    const asked = await api.listing(ian.token);
    await api.done('PUT', `/listings/${asked}/booking-mode`, ian.token, { mode: 'request' });

    const booked = await api.book(tom.token, await api.quote(tom.token, listing, day(20), day(22)));
    await api.done('POST', `/bookings/${booked}/change-dates`, tom.token, { checkIn: day(21), checkOut: day(23) });
    await payBooking(api, provider, tom.token, booked);
    // A request still waiting: its host's email is shown nowhere.
    const requested = await api.book(tom.token, await api.quote(tom.token, asked, day(30), day(31)));
    const quoteId = await api.quote(tom.token, listing, day(40), day(41));
    const holdId = await api.create('/holds', tom.token, {
      listingId: listing,
      checkIn: day(50),
      checkOut: day(51),
      guests: 1,
    });
    await api.done('POST', `/listings/${asked}/favourite`, tom.token);
    const unas = await api.book(una.token, await api.quote(una.token, listing, day(60), day(61)));
    await eventually(
      () => api.list('/receipts/mine', tom.token),
      receipts => receipts.length > 0,
    );

    const exported = await api.read('/accounts/me/export', tom.token);
    const account = exported.account as Json;
    expect(account).toMatchObject({ id: tom.id, email: tom.email });
    expect(Object.keys(account).filter(key => /password/i.test(key))).toEqual([]);
    const text = JSON.stringify(exported);
    expect(text).not.toContain(PASSWORD);

    const section = (name: string) => JSON.stringify(exported[name] ?? null);
    expect(section('bookings')).toContain(booked);
    expect(section('bookings')).toContain(requested);
    // The history has the change of dates; the first conditions still have the first check-in.
    expect(section('bookings')).toContain('changed');
    expect(section('bookings')).toContain(day(20));
    expect(section('quotes')).toContain(quoteId);
    expect(section('holds')).toContain(holdId);
    expect(section('favourites')).toContain(asked);
    expect(section('receipts')).toContain(booked);

    expect(text).not.toContain(unas);
    expect(text).not.toContain(una.email);
    expect(text).not.toContain(ian.email);
  }, 90000);

  it('is read by a signed-in account, for itself only', async () => {
    const una = await api.traveller('una2@export.test');
    const tom = await api.traveller('tom2@export.test');
    expect((await api.call('GET', '/accounts/me/export')).status).toBe(401);
    const exported = await api.read('/accounts/me/export', una.token);
    expect(exported.account).toMatchObject({ id: una.id, email: una.email });
    expect(JSON.stringify(exported)).not.toContain(tom.id);
    expect(JSON.stringify(exported)).not.toContain(tom.email);
  }, 60000);
});
