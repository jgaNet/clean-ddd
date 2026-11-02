import { client, Client, database, day, Running, start, stop } from './openstay';

/** The defect report after request 24: the routes under `/hosts/me` reach only the listings the caller hosts. */
const db = database('own-routes');
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

const nights = async (id: string, from: number, to: number) =>
  (await api.list(`/listings/${id}/calendar?from=${day(from)}&to=${day(to)}`)).map(each => each.available);

describe("the host's own routes", () => {
  it("refuse a manager on the owner's listings, who still changes them one by one", async () => {
    const hal = await api.host('hal@own-routes.test');
    const mia = await api.host('mia@own-routes.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const listing = await api.listing(hal.token);
    await api.done('POST', `/listings/${listing}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });

    expect(
      await api.refused('POST', '/hosts/me/block', mia.token, { listingIds: [listing], from: day(10), to: day(12) }),
    ).toBe(true);
    expect(
      await api.refused('POST', '/hosts/me/seasonal-prices', mia.token, {
        listingIds: [listing],
        from: day(10),
        to: day(12),
        nightlyPrice: 15000,
      }),
    ).toBe(true);
    expect(await nights(listing, 10, 12)).toEqual([true, true]);
    expect((await api.list(`/listings/${listing}/prices?from=${day(10)}&to=${day(11)}`))[0].nightlyPrice).toBe(10000);

    await api.done('POST', `/listings/${listing}/block`, mia.token, { from: day(10), to: day(11) });
    await api.done('POST', `/listings/${listing}/seasonal-prices`, mia.token, {
      from: day(11),
      to: day(12),
      nightlyPrice: 15000,
    });
    expect(await nights(listing, 10, 12)).toEqual([false, true]);
    await api.done('POST', '/hosts/me/block', hal.token, { listingIds: [listing], from: day(20), to: day(21) });
    expect(await nights(listing, 20, 21)).toEqual([false]);
  }, 60000);
});
