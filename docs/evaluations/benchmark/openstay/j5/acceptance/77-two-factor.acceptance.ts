import { client, Client, clock, database, Json, PASSWORD, Running, start, stop, totp } from './openstay';

/**
 * Request 77: two-factor sign-in with time-based codes (RFC 6238) and ten recovery codes. Each code is
 * used once, and no code of an earlier step after it; the codes follow the machine's clock, never
 * CLOCK_OFFSET_DAYS. A case uses the code of the step it confirmed at, then the step after it, which
 * the server accepts at once: it never needs to wait for the clock.
 */
const db = database('two-factor');
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

interface Person {
  id: string;
  email: string;
  token: string;
}
interface Enabled {
  secret: string;
  recoveryCodes: string[];
  /** When the confirming code was made: its step is the one used, `totp(secret, at, 1)` the next. */
  at: number;
}
const signIn = (email: string, proof: Json = {}, on = api, password = PASSWORD) =>
  on.call('POST', '/accounts/login', undefined, { email, password, ...proof });
const twoFactorOf = async (token: string, on = api) => (await on.read('/accounts/me', token)).twoFactor;
const secretFor = async (token: string, on = api) =>
  String(((await on.done('POST', '/accounts/me/2fa', token)) as Json).secret);
/** A six-digit code that none of the three steps around now accepts for `secret`. */
const wrongFor = (secret: string) => {
  const near = [-1, 0, 1].map(steps => totp(secret, Date.now(), steps));
  return ['000000', '111111', '222222', '333333'].find(code => !near.includes(code))!;
};
/** Turns two-factor sign-in on for `person`: a secret, confirmed by the code of the current step. */
async function enable(person: Person, on = api): Promise<Enabled> {
  const secret = await secretFor(person.token, on);
  const at = Date.now();
  const result = (await on.done('POST', '/accounts/me/2fa/confirm', person.token, { code: totp(secret, at) })) as Json;
  return { secret, recoveryCodes: result.recoveryCodes as string[], at };
}
const required = (answer: { status: number; body: Json }) =>
  answer.status === 401 && answer.body?.twoFactorRequired === true && answer.body?.token === undefined;

describe('two-factor sign-in', () => {
  it('turns on once a new secret is confirmed by its code, and answers ten different recovery codes', async () => {
    const hal = await api.host('hal@two-factor.test');
    expect(await twoFactorOf(hal.token)).toBe(false);
    const first = await secretFor(hal.token);
    expect(first).toMatch(/^[A-Z2-7]+$/);
    expect(await twoFactorOf(hal.token)).toBe(false);
    expect((await signIn(hal.email)).status).toBe(200);
    expect(await api.refused('POST', '/accounts/me/2fa/confirm', hal.token, { code: wrongFor(first) })).toBe(true);

    // Asked again before confirming: the new secret replaces the first.
    const secret = await secretFor(hal.token);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret).not.toBe(first);
    const stale = totp(first);
    if (![-1, 0, 1].map(steps => totp(secret, Date.now(), steps)).includes(stale))
      expect(await api.refused('POST', '/accounts/me/2fa/confirm', hal.token, { code: stale })).toBe(true);
    expect(await twoFactorOf(hal.token)).toBe(false);

    const result = (await api.done('POST', '/accounts/me/2fa/confirm', hal.token, { code: totp(secret) })) as Json;
    const codes = result.recoveryCodes as string[];
    expect(codes).toHaveLength(10);
    expect(codes.every(code => typeof code === 'string' && code.length > 0)).toBe(true);
    expect(new Set(codes).size).toBe(10);
    // The token given before it was turned on still works.
    expect(await twoFactorOf(hal.token)).toBe(true);
    expect(await api.refused('POST', '/accounts/me/2fa', hal.token)).toBe(true);
  }, 60000);

  it('asks for a valid code or an unused recovery code at sign-in, each used once, and no code of an earlier step', async () => {
    const tom = await api.traveller('tom@two-factor.test');
    const { secret, recoveryCodes, at } = await enable(tom);
    expect(required(await signIn(tom.email))).toBe(true);
    expect(required(await signIn(tom.email, { code: wrongFor(secret) }))).toBe(true);
    // The code that confirmed it is used.
    expect(required(await signIn(tom.email, { code: totp(secret, at) }))).toBe(true);

    const signed = await signIn(tom.email, { code: totp(secret, at, 1) });
    expect(signed.status).toBe(200);
    expect(typeof signed.body.token).toBe('string');
    expect(await api.read('/accounts/me', String(signed.body.token))).toMatchObject({ id: tom.id, twoFactor: true });
    expect(required(await signIn(tom.email, { code: totp(secret, at, 1) }))).toBe(true);
    expect(required(await signIn(tom.email, { code: totp(secret, at) }))).toBe(true);

    const recovered = await signIn(tom.email, { recoveryCode: recoveryCodes[0] });
    expect(recovered.status).toBe(200);
    expect(typeof recovered.body.token).toBe('string');
    expect(required(await signIn(tom.email, { recoveryCode: recoveryCodes[0] }))).toBe(true);
    expect(required(await signIn(tom.email, { recoveryCode: 'not-a-recovery-code' }))).toBe(true);

    // A wrong password is request 1's refusal, whatever else is given.
    for (const proof of [{}, { code: wrongFor(secret) }, { recoveryCode: recoveryCodes[1] }]) {
      const answer = await signIn(tom.email, proof, api, 'wrong-password');
      expect(answer.status).toBe(401);
      expect(answer.body?.twoFactorRequired).not.toBe(true);
      expect(answer.body?.token).toBeUndefined();
    }
    expect((await signIn('nobody@two-factor.test')).status).toBe(401);
  }, 60000);

  it('gives one token for one code sent at the same moment to two servers', async () => {
    const una = await api.traveller('una@two-factor.test');
    const { secret, at } = await enable(una);
    const second = await start(db.path);
    try {
      const other = client(second.port);
      const code = totp(secret, at, 1);
      const answers = await Promise.all([signIn(una.email, { code }), signIn(una.email, { code }, other)]);
      expect(answers.filter(answer => answer.status === 200)).toHaveLength(1);
      expect(answers.filter(answer => required(answer))).toHaveLength(1);
    } finally {
      await stop(second);
    }
  }, 90000);

  it('turns off with an unused recovery code, spending the others, and on again with a new secret and new codes', async () => {
    const ian = await api.host('ian@two-factor.test');
    const { secret, recoveryCodes, at } = await enable(ian);
    expect(await api.refused('POST', '/accounts/me/2fa/disable', ian.token, { code: wrongFor(secret) })).toBe(true);
    expect(
      await api.refused('POST', '/accounts/me/2fa/disable', ian.token, { recoveryCode: 'not-a-recovery-code' }),
    ).toBe(true);
    expect(await twoFactorOf(ian.token)).toBe(true);

    await api.done('POST', '/accounts/me/2fa/disable', ian.token, { recoveryCode: recoveryCodes[0] });
    // The token given before it was turned off still works.
    expect(await twoFactorOf(ian.token)).toBe(false);
    const plain = await signIn(ian.email);
    expect(plain.status).toBe(200);
    expect(typeof plain.body.token).toBe('string');

    const again = await secretFor(ian.token);
    expect(again).not.toBe(secret);
    // Confirmed with the code of the step after the first confirmation: never an earlier step.
    const result = (await api.done('POST', '/accounts/me/2fa/confirm', ian.token, {
      code: totp(again, at, 1),
    })) as Json;
    const fresh = result.recoveryCodes as string[];
    expect(fresh).toHaveLength(10);
    expect(await twoFactorOf(ian.token)).toBe(true);
    expect(required(await signIn(ian.email, { recoveryCode: recoveryCodes[1] }))).toBe(true);
    expect((await signIn(ian.email, { recoveryCode: fresh[0] })).status).toBe(200);
  }, 60000);

  it('turns off with a valid code', async () => {
    const joe = await api.host('joe@two-factor.test');
    const { secret, at } = await enable(joe);
    await api.done('POST', '/accounts/me/2fa/disable', joe.token, { code: totp(secret, at, 1) });
    expect(await twoFactorOf(joe.token)).toBe(false);
    expect((await signIn(joe.email)).status).toBe(200);
  }, 60000);

  it("follows the machine's clock, not CLOCK_OFFSET_DAYS", async () => {
    const own = database('two-factor-clock');
    const moved = await start(own.path, clock(3));
    try {
      const on = client(moved.port);
      const kim = await on.traveller('kim@two-factor.test');
      const { secret, at } = await enable(kim, on);
      expect(await twoFactorOf(kim.token, on)).toBe(true);
      const signed = await signIn(kim.email, { code: totp(secret, at, 1) }, on);
      expect(signed.status).toBe(200);
    } finally {
      await stop(moved);
      own.remove();
    }
  }, 90000);
});
