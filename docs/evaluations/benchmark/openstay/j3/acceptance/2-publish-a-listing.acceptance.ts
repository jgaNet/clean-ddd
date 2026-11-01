import { client, Client, database, Running, sleep, start, stop } from './openstay';

/** Request 2: a listing, its life, and who sees it. */
const db = database('listings');
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

const description = {
  title: 'A loft by the river',
  city: 'Lyon',
  capacity: 4,
  nightlyPrice: 12000,
  cleaningFee: 3000,
  cancellationPolicy: 'moderate',
};

describe('publish a listing', () => {
  it('creates a draft that only a host may create and only its host sees', async () => {
    const hal = await api.host('hal@listings.test');
    const tom = await api.traveller('tom@listings.test');
    const ian = await api.host('ian@listings.test');

    const id = await api.create('/listings', hal.token, description);
    expect(await api.read(`/listings/${id}`, hal.token)).toMatchObject({
      id,
      hostId: hal.id,
      ...description,
      status: 'draft',
    });
    expect(await api.hidden(`/listings/${id}`)).toBe(true);
    expect(await api.hidden(`/listings/${id}`, ian.token)).toBe(true);
    expect(await api.refused('POST', '/listings', tom.token, description)).toBe(true);
    expect(await api.refused('POST', '/listings', undefined, description)).toBe(true);
  }, 60000);

  it('refuses a description with a value that is not allowed', async () => {
    const hal = await api.host('hal2@listings.test');
    const refusedWith = (change: Record<string, unknown>) =>
      api.refused('POST', '/listings', hal.token, { ...description, ...change });

    expect(await refusedWith({ title: '   ' })).toBe(true);
    expect(await refusedWith({ title: 'x'.repeat(101) })).toBe(true);
    expect(await refusedWith({ city: '' })).toBe(true);
    expect(await refusedWith({ capacity: 0 })).toBe(true);
    expect(await refusedWith({ capacity: 17 })).toBe(true);
    expect(await refusedWith({ nightlyPrice: 99 })).toBe(true);
    expect(await refusedWith({ cleaningFee: -1 })).toBe(true);
    expect(await refusedWith({ cancellationPolicy: 'lenient' })).toBe(true);
    expect(await refusedWith({ title: 'x'.repeat(100), capacity: 16, nightlyPrice: 100, cleaningFee: 0 })).toBe(false);
  }, 60000);

  it('publishes, suspends, publishes again and archives, as its host only', async () => {
    const hal = await api.host('hal3@listings.test');
    const ian = await api.host('ian3@listings.test');
    const id = await api.create('/listings', hal.token, description);

    expect(await api.refused('POST', `/listings/${id}/suspend`, hal.token)).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/publish`, ian.token)).toBe(true);
    await api.done('POST', `/listings/${id}/publish`, hal.token);
    expect((await api.read(`/listings/${id}`)).status).toBe('published');
    expect((await api.read(`/listings/${id}`, ian.token)).status).toBe('published');

    expect(await api.refused('POST', `/listings/${id}/suspend`, ian.token)).toBe(true);
    await api.done('POST', `/listings/${id}/suspend`, hal.token);
    expect((await api.read(`/listings/${id}`, hal.token)).status).toBe('suspended');
    expect(await api.hidden(`/listings/${id}`)).toBe(true);
    expect(await api.hidden(`/listings/${id}`, ian.token)).toBe(true);

    await api.done('POST', `/listings/${id}/publish`, hal.token);
    expect((await api.read(`/listings/${id}`)).status).toBe('published');

    expect(await api.refused('POST', `/listings/${id}/archive`, ian.token)).toBe(true);
    await api.done('POST', `/listings/${id}/archive`, hal.token);
    expect((await api.read(`/listings/${id}`, hal.token)).status).toBe('archived');
    expect(await api.hidden(`/listings/${id}`)).toBe(true);
    expect(await api.refused('POST', `/listings/${id}/publish`, hal.token)).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}`, hal.token, { ...description, title: 'Again' })).toBe(true);
  }, 60000);

  it('archives a draft, and lets only its host replace a description', async () => {
    const hal = await api.host('hal4@listings.test');
    const ian = await api.host('ian4@listings.test');
    const id = await api.create('/listings', hal.token, description);
    const changed = { ...description, title: 'A loft, renovated', capacity: 3, nightlyPrice: 15000 };

    expect(await api.refused('PUT', `/listings/${id}`, ian.token, changed)).toBe(true);
    await api.done('PUT', `/listings/${id}`, hal.token, changed);
    expect(await api.read(`/listings/${id}`, hal.token)).toMatchObject({ ...changed, status: 'draft' });
    expect(await api.refused('PUT', `/listings/${id}`, hal.token, { ...changed, capacity: 0 })).toBe(true);

    await api.done('POST', `/listings/${id}/archive`, hal.token);
    expect((await api.read(`/listings/${id}`, hal.token)).status).toBe('archived');
  }, 60000);

  it("lists a host's own listings, whatever their state, the most recently created first", async () => {
    const hal = await api.host('hal5@listings.test');
    const ian = await api.host('ian5@listings.test');
    const first = await api.create('/listings', hal.token, { ...description, title: 'First' });
    await sleep(1100);
    const second = await api.create('/listings', hal.token, { ...description, title: 'Second' });
    await api.done('POST', `/listings/${second}/publish`, hal.token);
    await sleep(1100);
    const third = await api.create('/listings', hal.token, { ...description, title: 'Third' });
    await api.done('POST', `/listings/${third}/archive`, hal.token);
    await api.create('/listings', ian.token, { ...description, title: 'Not hal' });

    const mine = await api.list('/listings/mine', hal.token);
    expect(mine.map(each => each.id)).toEqual([third, second, first]);
    expect(mine.map(each => each.status)).toEqual(['archived', 'published', 'draft']);
  }, 60000);
});
