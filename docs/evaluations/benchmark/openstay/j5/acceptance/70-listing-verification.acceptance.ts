import { adminEnvironment, client, Client, database, eventually, Json, Running, sleep, start, stop } from './openstay';

/**
 * Request 70: an administrator verifies a listing, which then reads verified everywhere it shows, until
 * its city or its location changes; each verification is an entry of the audit log, and nothing in
 * search follows from it.
 */
const db = database('listing-verification');
let server: Running;
let api: Client;
type Person = { id: string; email: string; token: string };
let ada: Person;
let bob: Person;
let hal: Person;
let tom: Person;
beforeAll(async () => {
  server = await start(db.path, {
    JOBS_INTERVAL_SECONDS: '1',
    ...adminEnvironment('ada@verify.test', 'bob@verify.test'),
  });
  api = client(server.port);
  ada = await api.admin('ada@verify.test');
  bob = await api.admin('bob@verify.test');
  hal = await api.host('hal@verify.test');
  tom = await api.traveller('tom@verify.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const description = {
  title: 'A room with a view',
  city: 'Lyon',
  capacity: 2,
  nightlyPrice: 10000,
  cleaningFee: 2000,
  cancellationPolicy: 'flexible',
};
const verify = (id: string, admin = ada, note = 'Address checked against a utility bill.') =>
  api.done('POST', `/admin/listings/${id}/verify`, admin.token, { note });
const page = (id: string, token = hal.token) => api.read(`/listings/${id}`, token);
const verification = (listing: Json) => ({ verified: listing.verified, verifiedAt: listing.verifiedAt });
const NOT_VERIFIED = { verified: false, verifiedAt: null };
const inSearch = async (city: string, id: string) =>
  (await api.list(`/listings?city=${city}`)).find(each => each.id === id) as Json;
const inMine = async (id: string, token = hal.token) =>
  (await api.list('/listings/mine', token)).find(each => each.id === id) as Json;

describe('listing verification', () => {
  it('reads a listing never verified as not verified, everywhere it shows', async () => {
    const id = await api.listing(hal.token, { city: 'Plainville' });
    expect(verification(await page(id, tom.token))).toEqual(NOT_VERIFIED);
    expect(verification(await inSearch('Plainville', id))).toEqual(NOT_VERIFIED);
    expect(verification(await inMine(id))).toEqual(NOT_VERIFIED);
  }, 60000);

  it('verifies a listing with a note, and shows it verified, and when, on its page, in search and in the host’s list', async () => {
    const id = await api.listing(hal.token, { city: 'Verifyville' });
    const from = Date.now();
    await verify(id, ada, 'x'.repeat(500));
    const to = Date.now();
    const read = await page(id, tom.token);
    expect(read).toMatchObject({ verified: true, verifiedAt: expect.any(String) });
    const at = Date.parse(String(read.verifiedAt));
    expect(at).toBeGreaterThanOrEqual(from - 1000);
    expect(at).toBeLessThanOrEqual(to + 1000);
    expect(verification(await inSearch('Verifyville', id))).toEqual(verification(read));
    expect(verification(await inMine(id))).toEqual(verification(read));

    // Any listing not archived: a draft, a suspended one.
    const draft = await api.listing(hal.token, { city: 'Verifyville' }, false);
    await verify(draft);
    expect(await page(draft)).toMatchObject({ status: 'draft', verified: true, verifiedAt: expect.any(String) });
    const suspended = await api.listing(hal.token, { city: 'Verifyville' });
    await api.done('POST', `/listings/${suspended}/suspend`, hal.token);
    await verify(suspended, bob);
    expect(await page(suspended)).toMatchObject({ status: 'suspended', verified: true });
  }, 60000);

  it('refuses anyone but an administrator, a listing verified already or archived, and a note out of bounds', async () => {
    const id = await api.listing(hal.token, { city: 'Refuseville' });
    for (const person of [tom, hal])
      expect(await api.refused('POST', `/admin/listings/${id}/verify`, person.token, { note: 'Looks fine' })).toBe(
        true,
      );
    expect(await api.refused('POST', `/admin/listings/${id}/verify`, ada.token, { note: '' })).toBe(true);
    expect(await api.refused('POST', `/admin/listings/${id}/verify`, ada.token, { note: 'x'.repeat(501) })).toBe(true);
    expect(verification(await page(id))).toEqual(NOT_VERIFIED);

    await verify(id);
    const verifiedAt = (await page(id)).verifiedAt;
    expect(await api.refused('POST', `/admin/listings/${id}/verify`, bob.token, { note: 'Again' })).toBe(true);
    expect(await page(id)).toMatchObject({ verified: true, verifiedAt });

    const archived = await api.listing(hal.token, { city: 'Refuseville' });
    await api.done('POST', `/listings/${archived}/archive`, hal.token);
    expect(await api.refused('POST', `/admin/listings/${archived}/verify`, ada.token, { note: 'Checked' })).toBe(true);
    expect(verification(await page(archived))).toEqual(NOT_VERIFIED);
    expect(await api.refused('POST', '/admin/listings/no-such-listing/verify', ada.token, { note: 'Checked' })).toBe(
      true,
    );
  }, 60000);

  it('keeps the verification through the same city, the same location, and any other change', async () => {
    const id = await api.listing(hal.token, { city: 'Keepville' });
    await api.done('PUT', `/listings/${id}/location`, hal.token, { latitude: 45.75, longitude: 4.85 });
    await verify(id);
    const verified = verification(await page(id));
    expect(verified).toMatchObject({ verified: true });

    await api.done('PUT', `/listings/${id}`, hal.token, {
      ...description,
      city: 'Keepville',
      title: 'A brighter room',
      nightlyPrice: 12000,
    });
    await api.done('PUT', `/listings/${id}/location`, hal.token, { latitude: 45.75, longitude: 4.85 });
    await api.done('POST', `/listings/${id}/suspend`, hal.token);
    await api.done('POST', `/listings/${id}/publish`, hal.token);
    expect(await page(id)).toMatchObject({ title: 'A brighter room', status: 'published', ...verified });
  }, 60000);

  it('undoes it when the city or the location changes, by the host or a manager, until verified again', async () => {
    const mia = await api.host('mia@verify.test');
    const id = await api.listing(hal.token, { city: 'Moveville' });
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal Rooms' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('PUT', `/listings/${id}/location`, hal.token, { latitude: 45.75, longitude: 4.85 });

    await verify(id);
    await api.done('PUT', `/listings/${id}`, hal.token, { ...description, city: 'Moveville-Est' });
    expect(verification(await page(id))).toEqual(NOT_VERIFIED);
    expect(verification(await inSearch('Moveville-Est', id))).toEqual(NOT_VERIFIED);
    expect(verification(await inMine(id))).toEqual(NOT_VERIFIED);

    await verify(id);
    await api.done('PUT', `/listings/${id}/location`, mia.token, { latitude: 45.76, longitude: 4.85 });
    expect(verification(await page(id))).toEqual(NOT_VERIFIED);

    await verify(id, bob);
    await api.done('PUT', `/listings/${id}`, mia.token, { ...description, city: 'Moveville' });
    expect(verification(await page(id))).toEqual(NOT_VERIFIED);
    await verify(id);
    expect(await page(id)).toMatchObject({ verified: true, verifiedAt: expect.any(String) });
  }, 60000);

  it('changes nothing in search: the same listings, in the same order', async () => {
    const cheap = await api.listing(hal.token, { city: 'Orderville', nightlyPrice: 9000 });
    const dear = await api.listing(hal.token, { city: 'Orderville', nightlyPrice: 15000 });
    const before = (await api.list('/listings?city=Orderville')).map(each => each.id);
    expect(before).toEqual([cheap, dear]);
    await verify(dear);
    expect((await api.list('/listings?city=Orderville')).map(each => each.id)).toEqual(before);
  }, 60000);

  it('writes each verification in the audit log, and nothing when an address change undoes it', async () => {
    const id = await api.listing(hal.token, { city: 'Auditville' });
    await verify(id, ada, 'Checked the address on site.');
    await sleep(1100);
    await api.done('PUT', `/listings/${id}`, hal.token, { ...description, city: 'Auditville-Nord' });
    await sleep(1100);
    await verify(id, bob, 'Checked the new address.');
    const entries = await eventually(
      () => api.list(`/admin/audit?subjectId=${id}`, ada.token),
      found => found.length >= 2,
      10000,
    );
    expect(entries).toEqual([
      expect.objectContaining({
        adminId: ada.id,
        action: 'listing-verified',
        subjectId: id,
        note: 'Checked the address on site.',
        at: expect.any(String),
      }),
      expect.objectContaining({
        adminId: bob.id,
        action: 'listing-verified',
        subjectId: id,
        note: 'Checked the new address.',
      }),
    ]);
    // A refused verification writes nothing either.
    expect(await api.refused('POST', `/admin/listings/${id}/verify`, ada.token, { note: 'Again' })).toBe(true);
    await sleep(2000);
    expect(await api.list(`/admin/audit?subjectId=${id}`, bob.token)).toHaveLength(2);
  }, 60000);
});
