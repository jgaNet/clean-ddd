import {
  adminEnvironment,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  Running,
  sleep,
  start,
  stop,
} from './openstay';

/**
 * Request 67: every administrator decision written down once, with who, when, what, about what and why;
 * nothing else written, nothing changed, nothing lost to a crash or doubled by a second server.
 */
const db = database('audit-log');
const environment = { JOBS_INTERVAL_SECONDS: '1', ...adminEnvironment('ada@audit.test', 'bob@audit.test') };
let server: Running;
let other: Running;
let api: Client;
let otherApi: Client;
type Person = { id: string; email: string; token: string };
let ada: Person;
let bob: Person;
let hal: Person;
let tom: Person;
let una: Person;
let kim: Person;
beforeAll(async () => {
  server = await start(db.path, environment);
  other = await start(db.path, environment);
  api = client(server.port);
  otherApi = client(other.port);
  ada = await api.admin('ada@audit.test');
  bob = await api.admin('bob@audit.test');
  hal = await api.host('hal@audit.test');
  tom = await api.traveller('tom@audit.test');
  una = await api.traveller('una@audit.test');
  kim = await api.traveller('kim@audit.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  await stop(other);
  db.remove();
});

const audit = (subjectId: string, token = ada.token) =>
  api.list(`/admin/audit?subjectId=${encodeURIComponent(subjectId)}`, token);
/** The entries about `subjectId` once there are `count` of them (they are readable within a few seconds). */
const entries = (subjectId: string, count: number) =>
  eventually(
    () => audit(subjectId),
    found => found.length >= count,
    10000,
  );
const report = (listingId: string, person: Person, reason = 'scam') =>
  api.create(`/listings/${listingId}/report`, person.token, { reason });
/** A decision taken between two instants, to read its entry's `at` against them. */
async function timed(decide: () => Promise<unknown>) {
  const from = Date.now();
  await decide();
  return { from, to: Date.now() };
}
const within = (at: unknown, { from, to }: { from: number; to: number }) => {
  const time = Date.parse(String(at));
  return time >= from - 1000 && time <= to + 1000;
};

describe('the audit log', () => {
  it('answers 403 to anyone but an administrator, 400 without a subject, and [] for a subject with no entry', async () => {
    for (const person of [tom, hal]) expect((await api.call('GET', '/admin/audit?subjectId=anything', person.token)).status).toBe(403);
    expect((await api.call('GET', '/admin/audit', ada.token)).status).toBe(400);
    expect(await audit('no-such-subject')).toEqual([]);
    expect(await audit(hal.id, bob.token)).toEqual([]);
  }, 60000);

  it("writes each decision on a listing and on an account, the oldest first, with who, when, what and why", async () => {
    const id = await api.listing(hal.token, { city: 'Auditville' });
    const first = await report(id, tom);
    const dismissed = await timed(() => api.done('POST', `/admin/reports/${first}/dismiss`, ada.token, { note: 'Looks genuine.' }));
    await sleep(1100);
    // Two reports upheld together: one decision, one entry, and the suspension it brings is part of it.
    const second = await report(id, una);
    await report(id, kim, 'unsafe');
    const upheld = await timed(() => api.done('POST', `/admin/reports/${second}/uphold`, bob.token, { note: 'Fake photos.' }));
    await sleep(1100);
    const reinstated = await timed(() =>
      api.done('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: 'New photos checked.' }),
    );

    const found = await entries(id, 3);
    expect(found).toEqual([
      expect.objectContaining({ id: expect.any(String), adminId: ada.id, action: 'report-dismissed', subjectId: id, note: 'Looks genuine.' }),
      expect.objectContaining({ id: expect.any(String), adminId: bob.id, action: 'report-upheld', subjectId: id, note: 'Fake photos.' }),
      expect.objectContaining({ id: expect.any(String), adminId: ada.id, action: 'listing-reinstated', subjectId: id, note: 'New photos checked.' }),
    ]);
    expect(within(found[0].at, dismissed)).toBe(true);
    expect(within(found[1].at, upheld)).toBe(true);
    expect(within(found[2].at, reinstated)).toBe(true);

    const sam = await api.traveller('sam@audit.test');
    const suspended = await timed(() =>
      api.done('POST', `/admin/accounts/${sam.id}/suspend`, ada.token, { reason: 'Abused three hosts.' }),
    );
    await sleep(1100);
    await api.done('POST', `/admin/accounts/${sam.id}/reinstate`, bob.token, { note: 'Apologised to each.' });
    const about = await entries(sam.id, 2);
    expect(about).toEqual([
      expect.objectContaining({ adminId: ada.id, action: 'account-suspended', subjectId: sam.id, note: 'Abused three hosts.' }),
      expect.objectContaining({ adminId: bob.id, action: 'account-reinstated', subjectId: sam.id, note: 'Apologised to each.' }),
    ]);
    expect(within(about[0].at, suspended)).toBe(true);
    await sleep(2000);
    expect(await audit(id)).toHaveLength(3);
    expect(await audit(sam.id)).toHaveLength(2);
  }, 60000);

  it('writes a decision on a reported message about the message', async () => {
    const id = await api.listing(hal.token, { city: 'Auditville' });
    const conversationId = await api.create('/conversations', tom.token, { listingId: id, text: 'Is it near the sea?' });
    await api.done('POST', `/conversations/${conversationId}/messages`, hal.token, { text: 'Pay me in cash outside.' });
    const messages = (await api.read(`/conversations/${conversationId}`, tom.token)).messages as Json[];
    const messageId = String(messages.find(each => each.senderId === hal.id)?.id);
    const reportId = await api.create(`/messages/${messageId}/report`, tom.token, { reason: 'Asks to pay outside' });
    await api.done('POST', `/admin/reports/${reportId}/dismiss`, bob.token, { note: 'A joke between them.' });
    expect(await entries(messageId, 1)).toEqual([
      expect.objectContaining({ adminId: bob.id, action: 'report-dismissed', subjectId: messageId, note: 'A joke between them.' }),
    ]);
  }, 60000);

  it('writes nothing for a decision refused, nor for what a decision brings with it', async () => {
    const id = await api.listing(hal.token, { city: 'Auditville' });
    const reportId = await report(id, tom);
    expect(await api.refused('POST', `/admin/reports/${reportId}/dismiss`, hal.token, { note: 'Not an admin' })).toBe(true);
    expect(await api.refused('POST', `/admin/reports/${reportId}/dismiss`, ada.token, { note: '' })).toBe(true);
    expect(await api.refused('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: 'Not suspended' })).toBe(true);
    await sleep(2000);
    expect(await audit(id)).toEqual([]);

    await api.done('POST', `/admin/reports/${reportId}/dismiss`, ada.token, { note: 'Fine.' });
    expect(await api.refused('POST', `/admin/reports/${reportId}/uphold`, bob.token, { note: 'Too late' })).toBe(true);
    await entries(id, 1);
    await sleep(2000);
    expect(await audit(id)).toEqual([expect.objectContaining({ action: 'report-dismissed', note: 'Fine.' })]);

    // An account suspended: its stays to come cancelled are part of the one entry.
    const zed = await api.host('zed@audit.test');
    const listingId = await api.listing(zed.token, { city: 'Zedville' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(12)));
    await api.done('POST', `/admin/accounts/${zed.id}/suspend`, ada.token, { reason: 'Fake listings.' });
    await eventually(
      () => api.read(`/bookings/${bookingId}`, tom.token),
      booking => booking.status === 'cancelled',
    );
    expect(await api.refused('POST', `/admin/accounts/${zed.id}/suspend`, bob.token, { reason: 'Again' })).toBe(true);
    await entries(zed.id, 1);
    await sleep(2000);
    expect(await audit(zed.id)).toEqual([expect.objectContaining({ action: 'account-suspended', note: 'Fake listings.' })]);
    expect(await audit(bookingId)).toEqual([]);
    expect(await audit(listingId)).toEqual([]);
  }, 60000);

  it('keeps every entry when its subject changes or goes: a listing archived, an account closed', async () => {
    const id = await api.listing(hal.token, { city: 'Auditville' });
    await api.done('POST', `/admin/reports/${await report(id, una)}/uphold`, ada.token, { note: 'Misleading.' });
    await sleep(1100);
    await api.done('POST', `/admin/listings/${id}/reinstate`, ada.token, { note: 'Corrected.' });
    await entries(id, 2);
    await api.done('POST', `/listings/${id}/archive`, hal.token);

    const lea = await api.traveller('lea@audit.test');
    await api.done('POST', `/admin/accounts/${lea.id}/suspend`, ada.token, { reason: 'Spam.' });
    await sleep(1100);
    await api.done('POST', `/admin/accounts/${lea.id}/reinstate`, ada.token, { note: 'Stopped.' });
    await entries(lea.id, 2);
    await api.done('POST', '/accounts/me/close', await api.login(lea.email));

    await sleep(1000);
    expect((await audit(id)).map(each => each.action)).toEqual(['report-upheld', 'listing-reinstated']);
    expect((await audit(lea.id)).map(each => [each.action, each.note])).toEqual([
      ['account-suspended', 'Spam.'],
      ['account-reinstated', 'Stopped.'],
    ]);
  }, 60000);

  it('has exactly one entry per decision with two servers, and keeps one answered just before a crash', async () => {
    const subjects: string[] = [];
    for (const on of [api, otherApi, api, otherApi]) {
      const id = await api.listing(hal.token, { city: 'Auditville' });
      await on.done('POST', `/admin/reports/${await report(id, kim)}/dismiss`, ada.token, { note: 'Fine.' });
      subjects.push(id);
    }
    // Two administrators closing one report at the same moment, on two servers: one decision.
    const raced = await api.listing(hal.token, { city: 'Auditville' });
    const racedReport = await report(raced, kim);
    const outcomes = await Promise.all([
      api.act('POST', `/admin/reports/${racedReport}/dismiss`, ada.token, { note: 'Fine.' }),
      otherApi.act('POST', `/admin/reports/${racedReport}/uphold`, bob.token, { note: 'Not fine.' }),
    ]);
    expect(outcomes.filter(outcome => outcome.accepted)).toHaveLength(1);
    // A decision answered as done, then the server killed at once.
    const crashed = await api.traveller('cat@audit.test');
    await api.done('POST', `/admin/accounts/${crashed.id}/suspend`, ada.token, { reason: 'Fraud.' });
    await kill(server);
    server = await start(db.path, environment);
    api = client(server.port);
    ada.token = await api.login(ada.email);

    for (const id of subjects) await entries(id, 1);
    await entries(raced, 1);
    expect(await entries(crashed.id, 1)).toEqual([
      expect.objectContaining({ adminId: ada.id, action: 'account-suspended', subjectId: crashed.id, note: 'Fraud.' }),
    ]);
    await sleep(3000);
    for (const id of subjects) expect(await audit(id)).toHaveLength(1);
    expect(await audit(raced)).toEqual([
      expect.objectContaining(
        outcomes[0].accepted
          ? { adminId: ada.id, action: 'report-dismissed', note: 'Fine.' }
          : { adminId: bob.id, action: 'report-upheld', note: 'Not fine.' },
      ),
    ]);
    expect(await audit(crashed.id)).toHaveLength(1);
    expect((await otherApi.list(`/admin/audit?subjectId=${crashed.id}`, ada.token)).length).toBe(1);
  }, 120000);
});
