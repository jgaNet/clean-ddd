import { client, Client, database, day, Running, sleep, start, stop } from './openstay';

/** Request 3: search, in the order the request states. */
const db = database('search');
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

describe('search', () => {
  it('finds published listings of a city that take the guests, cheapest first, then published first', async () => {
    const hal = await api.host('hal@search.test');
    const dear = await api.listing(hal.token, { title: 'Dear', city: 'Lyon', capacity: 2, nightlyPrice: 8000 });
    await sleep(1100);
    const early = await api.listing(hal.token, { title: 'Early', city: 'Lyon', capacity: 4, nightlyPrice: 5000 });
    await sleep(1100);
    const late = await api.listing(hal.token, { title: 'Late', city: 'Lyon', capacity: 4, nightlyPrice: 5000 });
    await api.listing(hal.token, { title: 'Draft', city: 'Lyon' }, false);
    await api.listing(hal.token, { title: 'Elsewhere', city: 'Paris' });
    const suspended = await api.listing(hal.token, { title: 'Suspended', city: 'Lyon' });
    await api.done('POST', `/listings/${suspended}/suspend`, hal.token);
    const archived = await api.listing(hal.token, { title: 'Archived', city: 'Lyon' });
    await api.done('POST', `/listings/${archived}/archive`, hal.token);

    const ids = async (query: string, token?: string) =>
      (await api.list(`/listings?${query}`, token)).map(each => each.id);
    expect(await ids('city=Lyon')).toEqual([early, late, dear]);
    expect(await ids('city=lYON')).toEqual([early, late, dear]);
    expect(await ids('city=Lyon&guests=3')).toEqual([early, late]);
    expect(await ids(`city=Lyon&checkIn=${day(10)}&checkOut=${day(12)}&guests=2`)).toEqual([early, late, dear]);
    expect(await ids('city=Lyon', hal.token)).toEqual([early, late, dear]);
    expect(await ids('city=Marseille')).toEqual([]);

    const [found] = await api.list(`/listings?city=Lyon&guests=4`);
    expect(found).toMatchObject({ id: early, hostId: hal.id, city: 'Lyon', capacity: 4, nightlyPrice: 5000 });
  }, 60000);

  it('refuses a search that makes no sense', async () => {
    const status = async (query: string) => (await api.call('GET', `/listings?${query}`)).status;
    expect(await status('')).toBe(400);
    expect(await status(`city=Lyon&checkIn=${day(10)}&checkOut=${day(10)}`)).toBe(400);
    expect(await status(`city=Lyon&checkIn=${day(12)}&checkOut=${day(10)}`)).toBe(400);
    expect(await status(`city=Lyon&checkIn=${day(10)}`)).toBe(400);
    expect(await status('city=Lyon&guests=0')).toBe(400);
  }, 60000);
});
