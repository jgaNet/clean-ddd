import { client, Client, database, eventually, kill, PASSWORD, Running, sleep, start, stop } from './tally';

/** Request 1: accounts, signing in, how the API works, and data that outlives the server. */
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
  it('signs up people with a name, and lets each read their own account', async () => {
    const ann = await api.person('ann@tally.test', 'Ann Archer');
    const bob = await api.person('bob@tally.test', 'Bob');

    expect(await api.read('/accounts/me', ann.token)).toMatchObject({
      id: ann.id,
      email: 'ann@tally.test',
      name: 'Ann Archer',
    });
    expect(await api.read('/accounts/me', bob.token)).toMatchObject({
      id: bob.id,
      email: 'bob@tally.test',
      name: 'Bob',
    });
    expect(ann.id).not.toBe(bob.id);
  }, 60000);

  it('refuses an email used twice, whatever its case, and what is not allowed', async () => {
    await api.person('cy@tally.test');
    const signUp = (email: string, password: string, name: string) =>
      api.refused('POST', '/accounts', undefined, { email, password, name });

    expect(await signUp('CY@Tally.test', PASSWORD, 'Cy')).toBe(true);
    expect(await signUp('not-an-email', PASSWORD, 'Not')).toBe(true);
    expect(await signUp('no@dot', PASSWORD, 'No')).toBe(true);
    expect(await signUp('short@tally.test', 'seven77', 'Short')).toBe(true);
    expect(await signUp('blank@tally.test', PASSWORD, '   ')).toBe(true);
    expect(await signUp('empty@tally.test', PASSWORD, '')).toBe(true);
    expect(await signUp('long@tally.test', PASSWORD, 'x'.repeat(61))).toBe(true);
    expect(await signUp('eight@tally.test', 'eight888', 'x'.repeat(60))).toBe(false);
  }, 60000);

  it('refuses a wrong password and an unknown email alike, and a request without a valid token', async () => {
    await api.person('dee@tally.test');
    const wrong = await api.call('POST', '/accounts/login', undefined, {
      email: 'dee@tally.test',
      password: 'nope-nope',
    });
    const unknown = await api.call('POST', '/accounts/login', undefined, {
      email: 'who@tally.test',
      password: PASSWORD,
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);

    expect((await api.call('GET', '/accounts/me')).status).toBe(401);
    expect((await api.call('GET', '/accounts/me', 'not-a-token')).status).toBe(401);
  }, 60000);

  it('refuses a body of the wrong shape at once with 400, and anything else it cannot do with a 4xx or an ERROR, never a 5xx', async () => {
    await api.person('fay@tally.test');
    // A field missing, or of the wrong type: the transport's, answered at once with 400, even by an application
    // that answers these requests later otherwise (request 1).
    const shapes: [string, unknown][] = [
      ['/accounts', { email: 'fay4@tally.test', name: 'Fay' }],
      ['/accounts', { email: 42, password: PASSWORD, name: 'Fay' }],
      ['/accounts', { email: 'fay5@tally.test', password: PASSWORD }],
      ['/accounts', { email: 'fay6@tally.test', password: PASSWORD, name: 7 }],
      ['/accounts', {}],
      ['/accounts/login', { email: 'fay@tally.test' }],
      ['/accounts/login', { email: 'fay@tally.test', password: 42 }],
    ];
    const shaped: string[] = [];
    for (const [path, body] of shapes)
      shaped.push(`POST ${path} ${JSON.stringify(body)}: ${(await api.call('POST', path, undefined, body)).status}`);
    expect(shaped.filter(line => !/: 400$/.test(line))).toEqual([]);

    // A value not allowed, or a token that proves nothing: a 4xx at once, or an operation that ends in ERROR.
    const refusals: [string, string, string | undefined, unknown][] = [
      ['POST', '/accounts', undefined, { email: 'FAY@tally.test', password: PASSWORD, name: 'Fay' }],
      ['POST', '/accounts', undefined, { email: 'fay2@tally.test', password: 'seven77', name: 'Fay' }],
      ['POST', '/accounts', undefined, { email: 'fay3@tally.test', password: PASSWORD, name: ' ' }],
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
    await api.person('gus@tally.test');
    const signUp = (email: string, password: string, name: string) =>
      api.act('POST', '/accounts', undefined, { email, password, name });
    const refused = {
      taken: await signUp('GUS@tally.test', PASSWORD, 'Gus'),
      short: await signUp('gus2@tally.test', 'seven77', 'Gus'),
      email: await signUp('not-an-email', PASSWORD, 'Gus'),
      name: await signUp('gus3@tally.test', PASSWORD, '  '),
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
    const hue = await api.person('hue@tally.test');
    expect((await api.call('GET', '/operations/00000000-0000-4000-8000-000000000000', hue.token)).status).toBe(404);
  }, 60000);

  it('changes nothing by a read while its background job runs', async () => {
    // Request 1: what changes with time changes at the next run of the job (every JOBS_INTERVAL_SECONDS, 1 on the
    // tests' servers), never because someone read it. Nothing of an account changes with time: read again after
    // several runs, it is what was kept, and the server still answers.
    const ivy = await api.person('ivy@tally.test', 'Ivy');
    const first = await api.read('/accounts/me', ivy.token);
    await sleep(2500);
    expect(await api.read('/accounts/me', ivy.token)).toEqual(first);
  }, 60000);

  it('keeps every account when the server is killed and started again on the same file', async () => {
    const eve = await api.person('eve@tally.test', 'Eve');
    await kill(server);
    server = await start(db.path);
    api = client(server.port);

    const token = await api.login('eve@tally.test');
    expect(await api.read('/accounts/me', token)).toMatchObject({ id: eve.id, email: 'eve@tally.test', name: 'Eve' });
    expect(
      await api.refused('POST', '/accounts', undefined, { email: 'eve@tally.test', password: PASSWORD, name: 'Eve' }),
    ).toBe(true);
  }, 90000);
});
