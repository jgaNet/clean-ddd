import { client, Client, database, Running, start, stop } from './openstay';

/** Request 12: search filters, and the order unchanged. */
const db = database('filters');
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

describe('search filters', () => {
  it('filters by the highest nightly price, amenities and pets, and keeps the order', async () => {
    const hal = await api.host('hal@filters.test');
    const placed = async (nightlyPrice: number, amenities: string[], pets: boolean) => {
      const id = await api.listing(hal.token, { city: 'Toulouse', nightlyPrice });
      await api.done('PUT', `/listings/${id}/amenities`, hal.token, { amenities });
      await api.done('PUT', `/listings/${id}/house-rules`, hal.token, {
        pets,
        smoking: false,
        events: false,
        checkInFrom: '15:00',
        checkOutBefore: '11:00',
      });
      return id;
    };
    const a = await placed(8000, ['wifi', 'kitchen'], true);
    const b = await placed(6000, ['wifi'], false);
    const c = await placed(12000, ['kitchen'], true);

    const ids = async (query: string) => (await api.list(`/listings?city=Toulouse${query}`)).map(each => each.id);
    expect(await ids('')).toEqual([b, a, c]);
    expect(await ids('&maxPrice=9000')).toEqual([b, a]);
    expect(await ids('&maxPrice=8000')).toEqual([b, a]);
    expect(await ids('&amenities=wifi')).toEqual([b, a]);
    expect(await ids('&amenities=wifi,kitchen')).toEqual([a]);
    expect(await ids('&pets=true')).toEqual([a, c]);
    expect(await ids('&maxPrice=10000&pets=true&amenities=kitchen')).toEqual([a]);
  }, 60000);

  it('refuses a filter that makes no sense', async () => {
    const status = async (query: string) => (await api.call('GET', `/listings?city=Toulouse${query}`)).status;
    expect(await status('&maxPrice=-1')).toBe(400);
    expect(await status('&amenities=sauna')).toBe(400);
    expect(await status('&amenities=wifi,sauna')).toBe(400);
  }, 60000);
});
