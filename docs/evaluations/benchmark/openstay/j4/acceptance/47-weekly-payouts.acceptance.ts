import { client, Client, database, day, eventually, Json, Running, sleep, start, stop, WEEKDAYS } from './openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking, ProviderAccount } from './provider';

/** Request 47: a host paid once a week, in one payout of everything due, with nothing paid twice or skipped. */
const db = database('weekly-payouts');
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

const TODAY = WEEKDAYS[new Date().getUTCDay()];
const ANOTHER_DAY = WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
/** One night from today, at 100 € and 20 € of cleaning: 12 000 for the host, less the provider's fee. */
const DUE = 12000 - feeOf(12000);
const payoutsTo = (account: ProviderAccount) =>
  [...provider.payouts.values()].filter(each => each.account === account.id);
const listed = (token: string, expected: (payouts: Json[]) => boolean) =>
  eventually(() => api.list('/hosts/me/payouts', token), expected, 20000);

/** A host on a weekly schedule on another day, with an enabled account and `count` bookings of tonight paid. */
async function weeklyHost(name: string, count: number) {
  const host = await api.host(`${name}@weekly-payouts.test`);
  const tom = await api.traveller(`tom-${name}@weekly-payouts.test`);
  await api.done('PUT', '/hosts/me/payout-schedule', host.token, { schedule: 'weekly', weekday: ANOTHER_DAY });
  const account = await enabledAccount(api, provider, host.token);
  const bookings: string[] = [];
  for (let n = 0; n < count; n++) {
    const id = await api.listing(host.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
    await payBooking(api, provider, tom.token, bookingId);
    bookings.push(bookingId);
  }
  await sleep(3000);
  return { host, account, bookings };
}

describe('weekly payouts', () => {
  it('pays daily until the host chooses a weekday, and refuses a schedule that makes no sense', async () => {
    const hal = await api.host('hal@weekly-payouts.test');
    const path = '/hosts/me/payout-schedule';
    expect(await api.read(path, hal.token)).toEqual({ schedule: 'daily', weekday: null });
    expect(await api.refused('PUT', path, hal.token, { schedule: 'weekly' })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { schedule: 'weekly', weekday: 'funday' })).toBe(true);
    expect(await api.refused('PUT', path, hal.token, { schedule: 'monthly', weekday: 'monday' })).toBe(true);
    expect(await api.read(path, hal.token)).toEqual({ schedule: 'daily', weekday: null });
    await api.done('PUT', path, hal.token, { schedule: 'weekly', weekday: 'friday' });
    expect(await api.read(path, hal.token)).toEqual({ schedule: 'weekly', weekday: 'friday' });
  }, 60000);

  it('pays nothing on another day, and everything due in one payout on the weekday chosen', async () => {
    const { host, account, bookings } = await weeklyHost('ian', 2);
    expect(payoutsTo(account)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', host.token)).toEqual([]);

    await api.done('PUT', '/hosts/me/payout-schedule', host.token, { schedule: 'weekly', weekday: TODAY });
    const payouts = await listed(host.token, found => found.some(each => each.status === 'paid'));
    expect(payouts).toHaveLength(1);
    expect([...(payouts[0].bookingIds as string[])].sort()).toEqual([...bookings].sort());
    expect(payouts[0].amount).toBe(2 * DUE);
    await sleep(3000);
    expect(await api.list('/hosts/me/payouts', host.token)).toHaveLength(1);
    expect(payoutsTo(account).map(each => each.amount)).toEqual([2 * DUE]);
  }, 90000);

  it('skips nothing and pays nothing twice when the host goes back to daily', async () => {
    const { host, account, bookings } = await weeklyHost('jon', 1);
    expect(payoutsTo(account)).toEqual([]);

    await api.done('PUT', '/hosts/me/payout-schedule', host.token, { schedule: 'daily' });
    expect(await api.read('/hosts/me/payout-schedule', host.token)).toEqual({ schedule: 'daily', weekday: null });
    const payouts = await listed(host.token, found => found.some(each => each.status === 'paid'));
    expect(payouts.map(each => [each.bookingIds, each.amount])).toEqual([[bookings, DUE]]);
    await sleep(3000);
    expect(payoutsTo(account).map(each => each.amount)).toEqual([DUE]);
  }, 90000);
});
