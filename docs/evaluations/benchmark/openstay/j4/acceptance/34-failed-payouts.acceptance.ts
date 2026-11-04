import { client, Client, database, day, eventually, Json, Running, sleep, start, stop } from './openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking } from './provider';

/** Request 34: a failed payout paid again, a disabled account held, what was due reaching the host once. */
const db = database('failed-payouts');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
  // The test settles each payout itself.
  provider.state.settleAfterMs = undefined;
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const payoutsFor = (bookingId: string) => [...provider.payouts.values()].filter(each => each.reference === bookingId);
const created = (bookingId: string, count: number) =>
  eventually(
    async () => payoutsFor(bookingId),
    found => found.length >= count,
    20000,
  );
const listed = (token: string, expected: (payouts: Json[]) => boolean) =>
  eventually(() => api.list('/hosts/me/payouts', token), expected, 20000);
const statuses = (payouts: Json[]) => payouts.map(each => `${String(each.status)} ${String(each.amount)}`).sort();
/** One night from today, at 100 € and 20 € of cleaning: 12 000 for the host, less the provider's fee. */
const DUE = 12000 - feeOf(12000);

/** A booking of tonight on a listing of `token`'s, paid by a new traveller. */
async function paidTonight(token: string, email: string) {
  const tom = await api.traveller(email);
  const id = await api.listing(token);
  const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
  await payBooking(api, provider, tom.token, bookingId);
  return bookingId;
}

describe('failed payouts', () => {
  it('reads a failed payout failed, pays what it carried by a new payout, and never both', async () => {
    const hal = await api.host('hal@failed-payouts.test');
    await enabledAccount(api, provider, hal.token);
    const bookingId = await paidTonight(hal.token, 'tom@failed-payouts.test');

    const [first] = await created(bookingId, 1);
    provider.settlePayout(first.id, false);
    await listed(hal.token, found => found.some(each => each.status === 'failed'));
    const second = (await created(bookingId, 2)).find(each => each.id !== first.id)!;
    expect(second.amount).toBe(DUE);
    provider.settlePayout(second.id);

    const payouts = await listed(hal.token, found => found.some(each => each.status === 'paid'));
    expect(statuses(payouts)).toEqual([`failed ${DUE}`, `paid ${DUE}`]);
    await sleep(3000);
    expect(payoutsFor(bookingId)).toHaveLength(2);
    expect(payoutsFor(bookingId).filter(each => each.status === 'succeeded')).toHaveLength(1);
    expect(statuses(await api.list('/hosts/me/payouts', hal.token))).toEqual([`failed ${DUE}`, `paid ${DUE}`]);
  }, 60000);

  it('pays nothing while the account is disabled, and what is due once it is enabled again', async () => {
    const ian = await api.host('ian@failed-payouts.test');
    const account = await enabledAccount(api, provider, ian.token);
    const bookingId = await paidTonight(ian.token, 'tom2@failed-payouts.test');

    const [first] = await created(bookingId, 1);
    provider.account(account.id, 'disabled');
    await eventually(
      () => api.read('/hosts/me/payout-account', ian.token),
      read => read.status === 'disabled',
    );
    provider.settlePayout(first.id, false);
    await listed(ian.token, found => found.some(each => each.status === 'failed'));
    await sleep(3000);
    expect(payoutsFor(bookingId)).toHaveLength(1);

    provider.account(account.id, 'enabled');
    const second = (await created(bookingId, 2)).find(each => each.id !== first.id)!;
    expect(second.amount).toBe(DUE);
    provider.settlePayout(second.id);
    const payouts = await listed(ian.token, found => found.some(each => each.status === 'paid'));
    expect(statuses(payouts)).toEqual([`failed ${DUE}`, `paid ${DUE}`]);
  }, 60000);
});
