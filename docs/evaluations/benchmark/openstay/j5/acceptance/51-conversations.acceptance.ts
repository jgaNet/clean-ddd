import { client, Client, database, day, Json, Running, sleep, start, stop } from './openstay';

/**
 * Request 51: conversations. A signed-in account writes to the host of a listing, one conversation per
 * traveller and listing, read and written by its traveller, the listing's host and the managers of its
 * organisation, read by its viewers, and by nobody else.
 */
const db = database('conversations');
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

const conversation = (id: string, token: string) => api.read(`/conversations/${id}`, token);
const messagesOf = async (id: string, token: string) => (await conversation(id, token)).messages as Json[];
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

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

describe('conversations', () => {
  it('starts a conversation with the first message, adds the next ones to it, and gives them back in order', async () => {
    const hal = await api.host('hal@talk.test');
    const tom = await api.traveller('tom@talk.test');
    const listingId = await api.listing(hal.token);

    const id = await api.create('/conversations', tom.token, { listingId, text: 'Is the flat quiet at night?' });
    await sleep(20);
    const again = await api.create('/conversations', tom.token, { listingId, text: 'And is there a lift?' });
    expect(again).toBe(id);
    await sleep(20);
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Very quiet, and yes, a lift.' });
    await sleep(20);
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'Thank you!' });

    const read = await conversation(id, tom.token);
    expect(read).toMatchObject({ id, listingId, travellerId: tom.id, hostId: hal.id, bookingId: null });
    const messages = read.messages as Json[];
    expect(messages.map(each => [each.senderId, each.text])).toEqual([
      [tom.id, 'Is the flat quiet at night?'],
      [tom.id, 'And is there a lift?'],
      [hal.id, 'Very quiet, and yes, a lift.'],
      [tom.id, 'Thank you!'],
    ]);
    for (const message of messages) {
      expect(typeof message.id).toBe('string');
      expect(String(message.sentAt)).toMatch(ISO_TIME);
      expect(Math.abs(Date.parse(String(message.sentAt)) - Date.now())).toBeLessThan(5 * 60_000);
    }
    expect(new Set(messages.map(each => each.id)).size).toBe(4);
    const times = messages.map(each => Date.parse(String(each.sentAt)));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(await conversation(id, hal.token)).toMatchObject({ id, listingId, travellerId: tom.id, hostId: hal.id });
    expect((await messagesOf(id, hal.token)).map(each => each.text)).toEqual(messages.map(each => each.text));
  }, 60000);

  it('takes a message of 1 to 2,000 characters, and lets any signed-in account but the host write', async () => {
    const hal = await api.host('hal@length.talk.test');
    const ian = await api.host('ian@length.talk.test');
    const tom = await api.traveller('tom@length.talk.test');
    const una = await api.traveller('una@length.talk.test');
    const listingId = await api.listing(hal.token);

    expect(await api.refused('POST', '/conversations', una.token, { listingId, text: '' })).toBe(true);
    expect(await api.refused('POST', '/conversations', una.token, { listingId, text: 'x'.repeat(2001) })).toBe(true);
    // A refused first message starts nothing.
    expect(await api.list('/conversations/mine', una.token)).toEqual([]);

    const id = await api.create('/conversations', tom.token, { listingId, text: '?' });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'y'.repeat(2000) });
    expect(await api.refused('POST', `/conversations/${id}/messages`, tom.token, { text: '' })).toBe(true);
    expect(await api.refused('POST', `/conversations/${id}/messages`, hal.token, { text: 'z'.repeat(2001) })).toBe(
      true,
    );
    expect((await messagesOf(id, tom.token)).map(each => each.text)).toEqual(['?', 'y'.repeat(2000)]);

    // The host cannot write to their own listing; another host writes to it as its traveller.
    expect(await api.refused('POST', '/conversations', hal.token, { listingId, text: 'Hello me' })).toBe(true);
    const asTraveller = await api.create('/conversations', ian.token, { listingId, text: 'A host asking' });
    expect(await conversation(asTraveller, ian.token)).toMatchObject({ travellerId: ian.id, hostId: hal.id });
    expect((await api.call('POST', '/conversations', undefined, { listingId, text: 'Anyone?' })).status).toBe(401);
  }, 60000);

  it('lets a traveller write about a listing they booked even when it is no longer published, and nobody about a draft', async () => {
    const hal = await api.host('hal@booked.talk.test');
    const tom = await api.traveller('tom@booked.talk.test');
    const una = await api.traveller('una@booked.talk.test');
    const listingId = await api.listing(hal.token);
    const draft = await api.listing(hal.token, {}, false);
    await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(12)));
    await api.done('POST', `/listings/${listingId}/suspend`, hal.token);

    expect(await api.refused('POST', '/conversations', tom.token, { listingId: draft, text: 'Hello there' })).toBe(
      true,
    );
    expect(await api.refused('POST', '/conversations', una.token, { listingId, text: 'Hello there' })).toBe(true);
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Where are the keys?' });
    expect(await conversation(id, hal.token)).toMatchObject({ listingId, travellerId: tom.id, hostId: hal.id });
  }, 60000);

  it("is about one of the traveller's own bookings of the listing when they name it, the latest one named", async () => {
    const hal = await api.host('hal@about.talk.test');
    const tom = await api.traveller('tom@about.talk.test');
    const una = await api.traveller('una@about.talk.test');
    const listingId = await api.listing(hal.token);
    const other = await api.listing(hal.token);
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Before booking' });
    expect((await conversation(id, tom.token)).bookingId).toBeNull();

    const first = await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(12)));
    const second = await api.book(tom.token, await api.quote(tom.token, listingId, day(20), day(22)));
    const elsewhere = await api.book(tom.token, await api.quote(tom.token, other, day(10), day(12)));
    const unas = await api.book(una.token, await api.quote(una.token, listingId, day(30), day(32)));

    expect(await api.create('/conversations', tom.token, { listingId, text: 'About my stay', bookingId: first })).toBe(
      id,
    );
    expect(await conversation(id, hal.token)).toMatchObject({ id, bookingId: first });
    expect(await api.create('/conversations', tom.token, { listingId, text: 'The next one', bookingId: second })).toBe(
      id,
    );
    expect((await conversation(id, tom.token)).bookingId).toBe(second);

    expect(
      await api.refused('POST', '/conversations', tom.token, { listingId, text: 'Not mine', bookingId: unas }),
    ).toBe(true);
    expect(
      await api.refused('POST', '/conversations', tom.token, { listingId, text: 'Elsewhere', bookingId: elsewhere }),
    ).toBe(true);
    expect((await conversation(id, tom.token)).bookingId).toBe(second);
    // Writing again without naming a booking keeps the one named.
    await api.create('/conversations', tom.token, { listingId, text: 'One more thing' });
    expect((await conversation(id, tom.token)).bookingId).toBe(second);
  }, 60000);

  it("lets the organisation's managers read and write for the host, its viewers only read, and nobody else see it", async () => {
    const { hal, mia, vic, tom, una, listingId } = await anOrganisation('team.talk');
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Is parking free?' });

    await api.done('POST', `/conversations/${id}/messages`, mia.token, { text: 'Yes, in the courtyard.' });
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Ask Mia for the code.' });
    expect(await api.refused('POST', `/conversations/${id}/messages`, vic.token, { text: 'Hi from me' })).toBe(true);
    expect(await api.refused('POST', `/conversations/${id}/messages`, una.token, { text: 'Hi from me' })).toBe(true);

    for (const reader of [tom, hal, mia, vic]) {
      const read = await conversation(id, reader.token);
      expect(read).toMatchObject({ id, listingId, travellerId: tom.id, hostId: hal.id });
      expect((read.messages as Json[]).map(each => [each.senderId, each.text])).toEqual([
        [tom.id, 'Is parking free?'],
        [mia.id, 'Yes, in the courtyard.'],
        [hal.id, 'Ask Mia for the code.'],
      ]);
    }
    expect((await api.call('GET', `/conversations/${id}`, una.token)).status).toBe(404);
    expect((await api.call('GET', `/conversations/${id}`)).status).toBe(401);
  }, 60000);

  it('lists every conversation an account reads, as traveller, host, manager or viewer, the most recent message first', async () => {
    const { hal, mia, vic, tom, una, listingId } = await anOrganisation('mine.talk');
    const own = await api.listing(hal.token);
    const first = await api.create('/conversations', tom.token, { listingId, text: 'First question' });
    await sleep(1100);
    const second = await api.create('/conversations', tom.token, { listingId: own, text: 'Second question' });
    await sleep(1100);
    const third = await api.create('/conversations', una.token, { listingId: own, text: 'Third question' });
    await sleep(1100);
    await api.done('POST', `/conversations/${first}/messages`, mia.token, { text: 'An answer' });

    const ids = async (token: string) => (await api.list('/conversations/mine', token)).map(each => each.id);
    expect(await ids(hal.token)).toEqual([first, third, second]);
    expect(await ids(tom.token)).toEqual([first, second]);
    expect(await ids(una.token)).toEqual([third]);
    expect(await ids(mia.token)).toEqual([first]);
    expect(await ids(vic.token)).toEqual([first]);

    const [latest] = await api.list('/conversations/mine', tom.token);
    expect(latest).toMatchObject({ id: first, listingId, travellerId: tom.id, hostId: hal.id });
    expect(String(latest.lastMessageAt)).toMatch(ISO_TIME);
    expect((await api.call('GET', '/conversations/mine')).status).toBe(401);
  }, 60000);

  it('makes one conversation of two first messages sent at the same moment to two servers on one database', async () => {
    const hal = await api.host('hal@race.talk.test');
    const listingId = await api.listing(hal.token);
    const travellers = await Promise.all(Array.from({ length: 5 }, (_, n) => api.traveller(`t${n}@race.talk.test`)));
    const second = await start(db.path);
    try {
      const other = client(second.port);
      for (const traveller of travellers) {
        const token = await other.login(traveller.email);
        const ids = await Promise.all([
          api.create('/conversations', traveller.token, { listingId, text: 'Through the first server' }),
          other.create('/conversations', token, { listingId, text: 'Through the second server' }),
        ]);
        expect(ids[1]).toBe(ids[0]);
        const mine = await api.list('/conversations/mine', traveller.token);
        expect(mine.map(each => each.id)).toEqual([ids[0]]);
        expect((await messagesOf(ids[0], hal.token)).map(each => each.text).sort()).toEqual([
          'Through the first server',
          'Through the second server',
        ]);
      }
      expect(await api.list('/conversations/mine', hal.token)).toHaveLength(travellers.length);
    } finally {
      await stop(second);
    }
  }, 120000);
});
