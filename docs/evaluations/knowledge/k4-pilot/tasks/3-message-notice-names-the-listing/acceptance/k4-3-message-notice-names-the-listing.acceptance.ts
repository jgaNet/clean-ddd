import { client, Client, database, eventually, Json, notificationService, Running, start, stop } from './openstay';

/**
 * K4, task 3 (a change that crosses two contexts): the notice of a new message (request 55) also names the
 * listing its conversation is about, `listingId`, so that the notification service can say which place the
 * message is about. Everything else about the notice is as request 55 says.
 */
const db = database('k4-notice-listing');
const notices = notificationService(0);
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { NOTIFY_URL: await notices.url(), MESSAGE_NOTICE_WINDOW_SECONDS: '1' });
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await notices.close();
  db.remove();
});

const messageNotices = (accountId: string) => notices.notices('message').filter(each => each.accountId === accountId);

describe('the notice of a new message', () => {
  it('names the listing of the conversation, for the host and for the traveller', async () => {
    const hal = await api.host('hal@k4-notice.test');
    const tom = await api.traveller('tom@k4-notice.test');
    const loft = await api.listing(hal.token, { title: 'A loft by the river' });
    const barn = await api.listing(hal.token, { title: 'A barn in the hills' });

    const aboutLoft = await api.create('/conversations', tom.token, { listingId: loft, text: 'Is the loft quiet?' });
    const toHal = await eventually(
      async () => messageNotices(hal.id),
      list => list.length >= 1,
    );
    expect(toHal).toHaveLength(1);
    expect(toHal[0]).toMatchObject({ kind: 'message', accountId: hal.id, conversationId: aboutLoft, listingId: loft });

    await api.done('POST', `/conversations/${aboutLoft}/messages`, hal.token, { text: 'Very quiet, at night too.' });
    const toTom = await eventually(
      async () => messageNotices(tom.id),
      list => list.length >= 1,
    );
    expect(toTom[0]).toMatchObject({ kind: 'message', accountId: tom.id, conversationId: aboutLoft, listingId: loft });

    // Another conversation of the same two people, about another listing, names that listing.
    const aboutBarn = await api.create('/conversations', tom.token, { listingId: barn, text: 'Is there a fireplace?' });
    const barnNotice = (await eventually(
      async () => messageNotices(hal.id).filter(each => each.conversationId === aboutBarn),
      list => list.length >= 1,
    )) as Json[];
    expect(barnNotice[0]).toMatchObject({ kind: 'message', accountId: hal.id, conversationId: aboutBarn, listingId: barn });
  }, 90000);
});
