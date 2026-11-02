import { client, Client, database, day, Json, Running, start, stop } from './openstay';

/** Request 24: collaborators and permissions. The change not announced in advance. */
const db = database('collaborators');
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

const byAccount = (members: Json[]) =>
  members
    .map(each => ({ accountId: each.accountId, email: each.email, role: each.role }))
    .sort((a, b) => (String(a.accountId) < String(b.accountId) ? -1 : 1));

/** An owner, a manager, a viewer and an outsider, with a published listing and a draft in the organisation. */
async function anOrganisation(name: string) {
  const hal = await api.host(`hal@${name}.test`);
  const mia = await api.host(`mia@${name}.test`);
  const val = await api.host(`val@${name}.test`);
  const ian = await api.host(`ian@${name}.test`);
  const tom = await api.traveller(`tom@${name}.test`);
  const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
  const published = await api.listing(hal.token);
  const draft = await api.listing(hal.token, {}, false);
  const outside = await api.listing(hal.token);
  for (const id of [published, draft])
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });
  return { hal, mia, val, ian, tom, organisationId, published, draft, outside };
}

describe('collaborators', () => {
  it("lets a manager act on the organisation's listings as their host, and a viewer read them", async () => {
    const { hal, mia, val, ian, tom, organisationId, published, draft, outside } = await anOrganisation('roles');
    const block = (id: string, token: string, from = 10) =>
      api.refused('POST', `/listings/${id}/block`, token, { from: day(from), to: day(from + 1) });

    expect(await block(published, mia.token)).toBe(false);
    expect(await block(published, val.token, 11)).toBe(true);
    expect(await block(published, ian.token, 11)).toBe(true);
    expect(await block(outside, mia.token)).toBe(true);
    await api.done('PUT', `/listings/${draft}`, mia.token, {
      title: 'Renamed by the manager',
      city: 'Lyon',
      capacity: 2,
      nightlyPrice: 10000,
      cleaningFee: 2000,
      cancellationPolicy: 'flexible',
    });
    expect((await api.read(`/listings/${draft}`, val.token)).title).toBe('Renamed by the manager');
    expect(await api.hidden(`/listings/${draft}`, ian.token)).toBe(true);
    expect(await api.refused('POST', `/listings/${draft}/publish`, val.token)).toBe(true);

    await api.done('PUT', `/listings/${published}/booking-mode`, mia.token, { mode: 'request' });
    const requested = await api.book(tom.token, await api.quote(tom.token, published, day(20), day(22)));
    expect(await api.refused('POST', `/bookings/${requested}/accept`, val.token)).toBe(true);
    await api.done('POST', `/bookings/${requested}/accept`, mia.token);
    expect((await api.read(`/bookings/${requested}`, val.token)).status).toBe('confirmed');
    expect((await api.list(`/listings/${published}/bookings`, val.token)).map(each => each.id)).toEqual([requested]);
    expect(await api.hidden(`/bookings/${requested}`, ian.token)).toBe(true);
    expect((await api.list(`/bookings/${requested}/history`, val.token)).map(each => each.status)).toEqual([
      'requested',
      'confirmed',
    ]);
    await api.done('POST', `/bookings/${requested}/cancel`, mia.token);
    expect((await api.read(`/bookings/${requested}`, hal.token)).cancellation).toMatchObject({ by: 'host' });

    const declined = await api.book(tom.token, await api.quote(tom.token, published, day(30), day(32)));
    expect(await api.refused('POST', `/bookings/${declined}/decline`, val.token)).toBe(true);
    await api.done('POST', `/bookings/${declined}/decline`, mia.token);
    expect((await api.read(`/bookings/${declined}`, tom.token)).status).toBe('declined');

    // Membership of one organisation gives nothing over another's listings.
    const iansOrganisation = await api.create('/organisations', ian.token, { name: 'Ian & Co' });
    const iansListing = await api.listing(ian.token);
    await api.done('POST', `/listings/${iansListing}/move-to-organisation`, ian.token, {
      organisationId: iansOrganisation,
    });
    expect(await block(iansListing, mia.token)).toBe(true);

    for (const member of [mia, val])
      expect((await api.list('/listings/mine', member.token)).map(each => each.id).sort()).toEqual(
        [published, draft].sort(),
      );
    for (const reader of [hal, mia, val])
      expect(
        byAccount((await api.read(`/organisations/${organisationId}`, reader.token)).members as unknown as Json[]),
      ).toEqual(
        byAccount([
          { accountId: mia.id, email: mia.email, role: 'manager' },
          { accountId: val.id, email: val.email, role: 'viewer' },
        ]),
      );
    expect(await api.hidden(`/organisations/${organisationId}`, ian.token)).toBe(true);
  }, 90000);

  it('takes away at once what a member loses, and never makes the owner a member', async () => {
    const { hal, mia, val, ian, organisationId, published, draft } = await anOrganisation('changes');
    expect(
      await api.refused('POST', `/organisations/${organisationId}/members`, hal.token, {
        email: hal.email,
        role: 'manager',
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/organisations/${organisationId}/members`, mia.token, {
        email: ian.email,
        role: 'viewer',
      }),
    ).toBe(true);

    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'viewer' });
    expect(await api.refused('POST', `/listings/${published}/block`, mia.token, { from: day(10), to: day(11) })).toBe(
      true,
    );
    expect((await api.read(`/listings/${draft}`, mia.token)).id).toBe(draft);

    await api.done('POST', `/organisations/${organisationId}/members/${val.id}/remove`, hal.token);
    expect(await api.hidden(`/listings/${draft}`, val.token)).toBe(true);
    expect(await api.hidden(`/organisations/${organisationId}`, val.token)).toBe(true);
    expect(await api.list('/listings/mine', val.token)).toEqual([]);
    const members = (await api.read(`/organisations/${organisationId}`, hal.token)).members as unknown as Json[];
    expect(members.map(each => [each.accountId, each.role])).toEqual([[mia.id, 'viewer']]);
  }, 90000);
});
