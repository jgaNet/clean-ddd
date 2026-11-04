import { client, Client, database, Running, sleep, start, stop } from './openstay';

/** Request 23: organisations. */
const db = database('organisations');
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

describe('organisations', () => {
  it('holds the listings its owner moves into it, and shows which listing belongs to it', async () => {
    const hal = await api.host('hal@organisations.test');
    const moved = await api.listing(hal.token);
    await sleep(1100);
    const kept = await api.listing(hal.token);
    const first = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    await api.done('POST', `/listings/${moved}/move-to-organisation`, hal.token, { organisationId: first });

    expect((await api.read(`/listings/${moved}`)).organisationId).toBe(first);
    expect((await api.read(`/listings/${kept}`)).organisationId).toBeNull();
    expect(await api.read(`/organisations/${first}`, hal.token)).toMatchObject({
      id: first,
      name: 'Hal & Co',
      ownerId: hal.id,
      listingIds: [moved],
    });
    expect((await api.list('/listings/mine', hal.token)).map(each => each.id)).toEqual([kept, moved]);

    await sleep(1100);
    const second = await api.create('/organisations', hal.token, { name: 'Hal Holidays' });
    expect(
      await api.refused('POST', `/listings/${moved}/move-to-organisation`, hal.token, { organisationId: second }),
    ).toBe(true);
    expect((await api.read(`/listings/${moved}`)).organisationId).toBe(first);
    expect((await api.list('/organisations/mine', hal.token)).map(each => each.id)).toEqual([second, first]);
  }, 60000);

  it('refuses a blank or long name, and gives nobody else anything', async () => {
    const hal = await api.host('hal2@organisations.test');
    const ian = await api.host('ian2@organisations.test');
    expect(await api.refused('POST', '/organisations', hal.token, { name: '   ' })).toBe(true);
    expect(await api.refused('POST', '/organisations', hal.token, { name: 'x'.repeat(101) })).toBe(true);
    expect(await api.create('/organisations', hal.token, { name: 'x'.repeat(100) })).toEqual(expect.any(String));

    const halsOrganisation = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const halsListing = await api.listing(hal.token);
    const iansListing = await api.listing(ian.token);
    expect(await api.hidden(`/organisations/${halsOrganisation}`, ian.token)).toBe(true);
    expect(
      await api.refused('POST', `/listings/${iansListing}/move-to-organisation`, ian.token, {
        organisationId: halsOrganisation,
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/listings/${halsListing}/move-to-organisation`, ian.token, {
        organisationId: halsOrganisation,
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/listings/${iansListing}/move-to-organisation`, hal.token, {
        organisationId: halsOrganisation,
      }),
    ).toBe(true);
    expect((await api.read(`/organisations/${halsOrganisation}`, hal.token)).listingIds).toEqual([]);
    expect(await api.list('/organisations/mine', ian.token)).toEqual([]);
  }, 60000);
});
