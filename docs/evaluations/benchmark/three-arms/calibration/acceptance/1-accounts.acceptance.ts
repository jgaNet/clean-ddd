import { client, Client, database, eventually, kill, PASSWORD, Running, start, stop } from './openstay';

/** Request 1: accounts, signing in, and data that outlives the server. */
const db = database('accounts');
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

describe('accounts', () => {
  it('signs up a traveller, a host, or both, and lets each read their own account', async () => {
    const ann = await api.account('ann@openstay.test', ['traveller']);
    const hal = await api.account('hal@openstay.test', ['host']);
    const bea = await api.account('bea@openstay.test', ['traveller', 'host']);

    const me = await api.read('/accounts/me', ann.token);
    expect(me).toMatchObject({ id: ann.id, email: 'ann@openstay.test', roles: ['traveller'] });
    expect((await api.read('/accounts/me', hal.token)).roles).toEqual(['host']);
    expect([...((await api.read('/accounts/me', bea.token)).roles as string[])].sort()).toEqual(['host', 'traveller']);
    expect(new Set([ann.id, hal.id, bea.id]).size).toBe(3);
  }, 60000);

  it('refuses an email used twice, whatever its case, and what is not allowed', async () => {
    await api.account('cy@openstay.test');
    const signUp = (email: string, password: string, roles: unknown) =>
      api.refused('POST', '/accounts', undefined, { email, password, roles });

    expect(await signUp('CY@OpenStay.test', PASSWORD, ['traveller'])).toBe(true);
    expect(await signUp('not-an-email', PASSWORD, ['traveller'])).toBe(true);
    expect(await signUp('no@dot', PASSWORD, ['traveller'])).toBe(true);
    expect(await signUp('short@openstay.test', 'seven77', ['traveller'])).toBe(true);
    expect(await signUp('none@openstay.test', PASSWORD, [])).toBe(true);
    expect(await signUp('admin@openstay.test', PASSWORD, ['admin'])).toBe(true);
    expect(await signUp('eight@openstay.test', 'eight888', ['host'])).toBe(false);
  }, 60000);

  it('refuses a wrong password and an unknown email alike, and a request without a valid token', async () => {
    await api.account('dee@openstay.test');
    const wrong = await api.call('POST', '/accounts/login', undefined, {
      email: 'dee@openstay.test',
      password: 'nope-nope',
    });
    const unknown = await api.call('POST', '/accounts/login', undefined, {
      email: 'who@openstay.test',
      password: PASSWORD,
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);

    expect((await api.call('GET', '/accounts/me')).status).toBe(401);
    expect((await api.call('GET', '/accounts/me', 'not-a-token')).status).toBe(401);
  }, 60000);

  it('refuses a body of the wrong shape at once with 400, and anything else it cannot do with a 4xx or an ERROR, never a 5xx', async () => {
    await api.account('fay@openstay.test');
    // A field missing, or of the wrong type: the transport's, answered at once with 400, even by an application
    // that answers these requests later otherwise (request 1).
    const shapes: [string, unknown][] = [
      ['/accounts', { email: 'fay4@openstay.test', roles: ['traveller'] }],
      ['/accounts', { email: 42, password: PASSWORD, roles: ['traveller'] }],
      ['/accounts', { email: 'fay5@openstay.test', password: PASSWORD, roles: 'traveller' }],
      ['/accounts', {}],
      ['/accounts/login', { email: 'fay@openstay.test' }],
      ['/accounts/login', { email: 'fay@openstay.test', password: 42 }],
    ];
    const shaped: string[] = [];
    for (const [path, body] of shapes)
      shaped.push(`POST ${path} ${JSON.stringify(body)}: ${(await api.call('POST', path, undefined, body)).status}`);
    expect(shaped.filter(line => !/: 400$/.test(line))).toEqual([]);

    // A value not allowed, or a token that proves nothing: a 4xx at once, or an operation that ends in ERROR.
    const refusals: [string, string, string | undefined, unknown][] = [
      ['POST', '/accounts', undefined, { email: 'FAY@openstay.test', password: PASSWORD, roles: ['traveller'] }],
      ['POST', '/accounts', undefined, { email: 'fay2@openstay.test', password: 'seven77', roles: ['traveller'] }],
      ['POST', '/accounts', undefined, { email: 'fay3@openstay.test', password: PASSWORD, roles: ['admin'] }],
      ['GET', '/accounts/me', 'not-a-token', undefined],
    ];
    const answered: string[] = [];
    for (const [method, path, token, body] of refusals) {
      const answer = await api.call(method, path, token, body);
      let status = String(answer.status);
      // Answered later: what counts is how the operation ends (its error is the next test's).
      if (answer.status === 202 && typeof answer.body?.operationId === 'string') {
        const ended = await eventually(
          async () => (await api.call('GET', `/operations/${answer.body.operationId}`, token)).body,
          operation => operation?.status === 'SUCCESS' || operation?.status === 'ERROR',
          60000,
        );
        status = `202 then ${String(ended?.status)}`;
      }
      answered.push(`${method} ${path} ${JSON.stringify(body)}: ${status}`);
    }
    // A 5xx says the server failed; any other 2xx, or an operation that succeeds, would be an acceptance.
    expect(answered.filter(line => !/: (4\d\d|202 then ERROR)$/.test(line))).toEqual([]);
  }, 120000);

  it("names the refused rule in the operation's error", async () => {
    // Request 1 lets the application answer a refusal at once (a 4xx, whose body it does not fix) or later (an
    // operation that ends in ERROR, with `error: { type, message }`). Signing up may be answered either way, so
    // the error is checked on the refusals answered later only; an application that answers all of these at once
    // has nothing to check here, and its refusals are held by the test above.
    await api.account('gus@openstay.test');
    const signUp = (email: string, password: string, roles: string[]) =>
      api.act('POST', '/accounts', undefined, { email, password, roles });
    const refused = {
      taken: await signUp('GUS@openstay.test', PASSWORD, ['traveller']),
      short: await signUp('gus2@openstay.test', 'seven77', ['traveller']),
      email: await signUp('not-an-email', PASSWORD, ['traveller']),
      role: await signUp('gus3@openstay.test', PASSWORD, ['admin']),
    };
    for (const outcome of Object.values(refused)) {
      expect(outcome.accepted).toBe(false);
      if (outcome.later)
        expect(outcome.error).toMatchObject({
          type: expect.stringMatching(/^[A-Z][A-Za-z0-9]*$/),
          message: expect.stringMatching(/\S/),
        });
    }
    // Two rules, two names: an email already used is not a password too short.
    if (refused.taken.later && refused.short.later)
      expect(refused.taken.error?.type).not.toBe(refused.short.error?.type);
  }, 60000);

  it('answers 404 for something that does not exist', async () => {
    const ann = await api.account('hue@openstay.test');
    expect((await api.call('GET', '/operations/00000000-0000-4000-8000-000000000000', ann.token)).status).toBe(404);
  }, 60000);

  it('keeps every account when the server is killed and started again on the same file', async () => {
    const eve = await api.account('eve@openstay.test', ['host', 'traveller']);
    await kill(server);
    server = await start(db.path);
    api = client(server.port);

    const token = await api.login('eve@openstay.test');
    expect(await api.read('/accounts/me', token)).toMatchObject({ id: eve.id, email: 'eve@openstay.test' });
    expect(
      await api.refused('POST', '/accounts', undefined, {
        email: 'eve@openstay.test',
        password: PASSWORD,
        roles: ['host'],
      }),
    ).toBe(true);
  }, 90000);
});
