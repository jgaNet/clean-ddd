import { client, Client, database, eventually, Json, Running, start, stop } from './openstay';

/**
 * Request 52: unread messages. Each reader of a conversation has their own count of the messages others
 * sent since they last marked it read, per conversation and in all.
 */
const db = database('unread');
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

/** The caller's unread count of one conversation, from their list. */
const unreadIn = async (id: string, token: string) =>
  (await api.list('/conversations/mine', token)).find(each => each.id === id)?.unread;
const total = async (token: string) => (await api.read('/conversations/unread', token)).total;
/** Waits until the counts read what is expected: a count may follow a message just after its answer. */
const counts = (token: string, id: string, expected: number) =>
  eventually(
    async () => ({ unread: await unreadIn(id, token), total: await total(token) }),
    each => each.unread === expected,
  );

/** A host with a published listing in an organisation, a manager and a viewer of it, a traveller and an outsider. */
async function anOrganisation(name: string) {
  const hal = await api.host(`hal@${name}.test`);
  const mia = await api.host(`mia@${name}.test`);
  const vic = await api.host(`vic@${name}.test`);
  const tom = await api.traveller(`tom@${name}.test`);
  const una = await api.traveller(`una@${name}.test`);
  const listingId = await api.listing(hal.token);
  const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
  await api.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
  return { hal, mia, vic, tom, una, listingId };
}

describe('unread messages', () => {
  it("counts for each reader the messages others sent since they marked the conversation read, and never one's own", async () => {
    const { hal, mia, vic, tom, listingId } = await anOrganisation('unread');
    const id = await api.create('/conversations', tom.token, { listingId, text: 'First question' });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'Second question' });

    expect(await counts(hal.token, id, 2)).toEqual({ unread: 2, total: 2 });
    expect(await counts(mia.token, id, 2)).toEqual({ unread: 2, total: 2 });
    expect(await counts(vic.token, id, 2)).toEqual({ unread: 2, total: 2 });
    expect(await counts(tom.token, id, 0)).toEqual({ unread: 0, total: 0 });

    // Reading marks nothing; marking read is for the caller alone.
    await api.read(`/conversations/${id}`, hal.token);
    expect(await unreadIn(id, hal.token)).toBe(2);
    await api.done('POST', `/conversations/${id}/read`, hal.token);
    expect(await counts(hal.token, id, 0)).toEqual({ unread: 0, total: 0 });
    expect(await unreadIn(id, mia.token)).toBe(2);
    expect(await unreadIn(id, vic.token)).toBe(2);

    // A message after that is unread again; one by the manager is unread for the host like any other.
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'Third question' });
    await api.done('POST', `/conversations/${id}/messages`, mia.token, { text: 'An answer from Mia' });
    expect(await counts(hal.token, id, 2)).toEqual({ unread: 2, total: 2 });
    expect(await counts(mia.token, id, 3)).toEqual({ unread: 3, total: 3 });
    expect(await counts(vic.token, id, 4)).toEqual({ unread: 4, total: 4 });
    expect(await counts(tom.token, id, 1)).toEqual({ unread: 1, total: 1 });

    // A viewer reads the conversation, and marks it read for themselves.
    await api.done('POST', `/conversations/${id}/read`, vic.token);
    expect(await counts(vic.token, id, 0)).toEqual({ unread: 0, total: 0 });
    await api.done('POST', `/conversations/${id}/read`, tom.token);
    expect(await counts(tom.token, id, 0)).toEqual({ unread: 0, total: 0 });
    expect(await unreadIn(id, hal.token)).toBe(2);
    expect(await unreadIn(id, mia.token)).toBe(3);
  }, 60000);

  it('gives each conversation its count in the list, and the sum over all of them as the total', async () => {
    const hal = await api.host('hal@sum.unread.test');
    const tom = await api.traveller('tom@sum.unread.test');
    const una = await api.traveller('una@sum.unread.test');
    const first = await api.listing(hal.token);
    const second = await api.listing(hal.token);
    const fromTom = await api.create('/conversations', tom.token, { listingId: first, text: 'Hello from Tom' });
    await api.done('POST', `/conversations/${fromTom}/messages`, tom.token, { text: 'Are you there?' });
    const toSecond = await api.create('/conversations', tom.token, { listingId: second, text: 'And this one?' });
    const fromUna = await api.create('/conversations', una.token, { listingId: first, text: 'Hello from Una' });

    const all = await eventually(
      async () => ({ list: await api.list('/conversations/mine', hal.token), total: await total(hal.token) }),
      each => each.total === 4,
    );
    const byId = new Map(all.list.map(each => [each.id, each as Json]));
    expect(byId.get(fromTom)).toMatchObject({ unread: 2 });
    expect(byId.get(toSecond)).toMatchObject({ unread: 1 });
    expect(byId.get(fromUna)).toMatchObject({ unread: 1 });
    expect(all.total).toBe(4);

    await api.done('POST', `/conversations/${fromTom}/read`, hal.token);
    expect(await counts(hal.token, fromTom, 0)).toEqual({ unread: 0, total: 2 });
    await api.done('POST', `/conversations/${fromUna}/messages`, hal.token, { text: 'Welcome, Una' });
    expect(await counts(una.token, fromUna, 1)).toEqual({ unread: 1, total: 1 });
    expect(await counts(tom.token, fromTom, 0)).toEqual({ unread: 0, total: 0 });
  }, 60000);

  it('answers 404 to marking a conversation the caller does not read, and 401 without a token', async () => {
    const { tom, una, listingId } = await anOrganisation('who.unread');
    const id = await api.create('/conversations', tom.token, { listingId, text: 'A private question' });
    expect((await api.call('POST', `/conversations/${id}/read`, una.token)).status).toBe(404);
    expect((await api.call('POST', `/conversations/${id}/read`)).status).toBe(401);
    expect((await api.call('GET', '/conversations/unread')).status).toBe(401);
    expect(await total(una.token)).toBe(0);
  }, 60000);
});
