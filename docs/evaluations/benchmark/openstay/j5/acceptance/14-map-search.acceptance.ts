import { client, Client, database, Running, start, stop } from './openstay';

/** Request 14: search on a map. */
const db = database('map');
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

describe('search on a map', () => {
  it('finds the listings placed inside a box, edges included, and never one with no location', async () => {
    const hal = await api.host('hal@map.test');
    const placed = async (city: string, latitude: number, longitude: number) => {
      const id = await api.listing(hal.token, { city });
      await api.done('PUT', `/listings/${id}/location`, hal.token, { latitude, longitude });
      return id;
    };
    const centre = await placed('Paris', 48.8566, 2.3522);
    const edge = await placed('Paris', 48.9, 2.4);
    await placed('Lyon', 45.76, 4.84);
    const nowhere = await api.listing(hal.token, { city: 'Paris' });
    expect((await api.read(`/listings/${nowhere}`)).location).toBeNull();
    expect((await api.read(`/listings/${centre}`)).location).toEqual({ latitude: 48.8566, longitude: 2.3522 });

    const ids = async (query: string) => (await api.list(`/listings?${query}`)).map(each => each.id).sort();
    expect(await ids('south=48.8&west=2.3&north=48.9&east=2.4')).toEqual([centre, edge].sort());
    expect(await ids('south=48.8&west=2.3&north=48.88&east=2.38')).toEqual([centre]);
    expect(await ids('city=Paris&south=48.8&west=2.3&north=48.88&east=2.38')).toEqual([centre]);
    expect(await ids('south=40&west=-5&north=41&east=-4')).toEqual([]);
  }, 60000);

  it('refuses a search with no city and no area, a box upside down, a coordinate out of range', async () => {
    const hal = await api.host('hal2@map.test');
    const id = await api.listing(hal.token, { city: 'Paris' });
    const status = async (query: string) => (await api.call('GET', `/listings?${query}`)).status;
    expect(await status('')).toBe(400);
    expect(await status('south=49&west=2.3&north=48&east=2.4')).toBe(400);
    expect(await status('south=48&west=2.4&north=49&east=2.3')).toBe(400);
    expect(await status('south=-91&west=2.3&north=48&east=2.4')).toBe(400);
    expect(await api.refused('PUT', `/listings/${id}/location`, hal.token, { latitude: 91, longitude: 0 })).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/location`, hal.token, { latitude: 0, longitude: 181 })).toBe(true);
  }, 60000);
});
