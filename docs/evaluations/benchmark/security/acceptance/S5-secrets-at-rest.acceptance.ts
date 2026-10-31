import { filesUnder, keys, readableForms, server } from './security';

/**
 * Probe S5 of the security audit: what the server keeps on disk, and what it answers, never holds
 * a password readable. Someone who copies the database file learns no password, and no answer of
 * the API carries a password or what it was turned into.
 */
const PASSWORD = 'Audit-Pa55phrase-7f3c9e';

let audited: Awaited<ReturnType<typeof server>>;
beforeAll(async () => {
  audited = await server('secrets-at-rest');
}, 120000);
afterAll(() => audited?.close());

describe('secrets at rest', () => {
  it('keeps no password readable in any file it stores', async () => {
    const { account, note, directory } = audited;
    const ada = await account('ada@security.test', PASSWORD);
    await note(ada.token, 'Something to store');
    const forms = readableForms(PASSWORD);
    const found = filesUnder(directory)
      .filter(({ bytes }) => forms.some(form => bytes.includes(form)))
      .map(({ path }) => path.slice(directory.length));
    expect(found).toEqual([]);
  }, 120000);

  it('answers no password, hash or salt, to its owner or anyone', async () => {
    const { call, outcome, account, note } = audited;
    const signUp = await call('POST', '/accounts', undefined, { email: 'bob@security.test', password: PASSWORD });
    const signedUp = await outcome(signUp);
    const login = await call('POST', '/accounts/login', undefined, { email: 'bob@security.test', password: PASSWORD });
    const token = String(login.body.token);
    const carl = await account('carl@security.test');
    const shared = await note(token, 'Shared with Carl');
    await outcome(await call('POST', `/notes/${shared}/share`, token, { accountId: carl.id }), token);
    const answers = [
      signUp,
      { body: signedUp, text: JSON.stringify(signedUp) },
      login,
      await call('GET', '/accounts/me', token),
      await call('GET', `/notes/${shared}`, token),
      await call('GET', '/notes/shared', carl.token),
      await call('GET', `/notes/${shared}`, carl.token),
    ];
    for (const answer of answers) {
      expect(answer.text).not.toContain(PASSWORD);
      expect(keys(answer.body).filter(key => /pass|hash|salt/i.test(key))).toEqual([]);
    }
  }, 120000);
});
