import { client, Client, database, Running, sleep, start, stop } from './openstay';

/** Request 13: favourites. */
const db = database('favourites');
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

describe('favourites', () => {
  it('saves and removes favourites, the most recently saved first, and keeps one no longer bookable with its state', async () => {
    const hal = await api.host('hal@favourites.test');
    const tom = await api.traveller('tom@favourites.test');
    const una = await api.traveller('una@favourites.test');
    const first = await api.listing(hal.token, { title: 'First' });
    const second = await api.listing(hal.token, { title: 'Second' });

    await api.done('POST', `/listings/${first}/favourite`, tom.token);
    await sleep(1100);
    await api.done('POST', `/listings/${second}/favourite`, tom.token);
    await api.done('POST', `/listings/${first}/favourite`, tom.token);
    const saved = await api.list('/favourites', tom.token);
    expect(saved.map(each => each.id)).toEqual([second, first]);
    expect(saved[1]).toMatchObject({
      id: first,
      title: 'First',
      city: 'Lyon',
      nightlyPrice: 10000,
      status: 'published',
    });

    await api.done('POST', `/listings/${first}/suspend`, hal.token);
    expect((await api.list('/favourites', tom.token)).map(each => [each.id, each.status])).toEqual([
      [second, 'published'],
      [first, 'suspended'],
    ]);
    await api.done('POST', `/listings/${second}/unfavourite`, tom.token);
    await api.done('POST', `/listings/${second}/unfavourite`, tom.token);
    expect((await api.list('/favourites', tom.token)).map(each => each.id)).toEqual([first]);
    expect(await api.list('/favourites', una.token)).toEqual([]);
  }, 60000);

  it('refuses a listing that cannot be seen, and anyone not signed in', async () => {
    const hal = await api.host('hal2@favourites.test');
    const tom = await api.traveller('tom2@favourites.test');
    const draft = await api.listing(hal.token, {}, false);
    const published = await api.listing(hal.token);
    expect(await api.refused('POST', `/listings/${draft}/favourite`, tom.token)).toBe(true);
    expect(await api.refused('POST', '/listings/no-such-listing/favourite', tom.token)).toBe(true);
    expect(await api.refused('POST', `/listings/${published}/favourite`)).toBe(true);
    expect(await api.list('/favourites', tom.token)).toEqual([]);
  }, 60000);
});
