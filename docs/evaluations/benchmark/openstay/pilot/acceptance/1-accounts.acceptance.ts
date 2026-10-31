import { client, Client, database, kill, PASSWORD, Running, start, stop } from './openstay';

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
