import { client, Client, database, eventually, idOf, Running, sleep, start, stop } from './openstay';
import { openAccount, paymentProvider } from './provider';

/** Request 26: a host's payout account, opened with the provider and changed by its webhooks only. */
const db = database('payout-accounts');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const status = async (token: string) => (await api.read('/hosts/me/payout-account', token)).status;
const ok = (status: number) => status >= 200 && status < 300;

describe('payout accounts', () => {
  it('opens one account with the provider, gives the same one when asked again, and shows it to its host', async () => {
    const hal = await api.host('hal@payout-accounts.test');
    const ian = await api.host('ian@payout-accounts.test');
    const tom = await api.traveller('tom@payout-accounts.test');
    expect((await api.call('GET', '/hosts/me/payout-account', hal.token)).status).toBe(404);

    const before = provider.accounts.size;
    const account = await openAccount(api, provider, hal.token);
    const read = await api.read('/hosts/me/payout-account', hal.token);
    expect(read).toMatchObject({
      id: expect.any(String),
      status: 'pending',
      onboardingUrl: `https://provider.test/onboard/${account.id}`,
    });

    const again = await api.act('POST', '/hosts/me/payout-account', hal.token);
    expect(again.accepted).toBe(true);
    expect(idOf(again.result)).toBe(read.id);
    expect(await api.read('/hosts/me/payout-account', hal.token)).toEqual(read);
    expect(provider.accounts.size).toBe(before + 1);

    expect((await api.call('GET', '/hosts/me/payout-account', ian.token)).status).toBe(404);
    expect(await api.refused('POST', '/hosts/me/payout-account', tom.token)).toBe(true);
  }, 60000);

  it('reads pending until the provider says enabled or disabled, and asking again changes nothing', async () => {
    const hal = await api.host('hal2@payout-accounts.test');
    const account = await openAccount(api, provider, hal.token);
    expect(await status(hal.token)).toBe('pending');

    const enabled = provider.account(account.id, 'enabled');
    expect(await eventually(() => status(hal.token), each => each === 'enabled')).toBe('enabled');
    await provider.settled();
    expect(provider.deliveries.some(each => each.event === enabled.id && ok(each.status))).toBe(true);
    await api.act('POST', '/hosts/me/payout-account', hal.token);
    expect(await status(hal.token)).toBe('enabled');

    provider.account(account.id, 'disabled');
    expect(await eventually(() => status(hal.token), each => each === 'disabled')).toBe('disabled');
  }, 60000);

  it('refuses with 400 a webhook unsigned, wrongly signed or more than five minutes old, and it changes nothing', async () => {
    const hal = await api.host('hal3@payout-accounts.test');
    const account = await openAccount(api, provider, hal.token);
    const data = { ...account, status: 'enabled' };

    expect(await provider.forge('account.updated', data)).toBe(400);
    const now = Math.floor(Date.now() / 1000);
    expect(await provider.forge('account.updated', data, `t=${now},v1=${'0'.repeat(64)}`)).toBe(400);
    expect(await provider.signed('account.updated', data, 600)).toBe(400);
    await sleep(1000);
    expect(await status(hal.token)).toBe('pending');

    expect(ok(await provider.signed('account.updated', data))).toBe(true);
    expect(await eventually(() => status(hal.token), each => each === 'enabled')).toBe('enabled');
  }, 60000);
});
