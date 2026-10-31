import { forgeries, server } from './security';

/**
 * Probe S1 of the security audit: a token is the only proof of who is calling. One made from
 * another, or from nothing, must prove nobody, and above all not another account.
 */
let audited: Awaited<ReturnType<typeof server>>;
beforeAll(async () => {
  audited = await server('tokens');
}, 120000);
afterAll(() => audited?.close());

describe('tokens', () => {
  it('refuses a call with no token, or with a token that is not one', async () => {
    const { call } = audited;
    const answered: string[] = [];
    for (const token of [undefined, 'not-a-token', '', 'null', 'undefined'])
      for (const path of ['/accounts/me', '/notes', '/notifications', '/plans/me']) {
        const { status } = await call('GET', path, token);
        if (status < 400 || status >= 500) answered.push(`${path} with ${JSON.stringify(token)}: ${status}`);
      }
    expect(answered).toEqual([]);
  }, 120000);

  it('proves nobody with a token forged from a real one, least of all the other account', async () => {
    const { call, account, note, read } = audited;
    const mallory = await account('mallory@security.test');
    const ada = await account('ada@security.test');
    const secret = await note(ada.token, 'Ada only');
    expect((await read(ada.token, secret)).title).toBe('Ada only');

    const accepted: string[] = [];
    for (const forged of forgeries(mallory.token, mallory.id, ada.id)) {
      const me = await call('GET', '/accounts/me', forged.token);
      const notes = await call('GET', `/notes/${secret}`, forged.token);
      if (me.status < 300 || notes.status < 300)
        accepted.push(`${forged.name}: me ${me.status}, Ada's note ${notes.status}`);
    }
    expect(accepted).toEqual([]);
  }, 120000);
});
