import { client, Client, database, day, Running, start, stop } from './openstay';

/**
 * Request 63: a listing reported by a signed-in account that can see it, never by its host or its
 * organisation; one open report per account and listing, even at the same moment on two servers; and
 * nothing changes by itself.
 */
const db = database('reporting-a-listing');
let server: Running;
let other: Running;
let api: Client;
let otherApi: Client;
beforeAll(async () => {
  server = await start(db.path);
  other = await start(db.path);
  api = client(server.port);
  otherApi = client(other.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await stop(other);
  db.remove();
});

const report = (id: string, token: string | undefined, body: unknown) => api.act('POST', `/listings/${id}/report`, token, body);

describe('reporting a listing', () => {
  it('takes a report from a signed-in account, for each reason of the list, with or without details', async () => {
    const hal = await api.host('hal@report-listing.test');
    const id = await api.listing(hal.token, { city: 'Reportville' });
    const reasons = ['inaccurate', 'scam', 'offensive', 'unsafe', 'other'];
    for (const [n, reason] of reasons.entries()) {
      const tom = await api.traveller(`tom${n}@report-listing.test`);
      expect(await api.create(`/listings/${id}/report`, tom.token, { reason })).toEqual(expect.any(String));
    }
    const una = await api.traveller('una@report-listing.test');
    expect(
      await api.create(`/listings/${id}/report`, una.token, { reason: 'scam', details: 'x'.repeat(1000) }),
    ).toEqual(expect.any(String));
    // A host may report another host's listing.
    const ian = await api.host('ian@report-listing.test');
    expect(await api.create(`/listings/${id}/report`, ian.token, { reason: 'unsafe', details: 'No smoke alarm.' })).toEqual(
      expect.any(String),
    );
  }, 60000);

  it('refuses a reason outside the list, details over 1,000 characters, and anyone not signed in', async () => {
    const hal = await api.host('hal2@report-listing.test');
    const tom = await api.traveller('tom2@report-listing.test');
    const id = await api.listing(hal.token, { city: 'Reportville' });
    expect((await report(id, tom.token, { reason: 'spam' })).accepted).toBe(false);
    expect((await report(id, tom.token, { reason: 'fraud' })).accepted).toBe(false);
    expect((await report(id, tom.token, {})).accepted).toBe(false);
    expect((await report(id, tom.token, { reason: 'scam', details: 'x'.repeat(1001) })).accepted).toBe(false);
    expect((await api.call('POST', `/listings/${id}/report`, undefined, { reason: 'scam' })).status).toBe(401);
    // None of the refusals counted as the account's open report.
    expect(await api.create(`/listings/${id}/report`, tom.token, { reason: 'scam' })).toEqual(expect.any(String));
  }, 60000);

  it('refuses a listing the account cannot see: a draft, a suspended or an archived one, or none', async () => {
    const hal = await api.host('hal3@report-listing.test');
    const tom = await api.traveller('tom3@report-listing.test');
    const draft = await api.listing(hal.token, { city: 'Reportville' }, false);
    const suspended = await api.listing(hal.token, { city: 'Reportville' });
    await api.done('POST', `/listings/${suspended}/suspend`, hal.token);
    const archived = await api.listing(hal.token, { city: 'Reportville' });
    await api.done('POST', `/listings/${archived}/archive`, hal.token);
    for (const id of [draft, suspended, archived, 'no-such-listing'])
      expect((await report(id, tom.token, { reason: 'scam' })).accepted).toBe(false);
  }, 60000);

  it('refuses the host, and the managers and viewers of its organisation', async () => {
    const hal = await api.host('hal4@report-listing.test');
    const mia = await api.host('mia4@report-listing.test');
    const vic = await api.traveller('vic4@report-listing.test');
    const tom = await api.traveller('tom4@report-listing.test');
    const id = await api.listing(hal.token, { city: 'Reportville' });
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
    for (const token of [hal.token, mia.token, vic.token])
      expect((await report(id, token, { reason: 'scam' })).accepted).toBe(false);
    expect(await api.create(`/listings/${id}/report`, tom.token, { reason: 'inaccurate' })).toEqual(expect.any(String));
  }, 60000);

  it('refuses a second report by the same account while the first is open, and takes other accounts', async () => {
    const hal = await api.host('hal5@report-listing.test');
    const tom = await api.traveller('tom5@report-listing.test');
    const una = await api.traveller('una5@report-listing.test');
    const id = await api.listing(hal.token, { city: 'Reportville' });
    const other = await api.listing(hal.token, { city: 'Reportville' });
    await api.create(`/listings/${id}/report`, tom.token, { reason: 'scam' });
    expect((await report(id, tom.token, { reason: 'scam' })).accepted).toBe(false);
    expect((await report(id, tom.token, { reason: 'unsafe', details: 'Another reason' })).accepted).toBe(false);
    expect(await api.create(`/listings/${id}/report`, una.token, { reason: 'scam' })).toEqual(expect.any(String));
    // One open report per account and listing: another listing is another report.
    expect(await api.create(`/listings/${other}/report`, tom.token, { reason: 'other' })).toEqual(expect.any(String));
  }, 60000);

  it('changes nothing by itself: the listing is found, quoted and booked as before', async () => {
    const hal = await api.host('hal6@report-listing.test');
    const tom = await api.traveller('tom6@report-listing.test');
    const una = await api.traveller('una6@report-listing.test');
    const id = await api.listing(hal.token, { city: 'Untouchedville' });
    const before = await api.read(`/listings/${id}`);
    await api.create(`/listings/${id}/report`, tom.token, { reason: 'scam', details: 'Too good to be true.' });
    await api.create(`/listings/${id}/report`, una.token, { reason: 'inaccurate' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ id, status: 'published', title: before.title });
    expect((await api.list('/listings?city=Untouchedville')).map(each => each.id)).toEqual([id]);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ status: 'confirmed' });
  }, 60000);

  it('makes one open report of two sent at the same moment by one account, to one server or two', async () => {
    const hal = await api.host('hal7@report-listing.test');
    const id = await api.listing(hal.token, { city: 'Reportville' });
    for (const round of [0, 1, 2]) {
      const tom = await api.traveller(`tom7-${round}@report-listing.test`);
      // A token is used on the server that gave it.
      const there = await otherApi.login(tom.email);
      const outcomes = await Promise.all(
        [api, otherApi, api, otherApi].map(each =>
          each.act('POST', `/listings/${id}/report`, each === api ? tom.token : there, { reason: 'scam' }),
        ),
      );
      expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
      expect((await otherApi.act('POST', `/listings/${id}/report`, there, { reason: 'scam' })).accepted).toBe(false);
    }
  }, 90000);
});
