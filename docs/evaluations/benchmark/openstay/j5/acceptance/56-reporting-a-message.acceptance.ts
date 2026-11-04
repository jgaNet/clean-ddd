import { client, Client, database, eventually, Json, Running, start, stop } from './openstay';

/**
 * Request 56: reporting a message. Someone on the other side of a conversation from a message's sender
 * reports it, once, with a reason, and stops seeing it at once; everyone else still sees it.
 */
const db = database('report-message');
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

const textsOf = async (id: string, token: string) =>
  ((await api.read(`/conversations/${id}`, token)).messages as Json[]).map(each => each.text);
const report = (messageId: string, token: string, reason: unknown = 'This looks like a scam') =>
  api.act('POST', `/messages/${messageId}/report`, token, { reason });
const unreadIn = async (id: string, token: string) =>
  (await api.list('/conversations/mine', token)).find(each => each.id === id)?.unread;

/** A conversation of a traveller with a host's listing in an organisation, with a manager and a viewer. */
async function aConversation(name: string) {
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
  const id = await api.create('/conversations', tom.token, { listingId, text: 'Pay me outside the site' });
  await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'A normal question' });
  await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Hal writes back' });
  await api.done('POST', `/conversations/${id}/messages`, mia.token, { text: 'Mia writes back' });
  const messages = (await api.read(`/conversations/${id}`, tom.token)).messages as Json[];
  const [scam, normal, fromHal, fromMia] = messages.map(each => String(each.id));
  return { hal, mia, vic, tom, una, id, scam, normal, fromHal, fromMia };
}

describe('reporting a message', () => {
  it('hides a reported message from its reporter at once, and from nobody else, its sender included', async () => {
    const { hal, mia, vic, tom, id, scam } = await aConversation('hidden.report');
    const all = ['Pay me outside the site', 'A normal question', 'Hal writes back', 'Mia writes back'];
    // Unread for the host: the traveller's two messages and the manager's.
    expect(
      await eventually(
        () => unreadIn(id, hal.token),
        unread => unread === 3,
      ),
    ).toBe(3);

    const reported = await report(scam, hal.token);
    expect(reported.accepted).toBe(true);
    const reportId = typeof reported.result === 'string' ? reported.result : (reported.result as Json)?.id;
    expect(typeof reportId).toBe('string');

    expect(await textsOf(id, hal.token)).toEqual(all.slice(1));
    for (const reader of [tom, mia, vic]) expect(await textsOf(id, reader.token)).toEqual(all);
    // It no longer counts as unread for the reporter, and still does for the others.
    expect(
      await eventually(
        () => unreadIn(id, hal.token),
        unread => unread === 2,
      ),
    ).toBe(2);
    expect(
      await eventually(
        async () => (await api.read('/conversations/unread', hal.token)).total,
        total => total === 2,
      ),
    ).toBe(2);
    expect(
      await eventually(
        () => unreadIn(id, mia.token),
        unread => unread === 3,
      ),
    ).toBe(3);
    expect(
      await eventually(
        () => unreadIn(id, vic.token),
        unread => unread === 4,
      ),
    ).toBe(4);
  }, 60000);

  it('is made by the other side from the sender only: the host or a manager for the traveller, the traveller for the host side', async () => {
    const { hal, mia, vic, tom, una, id, normal, fromHal, fromMia } = await aConversation('who.report');
    // Nobody reports their own message, a viewer reports nothing, nor does anyone outside the conversation.
    expect((await report(normal, tom.token)).accepted).toBe(false);
    expect((await report(fromHal, hal.token)).accepted).toBe(false);
    expect((await report(normal, vic.token)).accepted).toBe(false);
    expect((await report(normal, una.token)).accepted).toBe(false);
    // The host's side is one side: the host does not report the manager's message, nor the manager the host's.
    expect((await report(fromMia, hal.token)).accepted).toBe(false);
    expect((await report(fromHal, mia.token)).accepted).toBe(false);
    expect(await textsOf(id, hal.token)).toHaveLength(4);
    expect(await textsOf(id, tom.token)).toHaveLength(4);

    expect((await report(normal, mia.token)).accepted).toBe(true);
    expect((await report(fromHal, tom.token)).accepted).toBe(true);
    expect((await report(fromMia, tom.token)).accepted).toBe(true);
    expect(await textsOf(id, tom.token)).toEqual(['Pay me outside the site', 'A normal question']);
    expect(await textsOf(id, mia.token)).toEqual(['Pay me outside the site', 'Hal writes back', 'Mia writes back']);
    expect(await textsOf(id, hal.token)).toHaveLength(4);
  }, 60000);

  it('takes a reason of 1 to 500 characters, and one report per account and message', async () => {
    const { hal, mia, id, scam } = await aConversation('once.report');
    expect((await report(scam, hal.token, '')).accepted).toBe(false);
    expect((await report(scam, hal.token, 'r'.repeat(501))).accepted).toBe(false);
    expect(await textsOf(id, hal.token)).toHaveLength(4);
    expect((await report(scam, hal.token, 'r'.repeat(500))).accepted).toBe(true);
    expect((await report(scam, hal.token, 'Again')).accepted).toBe(false);
    // Another account on the host's side reports it too.
    expect((await report(scam, mia.token, 'I agree')).accepted).toBe(true);
    expect((await report(scam, mia.token, 'Twice')).accepted).toBe(false);
    expect((await api.call('POST', `/messages/${scam}/report`, undefined, { reason: 'Anonymous' })).status).toBe(401);
  }, 60000);
});
