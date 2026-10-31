import { server } from './security';

/**
 * Probe S2 of the security audit: every tree keeps its data in SQLite. What a client writes is
 * data, never a query: it is kept as written or refused, it never breaks the server, and it never
 * reaches another account's data.
 */
const PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE notes; --",
  '" OR ""="',
  "%' OR 1=1 --",
  "Robert'); DROP TABLE accounts;--",
  "1; UPDATE notes SET title='owned'",
  "' UNION SELECT * FROM accounts --",
];

let audited: Awaited<ReturnType<typeof server>>;
beforeAll(async () => {
  audited = await server('injection');
}, 120000);
afterAll(() => audited?.close());

describe('injection', () => {
  it('keeps a note written with a query in it as written, and nothing else changes', async () => {
    const { call, outcome, command, account, note, read, ids } = audited;
    const ada = await account('ada@security.test');
    const bob = await account('bob@security.test');
    const bobs = await note(bob.token, 'Bob keeps this', 'untouched');
    // More notes than the free plan's ten: the quota is not what this probe is about.
    expect((await command('PUT', '/plans/me', ada.token, { plan: 'unlimited' })).status).toBe('SUCCESS');
    const broke: string[] = [];
    for (const payload of PAYLOADS) {
      const answer = await call('POST', '/notes', ada.token, { title: payload, text: payload });
      if (answer.status >= 500) broke.push(`POST /notes ${payload}: ${answer.status}`);
      if (answer.status !== 202) continue;
      const written = await outcome(answer, ada.token);
      if (written.status !== 'SUCCESS') continue;
      const kept = await read(ada.token, String(written.result));
      if (kept.title !== payload || kept.text !== payload) broke.push(`kept differently: ${payload}`);
    }
    expect(broke).toEqual([]);
    expect(await read(bob.token, bobs)).toEqual(
      expect.objectContaining({ title: 'Bob keeps this', text: 'untouched' }),
    );
    expect(await ids('/notes', ada.token)).not.toContain(bobs);
  }, 180000);

  it('answers a query in a filter, a path, a login or a sign-up without breaking and without other data', async () => {
    const { call, account, note, ids } = audited;
    const carl = await account('carl@security.test');
    const dora = await account('dora@security.test');
    const doras = await note(dora.token, 'Dora only');
    const broke: string[] = [];
    for (const payload of PAYLOADS) {
      const encoded = encodeURIComponent(payload);
      const tagged = await call('GET', `/notes?tag=${encoded}`, carl.token);
      if (tagged.status >= 500) broke.push(`GET /notes?tag=${payload}: ${tagged.status}`);
      else if (tagged.status === 200 && JSON.stringify(tagged.body).includes(doras))
        broke.push(`GET /notes?tag=${payload} answered Dora's note`);
      const byId = await call('GET', `/notes/${encoded}`, carl.token);
      if (byId.status >= 500) broke.push(`GET /notes/${payload}: ${byId.status}`);
      else if (byId.status < 300)
        broke.push(`GET /notes/${payload} answered ${byId.status}: ${byId.text.slice(0, 100)}`);
      for (const body of [
        { email: payload, password: 'secret123' },
        { email: 'carl@security.test', password: payload },
        { email: `carl@security.test${payload}`, password: payload },
      ]) {
        const login = await call('POST', '/accounts/login', undefined, body);
        if (login.status !== 401 && login.status !== 400) broke.push(`login ${JSON.stringify(body)}: ${login.status}`);
      }
      const signUp = await call('POST', '/accounts', undefined, { email: payload, password: payload });
      if (signUp.status >= 500) broke.push(`sign-up ${payload}: ${signUp.status}`);
      for (const [path, body] of [
        [`/notes/${doras}/share`, { accountId: payload }],
        ['/plans/me', { plan: payload }],
      ] as const) {
        const answer = await call(path === '/plans/me' ? 'PUT' : 'POST', path, carl.token, body);
        if (answer.status >= 500) broke.push(`${path} ${payload}: ${answer.status}`);
      }
    }
    expect(broke).toEqual([]);
    expect(await ids('/notes', dora.token)).toContain(doras);
    expect((await call('GET', '/plans/me', carl.token)).body).toEqual(expect.objectContaining({ plan: 'free' }));
  }, 240000);
});
