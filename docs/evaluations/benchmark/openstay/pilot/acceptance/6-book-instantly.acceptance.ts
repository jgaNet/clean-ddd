import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 6: book instantly, never the same night twice, never twice by mistake. Invariants 3, 4 and 8. */
const db = database('book');
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

describe('book instantly', () => {
  it('confirms a booking that keeps everything the quote showed, whatever the listing says afterwards', async () => {
    const hal = await api.host('hal@book.test');
    const tom = await api.traveller('tom@book.test');
    const id = await api.listing(hal.token, { city: 'Nice', cleaningFee: 2000, cancellationPolicy: 'flexible' });

    const quoteId = await api.quote(tom.token, id, day(50), day(53), 2);
    const quote = await api.read(`/quotes/${quoteId}`, tom.token);
    const bookingId = await api.book(tom.token, quoteId);
    const booking = await api.read(`/bookings/${bookingId}`, tom.token);
    expect(booking).toMatchObject({
      id: bookingId,
      listingId: id,
      travellerId: tom.id,
      hostId: hal.id,
      checkIn: day(50),
      checkOut: day(53),
      guests: 2,
      lines: quote.lines,
      total: quote.total,
      cancellationPolicy: 'flexible',
      status: 'confirmed',
    });
    expect(await api.read(`/bookings/${bookingId}`, hal.token)).toMatchObject({ id: bookingId, status: 'confirmed' });

    const later = await api.quote(tom.token, id, day(60), day(62));
    const laterQuote = await api.read(`/quotes/${later}`, tom.token);
    await api.done('PUT', `/listings/${id}`, hal.token, {
      title: 'A room with a view',
      city: 'Nice',
      capacity: 2,
      nightlyPrice: 99900,
      cleaningFee: 9000,
      cancellationPolicy: 'strict',
    });
    const kept = await api.read(`/bookings/${await api.book(tom.token, later)}`, tom.token);
    expect(kept).toMatchObject({ total: laterQuote.total, lines: laterQuote.lines, cancellationPolicy: 'flexible' });
  }, 60000);

  it('takes the booked nights: the calendar, search, quotes and the host keep off them', async () => {
    const hal = await api.host('hal2@book.test');
    const tom = await api.traveller('tom2@book.test');
    const una = await api.traveller('una2@book.test');
    const id = await api.listing(hal.token, { city: 'Antibes' });
    await api.book(tom.token, await api.quote(tom.token, id, day(50), day(53)));

    expect(
      (await api.list(`/listings/${id}/calendar?from=${day(49)}&to=${day(54)}`)).map(each => each.available),
    ).toEqual([true, false, false, false, true]);
    const found = async (checkIn: string, checkOut: string) =>
      (await api.list(`/listings?city=Antibes&checkIn=${checkIn}&checkOut=${checkOut}`)).some(each => each.id === id);
    expect(await found(day(51), day(52))).toBe(false);
    expect(await found(day(53), day(55))).toBe(true);
    expect(
      await api.refused('POST', '/quotes', una.token, {
        listingId: id,
        checkIn: day(52),
        checkOut: day(54),
        guests: 1,
      }),
    ).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/block`, hal.token, { from: day(51), to: day(52) })).toBe(true);
  }, 60000);

  it("refuses someone else's quote, a quote for nights taken since, and a listing no longer published", async () => {
    const hal = await api.host('hal3@book.test');
    const tom = await api.traveller('tom3@book.test');
    const una = await api.traveller('una3@book.test');
    const id = await api.listing(hal.token, { city: 'Menton' });

    const toms = await api.quote(tom.token, id, day(20), day(22));
    expect(await api.refused('POST', '/bookings', una.token, { quoteId: toms })).toBe(true);

    const unas = await api.quote(una.token, id, day(21), day(23));
    await api.book(tom.token, toms);
    expect(await api.refused('POST', '/bookings', una.token, { quoteId: unas })).toBe(true);

    const suspended = await api.quote(una.token, id, day(30), day(31));
    await api.done('POST', `/listings/${id}/suspend`, hal.token);
    expect(await api.refused('POST', '/bookings', una.token, { quoteId: suspended })).toBe(true);
  }, 60000);

  it('makes one booking of a request sent twice with the same key', async () => {
    const hal = await api.host('hal4@book.test');
    const tom = await api.traveller('tom4@book.test');
    const id = await api.listing(hal.token, { city: 'Grasse' });
    const quoteId = await api.quote(tom.token, id, day(15), day(17));
    const key = { 'Idempotency-Key': 'grasse-15' };

    const first = await api.create('/bookings', tom.token, { quoteId }, key);
    const second = await api.create('/bookings', tom.token, { quoteId }, key);
    expect(second).toBe(first);
    expect((await api.list('/bookings/mine', tom.token)).map(each => each.id)).toEqual([first]);
  }, 60000);

  it("lists a traveller's bookings and a listing's, the most recent first, to them only", async () => {
    const hal = await api.host('hal5@book.test');
    const ian = await api.host('ian5@book.test');
    const tom = await api.traveller('tom5@book.test');
    const una = await api.traveller('una5@book.test');
    const id = await api.listing(hal.token, { city: 'Cannes' });
    const first = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    await new Promise(resolve => setTimeout(resolve, 1100));
    const second = await api.book(tom.token, await api.quote(tom.token, id, day(12), day(13)));

    expect((await api.list('/bookings/mine', tom.token)).map(each => each.id)).toEqual([second, first]);
    expect((await api.list(`/listings/${id}/bookings`, hal.token)).map(each => each.id)).toEqual([second, first]);
    expect(await api.list('/bookings/mine', una.token)).toEqual([]);
    expect(await api.hidden(`/bookings/${first}`, una.token)).toBe(true);
    expect(await api.hidden(`/bookings/${first}`, ian.token)).toBe(true);
    expect(await api.hidden(`/listings/${id}/bookings`, ian.token)).toBe(true);
  }, 60000);

  it('confirms exactly one of twenty bookings of the same nights sent at once to one server', async () => {
    const hal = await api.host('hal6@book.test');
    const id = await api.listing(hal.token, { city: 'Cassis', capacity: 2 });
    const travellers = await Promise.all(Array.from({ length: 20 }, (_, n) => api.traveller(`t${n}@one.book.test`)));
    const quotes = await Promise.all(travellers.map(each => api.quote(each.token, id, day(70), day(72))));

    const outcomes = await Promise.all(
      travellers.map((each, n) => api.act('POST', '/bookings', each.token, { quoteId: quotes[n] })),
    );
    expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
    expect(await api.list(`/listings/${id}/bookings`, hal.token)).toHaveLength(1);
  }, 120000);

  it('confirms exactly one of twenty bookings of the same nights sent at once to two servers on one database', async () => {
    const hal = await api.host('hal7@book.test');
    const id = await api.listing(hal.token, { city: 'Sanary', capacity: 2 });
    const travellers = await Promise.all(Array.from({ length: 20 }, (_, n) => api.traveller(`t${n}@two.book.test`)));
    const quotes = await Promise.all(travellers.map(each => api.quote(each.token, id, day(80), day(82))));

    const second = await start(db.path);
    try {
      const other = client(second.port);
      const sent = await Promise.all(
        travellers.map(async (each, n) => {
          const through = n % 2 === 0 ? api : other;
          const token = await through.login(each.email);
          return { through, token, quoteId: quotes[n] };
        }),
      );
      const outcomes = await Promise.all(
        sent.map(each => each.through.act('POST', '/bookings', each.token, { quoteId: each.quoteId })),
      );
      expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
      expect(await api.list(`/listings/${id}/bookings`, hal.token)).toHaveLength(1);
      expect(await other.list(`/listings/${id}/bookings`, await other.login(hal.email))).toHaveLength(1);
    } finally {
      await stop(second);
    }
  }, 180000);

  it('refuses a quote that is no longer valid', async () => {
    const expiring = database('book-ttl');
    const short = await start(expiring.path, { QUOTE_TTL_SECONDS: '1' });
    try {
      const quick = client(short.port);
      const hal = await quick.host('hal8@book.test');
      const tom = await quick.traveller('tom8@book.test');
      const id = await quick.listing(hal.token, { city: 'Hyères' });
      const quoteId = await quick.quote(tom.token, id, day(30), day(31));
      await new Promise(resolve => setTimeout(resolve, 2500));
      expect(await quick.refused('POST', '/bookings', tom.token, { quoteId })).toBe(true);
    } finally {
      await stop(short);
      expiring.remove();
    }
  }, 90000);
});
