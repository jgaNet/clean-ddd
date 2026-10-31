import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 5: a quote, line by line, that does not change. Invariants 1, 8 and 10. */
const db = database('quote');
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

const lines = (quote: Json) => quote.lines as { label: string; for: string; amount: number }[];
const sum = (each: { amount: number }[]) => each.reduce((total, line) => total + line.amount, 0);

describe('a quote', () => {
  it('names every euro: the host lines, the tourist tax as external, and a platform share of zero', async () => {
    const hal = await api.host('hal@quote.test');
    const tom = await api.traveller('tom@quote.test');
    const id = await api.listing(hal.token, {
      city: 'Bordeaux',
      capacity: 4,
      nightlyPrice: 10000,
      cleaningFee: 3000,
      cancellationPolicy: 'moderate',
    });
    expect((await api.read(`/listings/${id}`)).touristTax).toBe(0);
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 150 });
    expect((await api.read(`/listings/${id}`)).touristTax).toBe(150);

    const quoteId = await api.quote(tom.token, id, day(30), day(33), 2);
    const quote = await api.read(`/quotes/${quoteId}`, tom.token);
    expect(quote).toMatchObject({
      id: quoteId,
      listingId: id,
      checkIn: day(30),
      checkOut: day(33),
      guests: 2,
      nights: 3,
      total: 33900,
      cancellationPolicy: 'moderate',
    });
    expect(sum(lines(quote).filter(line => line.for === 'host'))).toBe(33000);
    const external = lines(quote).filter(line => line.for === 'external');
    expect(external).toHaveLength(1);
    expect(external[0].amount).toBe(900);
    expect(external[0].label).toEqual(expect.any(String));
    expect(external[0].label.length).toBeGreaterThan(0);
    expect(lines(quote).filter(line => line.for === 'platform')).toEqual([expect.objectContaining({ amount: 0 })]);
    expect(lines(quote).every(line => ['host', 'external', 'platform'].includes(line.for))).toBe(true);
    expect(sum(lines(quote))).toBe(quote.total);
    expect(Date.parse(String(quote.validUntil))).toBeGreaterThan(Date.now());

    await api.done('PUT', `/listings/${id}`, hal.token, {
      title: 'A room with a view',
      city: 'Bordeaux',
      capacity: 4,
      nightlyPrice: 20000,
      cleaningFee: 9000,
      cancellationPolicy: 'strict',
    });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 500 });
    expect(await api.read(`/quotes/${quoteId}`, tom.token)).toEqual(quote);
  }, 60000);

  it('refuses a quote the listing cannot give', async () => {
    const hal = await api.host('hal2@quote.test');
    const tom = await api.traveller('tom2@quote.test');
    const id = await api.listing(hal.token, { city: 'Bordeaux', capacity: 2 });
    const draft = await api.listing(hal.token, { city: 'Bordeaux' }, false);
    await api.done('POST', `/listings/${id}/block`, hal.token, { from: day(40), to: day(41) });
    const asked = (listingId: string, checkIn: string, checkOut: string, guests = 1, token = tom.token) =>
      api.refused('POST', '/quotes', token, { listingId, checkIn, checkOut, guests });

    expect(await asked(id, day(10), day(12), 3)).toBe(true);
    expect(await asked(id, day(-1), day(2))).toBe(true);
    expect(await asked(id, day(39), day(42))).toBe(true);
    expect(await asked(draft, day(10), day(12))).toBe(true);
    expect(await asked(id, day(10), day(12), 1, hal.token)).toBe(true);
    expect(
      await api.refused('POST', '/quotes', undefined, {
        listingId: id,
        checkIn: day(10),
        checkOut: day(12),
        guests: 1,
      }),
    ).toBe(true);

    await api.done('PUT', `/listings/${id}/stay-limits`, hal.token, { minNights: 3, maxNights: 4 });
    expect(await asked(id, day(10), day(12))).toBe(true);
    expect(await asked(id, day(10), day(15))).toBe(true);
    expect(await asked(id, day(10), day(13))).toBe(false);
    expect(await asked(id, day(0), day(3))).toBe(false);
  }, 60000);

  it('is read by the traveller who asked for it only, and refuses a tax below zero', async () => {
    const hal = await api.host('hal3@quote.test');
    const tom = await api.traveller('tom3@quote.test');
    const una = await api.traveller('una3@quote.test');
    const id = await api.listing(hal.token, { city: 'Bordeaux' });

    const quoteId = await api.quote(tom.token, id, day(5), day(6));
    expect(await api.hidden(`/quotes/${quoteId}`, una.token)).toBe(true);
    expect(await api.hidden(`/quotes/${quoteId}`, hal.token)).toBe(true);
    expect(await api.hidden(`/quotes/${quoteId}`)).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: -1 })).toBe(true);
  }, 60000);
});
