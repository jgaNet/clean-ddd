import { adminEnvironment, client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 84: a listing's country, `FR` until given, shown wherever the listing is, undoing a verification. */
const db = database('countries');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, adminEnvironment('ada@countries.test'));
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const description = (fields: Json = {}) => ({
  title: 'A room with a view',
  city: 'Lyon',
  capacity: 2,
  nightlyPrice: 10000,
  cleaningFee: 2000,
  cancellationPolicy: 'flexible',
  ...fields,
});
/** A listing created with `fields` (a `country` among them, or not), published unless said otherwise. */
async function listing(token: string, fields: Json = {}, publish = true) {
  const id = await api.create('/listings', token, description(fields));
  if (publish) await api.done('POST', `/listings/${id}/publish`, token);
  return id;
}
const countryOf = async (id: string, token?: string) => (await api.read(`/listings/${id}`, token)).country;

describe('countries', () => {
  it('puts a listing in FR unless the host gives a country, and shows it on the listing, in search and in the host list', async () => {
    const hal = await api.host('hal@countries.test');
    const plain = await listing(hal.token, { city: 'Basel' });
    const swiss = await listing(hal.token, { city: 'Basel', country: 'CH', nightlyPrice: 9000 });
    const draft = await listing(hal.token, { city: 'Basel', country: 'DE' }, false);
    expect(await countryOf(plain)).toBe('FR');
    expect(await countryOf(swiss)).toBe('CH');
    expect(await countryOf(draft, hal.token)).toBe('DE');

    const found = await api.list('/listings?city=Basel');
    expect(found).toEqual([
      expect.objectContaining({ id: swiss, country: 'CH' }),
      expect.objectContaining({ id: plain, country: 'FR' }),
    ]);
    const mine = await api.list('/listings/mine', hal.token);
    expect(mine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: plain, country: 'FR' }),
        expect.objectContaining({ id: swiss, country: 'CH' }),
        expect.objectContaining({ id: draft, country: 'DE' }),
      ]),
    );

    for (const country of ['ch', 'Ch', 'XX', 'FRA', 'F', 'CA', '', 42]) {
      expect(await api.refused('POST', '/listings', hal.token, description({ country }))).toBe(true);
      expect(await api.refused('PUT', `/listings/${plain}/country`, hal.token, { country })).toBe(true);
    }
    expect(await countryOf(plain)).toBe('FR');
    for (const country of ['AT', 'BE', 'CH', 'DE', 'ES', 'FR', 'GB', 'IE', 'IT', 'JP', 'LU', 'NL', 'PT', 'US']) {
      await api.done('PUT', `/listings/${draft}/country`, hal.token, { country });
      expect(await countryOf(draft, hal.token)).toBe(country);
    }
  }, 90000);

  it("lets the host and the organisation's managers set it, nobody else, and nothing on an archived listing", async () => {
    const hal = await api.host('hal2@countries.test');
    const mia = await api.host('mia2@countries.test');
    const val = await api.host('val2@countries.test');
    const ian = await api.host('ian2@countries.test');
    const tom = await api.traveller('tom2@countries.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const id = await listing(hal.token);
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });

    await api.done('PUT', `/listings/${id}/country`, hal.token, { country: 'ES' });
    expect(await countryOf(id)).toBe('ES');
    await api.done('PUT', `/listings/${id}/country`, mia.token, { country: 'PT' });
    expect(await countryOf(id)).toBe('PT');
    for (const token of [val.token, ian.token, tom.token, undefined])
      expect(await api.refused('PUT', `/listings/${id}/country`, token, { country: 'IT' })).toBe(true);
    expect(await countryOf(id)).toBe('PT');

    await api.done('POST', `/listings/${id}/archive`, hal.token);
    expect(await api.refused('PUT', `/listings/${id}/country`, hal.token, { country: 'IT' })).toBe(true);
    expect(await countryOf(id, hal.token)).toBe('PT');
  }, 90000);

  it('makes a verified listing unverified when its country changes, and keeps it when the same country is sent', async () => {
    const ada = await api.admin('ada@countries.test');
    const hal = await api.host('hal3@countries.test');
    const id = await listing(hal.token, { country: 'BE' });
    await api.done('POST', `/admin/listings/${id}/verify`, ada.token, { note: 'Visited the flat in Brussels' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ country: 'BE', verified: true });

    await api.done('PUT', `/listings/${id}/country`, hal.token, { country: 'BE' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ country: 'BE', verified: true });
    await api.done('PUT', `/listings/${id}/country`, hal.token, { country: 'NL' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ country: 'NL', verified: false, verifiedAt: null });

    await api.done('POST', `/admin/listings/${id}/verify`, ada.token, { note: 'Visited the flat in Amsterdam' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ country: 'NL', verified: true });
  }, 60000);

  it('changes nothing else: search still matches the city, a description leaves the country, quotes are as before', async () => {
    const hal = await api.host('hal4@countries.test');
    const ian = await api.host('ian4@countries.test');
    const tom = await api.traveller('tom4@countries.test');
    const french = await listing(hal.token, { city: 'Paris', nightlyPrice: 15000 });
    const texan = await listing(ian.token, { city: 'Paris', country: 'US', nightlyPrice: 11000 });
    expect((await api.list('/listings?city=paris')).map(each => [each.id, each.country])).toEqual([
      [texan, 'US'],
      [french, 'FR'],
    ]);

    await api.done('PUT', `/listings/${french}/country`, hal.token, { country: 'IT' });
    await api.done('PUT', `/listings/${french}`, hal.token, description({ city: 'Paris', nightlyPrice: 15000 }));
    expect(await countryOf(french)).toBe('IT');

    const quoteId = await api.quote(tom.token, texan, day(10), day(12));
    expect(await api.read(`/quotes/${quoteId}`, tom.token)).toMatchObject({
      listingId: texan,
      nights: 2,
      total: 24000,
    });
    const bookingId = await api.book(tom.token, quoteId);
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ total: 24000, status: 'confirmed' });
  }, 60000);
});
