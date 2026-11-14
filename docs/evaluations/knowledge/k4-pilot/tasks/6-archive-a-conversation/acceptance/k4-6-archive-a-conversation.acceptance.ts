import { client, Client, database, Json, Running, start, stop } from './openstay';

/**
 * K4, task 6 (a handoff: a feature stopped half-way, continued by a fresh agent). Archiving a conversation:
 * `POST /v1/conversations/{id}/archive`, by anyone who reads it (request 51), for themselves only. An archived
 * conversation is left out of the archiver's `GET /v1/conversations/mine` until a new message is written in it,
 * by anyone; it is still read by its id, and its unread messages still count in `GET /v1/conversations/unread`.
 * Archiving a conversation the caller does not read is refused as one that does not exist.
 */
const db = database('k4-archive');
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

const mine = async (token: string) => ((await api.list('/conversations/mine', token)) as Json[]).map(each => each.id);

describe('archiving a conversation', () => {
  it('leaves it out of the archiver’s list only, until a new message brings it back', async () => {
    const hal = await api.host('hal@k4-archive.test');
    const tom = await api.traveller('tom@k4-archive.test');
    const loft = await api.listing(hal.token);
    const barn = await api.listing(hal.token);
    const first = await api.create('/conversations', tom.token, { listingId: loft, text: 'Is the loft quiet?' });
    const second = await api.create('/conversations', tom.token, { listingId: barn, text: 'Is the barn warm?' });
    expect(new Set(await mine(tom.token))).toEqual(new Set([first, second]));

    await api.done('POST', `/conversations/${first}/archive`, tom.token);
    expect(await mine(tom.token)).toEqual([second]);
    // The other side still has it, and the archiver still reads it by its id.
    expect(new Set(await mine(hal.token))).toEqual(new Set([first, second]));
    expect((await api.read(`/conversations/${first}`, tom.token)).id).toBe(first);

    // Archiving it again changes nothing.
    await api.done('POST', `/conversations/${first}/archive`, tom.token);
    expect(await mine(tom.token)).toEqual([second]);

    // A new message, by the other side, brings it back.
    await api.done('POST', `/conversations/${first}/messages`, hal.token, { text: 'Very quiet, at night too.' });
    expect(new Set(await mine(tom.token))).toEqual(new Set([first, second]));

    // Archived again, then the archiver writes in it: it is back too.
    await api.done('POST', `/conversations/${first}/archive`, tom.token);
    expect(await mine(tom.token)).toEqual([second]);
    await api.done('POST', `/conversations/${first}/messages`, tom.token, { text: 'Thanks, we will book.' });
    expect(new Set(await mine(tom.token))).toEqual(new Set([first, second]));
  }, 90000);

  it('keeps counting the unread messages of an archived conversation', async () => {
    const hal = await api.host('hal@k4-archive-unread.test');
    const tom = await api.traveller('tom@k4-archive-unread.test');
    const listingId = await api.listing(hal.token);
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Hello' });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'Is there a cot?' });
    await api.done('POST', `/conversations/${id}/archive`, hal.token);
    expect(await mine(hal.token)).toEqual([]);
    expect(await api.read('/conversations/unread', hal.token)).toEqual({ total: 2 });
  }, 60000);

  it('refuses whoever does not read the conversation, and a caller who is not signed in', async () => {
    const hal = await api.host('hal@k4-archive-who.test');
    const tom = await api.traveller('tom@k4-archive-who.test');
    const eve = await api.traveller('eve@k4-archive-who.test');
    const listingId = await api.listing(hal.token);
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Hello' });
    expect(await api.refused('POST', `/conversations/${id}/archive`, eve.token)).toBe(true);
    expect((await api.call('POST', `/conversations/${id}/archive`)).status).toBe(401);
    expect(await mine(tom.token)).toEqual([id]);
    expect(await mine(hal.token)).toEqual([id]);
  }, 60000);
});
