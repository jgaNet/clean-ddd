import {
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  sleep,
  start,
  stop,
  clock,
} from './openstay';
import { paymentProvider, payBooking, ProviderPayment } from './provider';

/**
 * Request 81: donations never rank. Search, listings, quotes, bookings and ratings say the same whatever
 * anyone gave; the month's public donors are listed by name and amount, the largest first.
 */
const db = database('donors');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** A donation made (request 80), with the provider's payment OpenStay asked for it. */
async function donate(token: string, body: Json): Promise<{ id: string; payment: ProviderPayment }> {
  const id = await api.create('/donations', token, body);
  const [payment] = await eventually(
    async () => provider.paymentFor(`donation:${id}`),
    found => found.length > 0,
  );
  if (!payment) throw new Error(`OpenStay asked the provider for no payment of donation ${id}`);
  return { id, payment };
}
const donationReads = (id: string, token: string, status: string) =>
  eventually(
    () => api.read(`/donations/${id}`, token),
    donation => donation.status === status,
  );
/** A donation made and paid at the provider, once OpenStay reads it paid. */
async function paidDonation(token: string, body: Json) {
  const donation = await donate(token, body);
  provider.pay(donation.payment.id);
  expect(await donationReads(donation.id, token, 'paid')).toMatchObject({ status: 'paid' });
  return donation;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);
const donors = (month: string) => api.list(`/donors?month=${month}`);
const entry = (name: string, amount: number) => expect.objectContaining({ name, amount });

describe('donations never rank', () => {
  it('leaves search, listings, quotes, bookings and ratings as they were, whoever gave and however much', async () => {
    const hal = await api.host('hal@donors.test');
    const ian = await api.host('ian@donors.test');
    const tom = await api.traveller('tom@donors.test');
    // In the order of request 3: the cheapest first, then the one published first.
    const halsListing = await api.listing(hal.token, { city: 'Giverny', nightlyPrice: 12000 });
    const iansCheap = await api.listing(ian.token, { city: 'Giverny', nightlyPrice: 10000 });
    const iansLater = await api.listing(ian.token, { city: 'Giverny', nightlyPrice: 12000 });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, halsListing, day(10), day(12)));
    await payBooking(api, provider, tom.token, bookingId);
    const quoteId = await api.quote(tom.token, halsListing, day(20), day(22));

    const searches = [
      '/listings?city=Giverny',
      `/listings?city=Giverny&checkIn=${day(30)}&checkOut=${day(32)}&guests=2`,
      '/listings?city=giverny&maxPrice=12000',
      '/listings?city=Giverny&sort=rating',
    ];
    const reads = async () => ({
      searches: await Promise.all(searches.map(path => api.list(path))),
      signedIn: await api.list('/listings?city=Giverny', tom.token),
      listings: await Promise.all([halsListing, iansCheap, iansLater].map(id => api.read(`/listings/${id}`))),
      booking: await api.read(`/bookings/${bookingId}`, tom.token),
      bookingForHost: await api.read(`/bookings/${bookingId}`, hal.token),
      quote: await api.read(`/quotes/${quoteId}`, tom.token),
      ratings: await Promise.all([hal.id, ian.id].map(id => api.read(`/hosts/${id}/rating`))),
    });
    const before = await reads();
    expect(before.searches[0].map(each => each.id)).toEqual([iansCheap, halsListing, iansLater]);

    // The host who is second in the order gives the most; the traveller gives beside their booking.
    const halsGift = await paidDonation(hal.token, { amount: 500000 });
    const tomsGift = await paidDonation(tom.token, { amount: 100, bookingId });
    const iansGift = await paidDonation(ian.token, { amount: 2500 });
    await sleep(1500);

    expect(await reads()).toEqual(before);

    // Only the donor reads a donation: not the booking's host, not another giver, not anyone signed out.
    expect(await api.hidden(`/donations/${tomsGift.id}`, hal.token)).toBe(true);
    expect(await api.hidden(`/donations/${halsGift.id}`, tom.token)).toBe(true);
    expect(await api.hidden(`/donations/${iansGift.id}`, hal.token)).toBe(true);
    expect(await api.hidden(`/donations/${halsGift.id}`)).toBe(true);
    expect(await api.read(`/donations/${tomsGift.id}`, tom.token)).toMatchObject({ bookingId, status: 'paid' });
  }, 120000);

  it("lists the month's paid public donations to anyone, largest first, each on its own, by name and amount only", async () => {
    const ann = await api.traveller('ann@donors.test');
    const bob = await api.host('bob@donors.test');
    const cat = await api.traveller('cat@donors.test');
    const dan = await api.traveller('dan@donors.test');
    const eve = await api.traveller('eve@donors.test');
    const amy = await api.traveller('amy@donors.test');
    const zoe = await api.traveller('zoe@donors.test');
    const hal = await api.host('hal2@donors.test');
    const listingId = await api.listing(hal.token, { city: 'Honfleur' });
    const bookingId = await api.book(ann.token, await api.quote(ann.token, listingId, day(10), day(11)));

    await paidDonation(bob.token, { amount: 2000, public: true, name: 'Bob' });
    // Two donations under one name are two entries; one of them was given beside a booking.
    await paidDonation(ann.token, { amount: 700, public: true, name: 'Ann' });
    await paidDonation(ann.token, { amount: 700, public: true, name: 'Ann', bookingId });
    // Not public, still pending, failed: never listed.
    await paidDonation(cat.token, { amount: 9000 });
    await donate(dan.token, { amount: 1000, public: true, name: 'Dan' });
    const failed = await donate(eve.token, { amount: 3000, public: true, name: 'Eve' });
    provider.fail(failed.payment.id);
    await donationReads(failed.id, eve.token, 'failed');
    // Of the same amount, the one paid first comes first, whichever was given first.
    const amys = await donate(amy.token, { amount: 500, public: true, name: 'Amy' });
    const zoes = await donate(zoe.token, { amount: 500, public: true, name: 'Zoe' });
    provider.pay(zoes.payment.id);
    await donationReads(zoes.id, zoe.token, 'paid');
    await sleep(1100);
    provider.pay(amys.payment.id);
    await donationReads(amys.id, amy.token, 'paid');

    const month = thisMonth();
    const listed = await donors(month);
    expect(listed).toEqual([
      entry('Bob', 2000),
      entry('Ann', 700),
      entry('Ann', 700),
      entry('Zoe', 500),
      entry('Amy', 500),
    ]);
    // Signed in or not, the same list; and nothing in it says who gave.
    expect(await api.list(`/donors?month=${month}`, cat.token)).toEqual(listed);
    const text = JSON.stringify(listed);
    for (const secret of [ann.id, bob.id, amy.id, zoe.id, ann.email, bob.email, bookingId])
      expect(text).not.toContain(secret);

    expect(await donors('2001-01')).toEqual([]);
    for (const query of ['', '?month=2026-13', '?month=202611', '?month=soon'])
      expect((await api.call('GET', `/donors${query}`)).status).toBe(400);
  }, 120000);

  it("lists a donation in the month the provider said it succeeded, by OpenStay's time", async () => {
    const ned = await api.traveller('ned@donors.test');
    const month = thisMonth();
    const late = await donate(ned.token, { amount: 4200, public: true, name: 'Ned' });
    const listed = await donors(month);
    expect(listed.some(each => each.name === 'Ned')).toBe(false);

    // OpenStay moved to the first day of next month (request 57); the provider says it succeeded then.
    const now = new Date();
    const firstOfNext = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const days = Math.ceil((firstOfNext - now.getTime()) / 86_400_000);
    const next = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 7);
    server = await restart(server, db.path, { ...environment, ...clock(days) });
    provider.attach(server.port);
    api = client(server.port);
    const token = await api.login(ned.email);
    provider.pay(late.payment.id);
    await donationReads(late.id, token, 'paid');

    expect(await donors(next)).toEqual([entry('Ned', 4200)]);
    expect(await donors(month)).toEqual(listed);
  }, 120000);
});
