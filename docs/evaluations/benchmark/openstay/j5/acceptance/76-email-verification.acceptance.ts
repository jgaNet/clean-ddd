import {
  client,
  Client,
  database,
  eventually,
  Json,
  notificationService,
  PASSWORD,
  Running,
  sleep,
  start,
  stop,
} from './openstay';

/**
 * Request 76: an account asks for a six-digit code, sent as a notice (request 10) that cannot be
 * turned off (request 75), and verifies its email with it; a new code replaces the old one, five
 * wrong codes spend it (counted across two servers), it expires after EMAIL_CODE_TTL_SECONDS (15
 * here), and a change of email makes the account unverified again.
 */
const db = database('email-verification');
// The service refuses each notice once: a code still arrives, as request 10 delivers.
const service = notificationService(1);
const TTL = 15;
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { NOTIFY_URL: await service.url(), EMAIL_CODE_TTL_SECONDS: String(TTL) };
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await service.close();
  db.remove();
});

const codesOf = (accountId: string) =>
  service.notices('email-verification').filter(each => each.accountId === accountId);
/** Asks for a code as `account`, and waits for its notice: the notice. */
async function ask(account: { id: string; token: string }, on = api): Promise<Json> {
  const before = codesOf(account.id).length;
  await on.done('POST', '/accounts/me/email/verify-request', account.token);
  const notices = await eventually(
    async () => codesOf(account.id),
    found => found.length > before,
    20000,
  );
  if (notices.length <= before) throw new Error(`no code was sent to ${account.id}`);
  return notices[notices.length - 1];
}
const verify = (token: string, code: string, on = api) => on.act('POST', '/accounts/me/email/verify', token, { code });
const verified = async (token: string) => (await api.read('/accounts/me', token)).emailVerified;
/** Six-digit codes other than `code`. */
const wrong = (code: string, count: number) =>
  Array.from({ length: count }, (_, n) => String((Number(code) + 1 + n * 7919) % 1_000_000).padStart(6, '0'));

describe('email verification', () => {
  it('sends a six-digit code to the current address, until the service accepts it, which verifies the email once', async () => {
    const tom = await api.traveller('tom@email-verification.test');
    expect(await verified(tom.token)).toBe(false);
    expect(await api.refused('POST', '/accounts/me/email/verify-request')).toBe(true);

    const notice = await ask(tom);
    expect(notice).toMatchObject({ kind: 'email-verification', accountId: tom.id, email: tom.email });
    expect(String(notice.code)).toMatch(/^\d{6}$/);
    expect(typeof notice.code).toBe('string');
    const attempts = service.attemptsOf(String(notice.id));
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    for (const attempt of attempts) expect(attempt.body).toEqual(notice);

    const code = String(notice.code);
    expect((await verify(tom.token, wrong(code, 1)[0])).accepted).toBe(false);
    expect(await verified(tom.token)).toBe(false);
    await api.done('POST', '/accounts/me/email/verify', tom.token, { code });
    expect(await verified(tom.token)).toBe(true);
    expect((await verify(tom.token, code)).accepted).toBe(false);
    // Verified already: no code is given.
    expect(await api.refused('POST', '/accounts/me/email/verify-request', tom.token)).toBe(true);
    await sleep(2000);
    expect(codesOf(tom.id)).toHaveLength(1);
    expect(await verified(tom.token)).toBe(true);
  }, 60000);

  it('sends the code whatever the preferences, replaces it when asked again, and verifies only its own account', async () => {
    const una = await api.traveller('una@email-verification.test');
    const sam = await api.traveller('sam@email-verification.test');
    await api.done('PUT', '/accounts/me/notices', una.token, {
      message: false,
      'booking-confirmed': false,
      'booking-requested': false,
    });
    expect(await api.refused('PUT', '/accounts/me/notices', una.token, { 'email-verification': false })).toBe(true);

    const first = String((await ask(una)).code);
    const second = String((await ask(una)).code);
    expect(codesOf(una.id)).toHaveLength(2);
    // Another account sends una's code: it verifies nothing.
    expect((await verify(sam.token, second)).accepted).toBe(false);
    expect(await verified(sam.token)).toBe(false);
    if (first !== second) expect((await verify(una.token, first)).accepted).toBe(false);
    expect(await verified(una.token)).toBe(false);
    await api.done('POST', '/accounts/me/email/verify', una.token, { code: second });
    expect(await verified(una.token)).toBe(true);
  }, 60000);

  it('spends the code after five wrong ones, sent at the same moment to two servers, until a new one is asked for', async () => {
    const ian = await api.traveller('ian@email-verification.test');
    const code = String((await ask(ian)).code);
    const second = await start(db.path, environment);
    try {
      const other = client(second.port);
      const token = await other.login(ian.email);
      const outcomes = await Promise.all(
        wrong(code, 5).map((guess, n) => (n % 2 ? verify(token, guess, other) : verify(ian.token, guess))),
      );
      expect(outcomes.filter(each => each.accepted)).toEqual([]);
      expect((await verify(ian.token, code)).accepted).toBe(false);
      expect((await verify(token, code, other)).accepted).toBe(false);
      expect(await verified(ian.token)).toBe(false);
    } finally {
      await stop(second);
    }
    const fresh = String((await ask(ian)).code);
    await api.done('POST', '/accounts/me/email/verify', ian.token, { code: fresh });
    expect(await verified(ian.token)).toBe(true);
  }, 90000);

  it('takes four wrong codes and then the right one', async () => {
    const joe = await api.traveller('joe@email-verification.test');
    const code = String((await ask(joe)).code);
    for (const guess of wrong(code, 4)) expect((await verify(joe.token, guess)).accepted).toBe(false);
    await api.done('POST', '/accounts/me/email/verify', joe.token, { code });
    expect(await verified(joe.token)).toBe(true);
  }, 60000);

  it('refuses a code never asked for, and one past EMAIL_CODE_TTL_SECONDS', async () => {
    const kay = await api.traveller('kay@email-verification.test');
    expect((await verify(kay.token, '123456')).accepted).toBe(false);
    const expired = String((await ask(kay)).code);
    await sleep((TTL + 2) * 1000);
    expect((await verify(kay.token, expired)).accepted).toBe(false);
    expect(await verified(kay.token)).toBe(false);
    const fresh = String((await ask(kay)).code);
    await api.done('POST', '/accounts/me/email/verify', kay.token, { code: fresh });
    expect(await verified(kay.token)).toBe(true);
  }, 60000);

  it("changes the email under request 1's rules: signed in with the new one only, unverified, its earlier code spent", async () => {
    const lea = await api.traveller('lea@email-verification.test');
    const max = await api.traveller('max@email-verification.test');
    await api.done('POST', '/accounts/me/email/verify', lea.token, { code: String((await ask(lea)).code) });
    expect(await verified(lea.token)).toBe(true);

    for (const email of ['not-an-email', 'lea@nowhere', 'MAX@Email-Verification.test'])
      expect(await api.refused('PUT', '/accounts/me/email', lea.token, { email })).toBe(true);
    expect(
      (await api.call('POST', '/accounts/login', undefined, { email: lea.email, password: PASSWORD })).status,
    ).toBe(200);

    const before = String((await ask(max)).code);
    await api.done('PUT', '/accounts/me/email', lea.token, { email: 'lea.new@email-verification.test' });
    expect(
      (await api.call('POST', '/accounts/login', undefined, { email: lea.email, password: PASSWORD })).status,
    ).toBe(401);
    const token = await api.login('lea.new@email-verification.test');
    expect(await api.read('/accounts/me', token)).toMatchObject({
      id: lea.id,
      email: 'lea.new@email-verification.test',
      emailVerified: false,
    });

    // A code asked for before the change no longer works.
    await api.done('PUT', '/accounts/me/email', max.token, { email: 'max.new@email-verification.test' });
    const maxToken = await api.login('max.new@email-verification.test');
    expect((await verify(maxToken, before)).accepted).toBe(false);
    expect(await verified(maxToken)).toBe(false);
    const notice = await ask({ id: max.id, token: maxToken });
    expect(notice).toMatchObject({ accountId: max.id, email: 'max.new@email-verification.test' });
    await api.done('POST', '/accounts/me/email/verify', maxToken, { code: String(notice.code) });
    expect(await verified(maxToken)).toBe(true);
  }, 60000);
});
