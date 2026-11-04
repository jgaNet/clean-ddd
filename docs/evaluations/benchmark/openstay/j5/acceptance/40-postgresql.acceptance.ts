import { client, Client, database, day, kill, Running, start, stop } from './openstay';

/** Request 40: the state kept in PostgreSQL, across kills and two servers. Invariants 3 and 4. */
const db = database('postgresql');
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

describe('storage on PostgreSQL', () => {
  it('keeps its state in PostgreSQL, and finds it after a kill, whatever DATABASE_PATH says', async () => {
    const hal = await api.host('hal@postgresql.test');
    const tom = await api.traveller('tom@postgresql.test');
    const id = await api.listing(hal.token, { city: 'Brest' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    expect(db.rows()).toBeGreaterThan(0);

    await kill(server);
    // Another file, never written: what the server finds can only come from PostgreSQL.
    server = await start(`${db.path}-not-read`, { DATABASE_URL: db.url });
    api = client(server.port);
    const token = await api.login(tom.email);
    expect(await api.read(`/bookings/${bookingId}`, token)).toMatchObject({
      id: bookingId,
      listingId: id,
      status: 'confirmed',
    });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ status: 'published', city: 'Brest' });
    expect(
      await api.refused('POST', '/quotes', token, { listingId: id, checkIn: day(21), checkOut: day(23), guests: 1 }),
    ).toBe(true);
  }, 90000);

  it('prepares an empty database and serves at once', async () => {
    const empty = database('postgresql-empty');
    const fresh = await start(empty.path);
    try {
      const other = client(fresh.port);
      const ivy = await other.host('ivy@postgresql.test');
      expect((await other.read('/accounts/me', ivy.token)).email).toBe(ivy.email);
      expect(empty.rows()).toBeGreaterThan(0);
    } finally {
      await stop(fresh);
      empty.remove();
    }
  }, 90000);

  it('confirms exactly one of twenty bookings of the same nights sent at once to two servers on one database', async () => {
    const hal = await api.host('hal3@postgresql.test');
    const id = await api.listing(hal.token, { city: 'Lorient', capacity: 2 });
    const travellers = await Promise.all(
      Array.from({ length: 20 }, (_, n) => api.traveller(`t${n}@two.postgresql.test`)),
    );
    const quotes = await Promise.all(travellers.map(each => api.quote(each.token, id, day(80), day(82))));

    const second = await start(db.path);
    try {
      const other = client(second.port);
      const sent = await Promise.all(
        travellers.map(async (each, n) => {
          const through = n % 2 === 0 ? api : other;
          return { through, token: await through.login(each.email), quoteId: quotes[n] };
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
});
