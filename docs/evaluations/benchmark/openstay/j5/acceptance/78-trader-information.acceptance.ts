import { client, Client, database, Running, start, stop } from './openstay';

/**
 * Request 78: a host gives their trader information and is professional, clears it and is private
 * again; every listing they host, organisation listings included, shows it as it is now.
 */
const db = database('trader-information');
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

const PATH = '/hosts/me/trader';
const TRADER = {
  legalName: 'Hal Lettings SARL',
  registrationNumber: '812 345 678 RCS Lyon',
  address: '3 rue de la République, 69002 Lyon',
};
const traderOn = async (listingId: string, token?: string) => (await api.read(`/listings/${listingId}`, token)).trader;

describe('trader information', () => {
  it('shows a host private until they give it, then on every listing they host, to anyone who sees it, at once', async () => {
    const hal = await api.host('hal@trader-information.test');
    const tom = await api.traveller('tom@trader-information.test');
    const published = await api.listing(hal.token, { city: 'Lyon' });
    const draft = await api.listing(hal.token, { city: 'Lyon' }, false);
    expect((await api.call('GET', PATH, hal.token)).status).toBe(404);
    expect(await traderOn(published)).toBeNull();
    expect(await traderOn(draft, hal.token)).toBeNull();

    await api.done('PUT', PATH, hal.token, TRADER);
    expect(await api.read(PATH, hal.token)).toMatchObject(TRADER);
    expect(await traderOn(published)).toEqual(expect.objectContaining(TRADER));
    expect(await traderOn(published, tom.token)).toEqual(expect.objectContaining(TRADER));
    expect(await traderOn(draft, hal.token)).toEqual(expect.objectContaining(TRADER));

    // Given again, it replaces the first, on every listing at once.
    const moved = {
      legalName: 'Hal Lettings SAS',
      registrationNumber: '912 000 111 RCS Lyon',
      address: '8 quai Saint-Antoine, 69002 Lyon',
    };
    await api.done('PUT', PATH, hal.token, moved);
    expect(await api.read(PATH, hal.token)).toMatchObject(moved);
    expect(await traderOn(published, tom.token)).toEqual(expect.objectContaining(moved));
    expect(await traderOn(draft, hal.token)).toEqual(expect.objectContaining(moved));
    // A listing made afterwards shows it too.
    expect(await traderOn(await api.listing(hal.token, { city: 'Lyon' }))).toEqual(expect.objectContaining(moved));
  }, 60000);

  it('makes the host private again when they clear it', async () => {
    const ian = await api.host('ian@trader-information.test');
    const listingId = await api.listing(ian.token, { city: 'Vienne' });
    await api.done('PUT', PATH, ian.token, TRADER);
    expect(await traderOn(listingId)).toEqual(expect.objectContaining(TRADER));
    await api.done('POST', `${PATH}/clear`, ian.token);
    expect((await api.call('GET', PATH, ian.token)).status).toBe(404);
    expect(await traderOn(listingId)).toBeNull();
    await api.done('PUT', PATH, ian.token, TRADER);
    expect(await traderOn(listingId)).toEqual(expect.objectContaining(TRADER));
  }, 60000);

  it('refuses a field empty, of spaces or too long, and an account that is not a host, and keeps what was given', async () => {
    const joe = await api.host('joe@trader-information.test');
    const tom = await api.traveller('tom2@trader-information.test');
    const listingId = await api.listing(joe.token, { city: 'Lyon' });
    await api.done('PUT', PATH, joe.token, TRADER);
    for (const change of [
      { legalName: '' },
      { legalName: '   ' },
      { legalName: 'x'.repeat(201) },
      { registrationNumber: '' },
      { registrationNumber: '  ' },
      { registrationNumber: 'x'.repeat(51) },
      { address: '' },
      { address: '    ' },
      { address: 'x'.repeat(501) },
    ])
      expect(await api.refused('PUT', PATH, joe.token, { ...TRADER, legalName: 'Joe Lets', ...change })).toBe(true);
    expect(await api.read(PATH, joe.token)).toMatchObject(TRADER);
    expect(await traderOn(listingId)).toEqual(expect.objectContaining(TRADER));

    const longest = { legalName: 'x'.repeat(200), registrationNumber: 'y'.repeat(50), address: 'z'.repeat(500) };
    await api.done('PUT', PATH, joe.token, longest);
    expect(await traderOn(listingId)).toEqual(expect.objectContaining(longest));

    expect(await api.refused('PUT', PATH, tom.token, TRADER)).toBe(true);
    expect(await api.refused('PUT', PATH, undefined, TRADER)).toBe(true);
    expect((await api.call('GET', PATH, tom.token)).status).not.toBe(200);
  }, 60000);

  it("shows the host's information on an organisation's listings, never a member's", async () => {
    const kim = await api.host('kim@trader-information.test');
    const mia = await api.host('mia@trader-information.test');
    const listingId = await api.listing(kim.token, { city: 'Annecy' });
    const organisationId = await api.create('/organisations', kim.token, { name: 'Kim Lets' });
    await api.done('POST', `/listings/${listingId}/move-to-organisation`, kim.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, kim.token, {
      email: mia.email,
      role: 'manager',
    });

    // A professional manager does not make the owner's listing professional.
    const hers = {
      legalName: 'Mia Conciergerie',
      registrationNumber: 'FR-998877',
      address: '1 place du Marché, Annecy',
    };
    await api.done('PUT', PATH, mia.token, hers);
    expect(await traderOn(listingId)).toBeNull();

    await api.done('PUT', PATH, kim.token, TRADER);
    expect(await traderOn(listingId)).toEqual(expect.objectContaining(TRADER));
    expect(await traderOn(listingId, mia.token)).toEqual(expect.objectContaining(TRADER));
    await api.done('POST', `${PATH}/clear`, kim.token);
    expect(await traderOn(listingId)).toBeNull();
  }, 60000);
});
