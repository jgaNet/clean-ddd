import { client, Client, database, eventually, kill, notificationService, Running, sleep, start, stop } from './openstay';

/**
 * Request 55: notices of new messages. The other side of a conversation is told of a new message, at most
 * once per account and conversation within MESSAGE_NOTICE_WINDOW_SECONDS, through a service that fails,
 * across two servers and crashes.
 */
const services: ReturnType<typeof notificationService>[] = [];
const outside = (refusals: number) => {
  const service = notificationService(refusals);
  services.push(service);
  return service;
};
afterAll(async () => {
  await Promise.all(services.map(service => service.close()));
});

/** The window the first server runs with, in seconds. */
const WINDOW = 10;
const service = outside(2);
const db = database('message-notices');
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { NOTIFY_URL: await service.url(), MESSAGE_NOTICE_WINDOW_SECONDS: String(WINDOW) };
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

/** The message notices accepted for `conversationId` (and `accountId` when given). */
const noticesOf = (from: ReturnType<typeof notificationService>, conversationId: string, accountId?: string) =>
  from
    .notices('message')
    .filter(each => each.conversationId === conversationId && (accountId === undefined || each.accountId === accountId));
const waitFor = (
  from: ReturnType<typeof notificationService>,
  conversationId: string,
  accountId: string,
  count: number,
  ms = 30000,
) =>
  eventually(
    async () => noticesOf(from, conversationId, accountId),
    found => found.length >= count,
    ms,
  );

/** A host with a published listing in an organisation, a manager and a viewer of it, and a traveller. */
async function anOrganisation(name: string, through = api) {
  const hal = await through.host(`hal@${name}.test`);
  const mia = await through.host(`mia@${name}.test`);
  const vic = await through.host(`vic@${name}.test`);
  const tom = await through.traveller(`tom@${name}.test`);
  const listingId = await through.listing(hal.token);
  const organisationId = await through.create('/organisations', hal.token, { name: 'Hal & Co' });
  await through.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
  await through.done('POST', `/organisations/${organisationId}/members`, hal.token, {
    email: mia.email,
    role: 'manager',
  });
  await through.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
  return { hal, mia, vic, tom, listingId };
}

describe('notices of new messages', () => {
  it('tells the other side, never the sender, a manager or a viewer, and sends each notice until it is accepted', async () => {
    const { hal, mia, vic, tom, listingId } = await anOrganisation('told.notices');
    const id = await api.create('/conversations', tom.token, { listingId, text: 'A question for the host' });
    const [toHost] = await waitFor(service, id, hal.id, 1);
    expect(toHost).toMatchObject({ kind: 'message', accountId: hal.id, conversationId: id });
    expect(typeof toHost.id).toBe('string');

    await api.done('POST', `/conversations/${id}/messages`, mia.token, { text: 'An answer from Mia' });
    const [toTraveller] = await waitFor(service, id, tom.id, 1);
    expect(toTraveller).toMatchObject({ kind: 'message', accountId: tom.id, conversationId: id });
    expect(toTraveller.id).not.toBe(toHost.id);

    await sleep(3000);
    const sent = service.attempts.filter(each => each.body.conversationId === id);
    expect(new Set(sent.map(each => each.body.accountId))).toEqual(new Set([hal.id, tom.id]));
    expect(sent.some(each => [mia.id, vic.id].includes(String(each.body.accountId)))).toBe(false);
    for (const notice of [toHost, toTraveller]) {
      // Refused twice, accepted the third time, with the same body each time, and never sent again.
      const attempts = service.attemptsOf(String(notice.id));
      expect(attempts).toHaveLength(3);
      for (const attempt of attempts) expect(attempt.body).toEqual(notice);
      const gaps = attempts.slice(1).map((attempt, n) => attempt.at - attempts[n].at);
      expect(gaps[0]).toBeLessThanOrEqual(2000);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(6000);
    }
  }, 90000);

  it('sends nothing more for a conversation within the window, nothing later for it either, and a new notice after it', async () => {
    const hal = await api.host('hal@window.notices.test');
    const tom = await api.traveller('tom@window.notices.test');
    const listingId = await api.listing(hal.token);
    const other = await api.listing(hal.token);
    const id = await api.create('/conversations', tom.token, { listingId, text: 'First message' });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'Second message' });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'Third message' });
    // Each conversation counts on its own, and each account: the host answers at once.
    const elsewhere = await api.create('/conversations', tom.token, { listingId: other, text: 'About the other place' });
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'An answer from Hal' });

    const [first] = await waitFor(service, id, hal.id, 1);
    expect(await waitFor(service, elsewhere, hal.id, 1)).toHaveLength(1);
    expect(await waitFor(service, id, tom.id, 1)).toHaveLength(1);
    const acceptedAt = Math.max(...service.attemptsOf(String(first.id)).map(each => each.at));

    // The window passes: the messages within it are not told later.
    await sleep(Math.max(0, acceptedAt + (WINDOW + 3) * 1000 - Date.now()));
    expect(noticesOf(service, id, hal.id)).toHaveLength(1);
    expect(service.attempts.filter(each => each.body.conversationId === id && each.body.accountId === hal.id)).toHaveLength(3);

    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: 'After the window' });
    const both = await waitFor(service, id, hal.id, 2);
    expect(both).toHaveLength(2);
    expect(both[1]).toMatchObject({ kind: 'message', accountId: hal.id, conversationId: id });
    expect(both[1].id).not.toBe(first.id);
    await sleep(3000);
    expect(noticesOf(service, id, hal.id)).toHaveLength(2);
    expect(noticesOf(service, elsewhere, hal.id)).toHaveLength(1);
  }, 120000);

  it('sends one notice for two messages sent at the same moment to two servers on one database', async () => {
    const second = await start(db.path, environment);
    try {
      const other = client(second.port);
      for (let round = 0; round < 3; round++) {
        const { hal, mia, tom, listingId } = await anOrganisation(`race${round}.notices`);
        // Two first messages of one traveller, through both servers: one notice to the host.
        const traveller = await other.login(tom.email);
        const [id] = await Promise.all([
          api.create('/conversations', tom.token, { listingId, text: 'Through the first server' }),
          other.create('/conversations', traveller, { listingId, text: 'Through the second server' }),
        ]);
        // The host and a manager answer at the same moment, through both servers: one notice to the traveller.
        const manager = await other.login(mia.email);
        await Promise.all([
          api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Hal answers here' }),
          other.done('POST', `/conversations/${id}/messages`, manager, { text: 'Mia answers there' }),
        ]);
        await waitFor(service, id, hal.id, 1);
        await waitFor(service, id, tom.id, 1);
        await sleep(2000);
        expect(noticesOf(service, id, hal.id)).toHaveLength(1);
        expect(noticesOf(service, id, tom.id)).toHaveLength(1);
        expect(new Set(service.attempts.filter(each => each.body.conversationId === id).map(each => each.body.id)).size).toBe(2);
      }
    } finally {
      await stop(second);
    }
  }, 180000);

  it('after kills at random moments, sends a notice for every message recorded and none for one that was not', async () => {
    const crashes = outside(1);
    const crashDb = database('message-notices-chaos');
    const url = await crashes.url();
    // No MESSAGE_NOTICE_WINDOW_SECONDS: the window is 900 seconds.
    let running = await start(crashDb.path, { NOTIFY_URL: url });
    let through = client(running.port);
    let seed = 1234567;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    try {
      const hal = await through.host('hal@chaos.notices.test');
      const tom = await through.traveller('tom@chaos.notices.test');
      const listings: string[] = [];
      for (let n = 0; n < 10; n++) listings.push(await through.listing(hal.token));
      let token = tom.token;
      for (let round = 0; round < 10; round++) {
        const body = { listingId: listings[round], text: `Question number ${round + 1} for you` };
        if (round < 7) {
          void through.call('POST', '/conversations', token, body).catch(() => undefined);
          await sleep(Math.floor(random() * 40));
        } else await through.call('POST', '/conversations', token, body).catch(() => undefined);
        await kill(running);
        running = await start(crashDb.path, { NOTIFY_URL: url });
        through = client(running.port);
        token = await through.login(tom.email);
      }

      const state = async () => {
        const recorded = (await through.list('/conversations/mine', token)).map(each => String(each.id));
        const byConversation = new Map<string, Set<string>>();
        for (const notice of crashes.notices('message')) {
          const ids = byConversation.get(String(notice.conversationId)) ?? new Set<string>();
          ids.add(String(notice.id));
          byConversation.set(String(notice.conversationId), ids);
        }
        return { recorded, byConversation };
      };
      const agreed = ({ recorded, byConversation }: Awaited<ReturnType<typeof state>>) =>
        recorded.every(each => byConversation.has(each)) &&
        [...byConversation.keys()].every(each => recorded.includes(each));
      await eventually(state, agreed, 60000);
      await sleep(3000);
      const { recorded, byConversation } = await state();
      expect(recorded.length).toBeGreaterThan(0);
      expect(recorded.filter(each => !byConversation.has(each))).toEqual([]);
      expect([...byConversation.entries()].filter(([, ids]) => ids.size !== 1)).toEqual([]);
      expect([...byConversation.keys()].filter(each => !recorded.includes(each))).toEqual([]);
      for (const notice of crashes.notices('message')) expect(notice).toMatchObject({ kind: 'message', accountId: hal.id });

      // The default window holds: a new message in a conversation told earlier sends nothing.
      const [told] = recorded.slice(-1);
      await through.done('POST', `/conversations/${told}/messages`, token, { text: 'One more question' });
      await sleep(4000);
      expect(new Set(crashes.attempts.filter(each => each.body.conversationId === told).map(each => each.body.id)).size).toBe(1);
    } finally {
      await stop(running);
      await crashes.close();
      crashDb.remove();
    }
  }, 240000);
});
