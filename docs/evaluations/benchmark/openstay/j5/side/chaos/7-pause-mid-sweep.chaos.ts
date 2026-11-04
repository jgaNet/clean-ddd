import { adminEnvironment, database, day, eventually, Json, sleep, WEEKDAYS } from '../../acceptance/openstay';
import {
  enabledAccount,
  feeOf,
  openAccount,
  paymentProvider,
  payBooking,
  ProviderAccount,
} from '../../acceptance/provider';
import { cluster, Cluster, providerGate, Sent, within } from './faults';

/**
 * Chaos on the money, 7: an administrator pauses payouts (request 100) on one server while the work on
 * another server is mid-way through a sweep: one of its payouts is on its way to the provider, held at
 * the gate, and others are still to send. From the moment the pause is answered no new payout reaches
 * the provider; the one already sent goes on; resuming pays every booking once, nothing lost, even when
 * the server mid-way is killed between the provider's answer and the write. One night at 100 € and 20 €
 * of cleaning: 12 000 paid, less the provider's fee.
 */
const ADA = 'ada@chaos-pause.test';
const REASON = 'The provider sends money to the wrong accounts.';
const DUE = 12000 - feeOf(12000);
/** A payout sent a moment before the pause is answered is not one sent after it. */
const GRACE = 500;
const provider = paymentProvider();
const gate = providerGate(provider);
const databases: ReturnType<typeof database>[] = [];
const clusters: Cluster[] = [];
afterAll(async () => {
  for (const each of clusters) await each.stop();
  await gate.close();
  await provider.close();
  for (const each of databases) each.remove();
}, 90000);

/** Two servers, `a` and `b`, on a database of the case's own; the provider attached to `a`. */
async function twoServers(name: string) {
  const db = database(name);
  databases.push(db);
  const servers = cluster(provider, gate, db.path, { ...adminEnvironment(ADA), JOBS_INTERVAL_SECONDS: '1' });
  clusters.push(servers);
  await servers.up('a');
  await servers.up('b');
  servers.attach('a');
  await servers.node('a').api.admin(ADA);
  return servers;
}
const payoutsTo = (account: ProviderAccount) =>
  [...provider.payouts.values()].filter(each => each.account === account.id);
const payoutsFor = (bookingId: string) => [...provider.payouts.values()].filter(each => each.reference === bookingId);
const posted = (account: ProviderAccount) => (sent: Sent) =>
  sent.method === 'POST' && sent.path === '/payouts' && sent.body.account === account.id;

/**
 * Pauses on the server that is not `busy`, while `busy`'s payout is held at the gate: the held payout
 * goes on once the pause is answered (or after 4 s, if the pause waits for it). Gives when the pause was
 * answered, and what the provider answered the held payout.
 */
async function pauseBeside(servers: Cluster, busy: string, release: () => Promise<Json>) {
  const other = servers.node(busy === 'a' ? 'b' : 'a').api;
  const token = await other.login(ADA);
  const pausing = other.done('POST', '/admin/payouts/pause', token, { reason: REASON }).then(() => Date.now());
  const answered = await within(pausing, 4000);
  if (answered !== undefined) await sleep(1000);
  const held = release();
  const pausedAt = answered ?? (await pausing);
  return { pausedAt, held: await held };
}

describe('chaos: pausing payouts while a sweep is mid-way on another server', () => {
  it('sends no new payout once the pause is answered, lets the one on its way go on, and pays each booking once on resume', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const servers = await twoServers('chaos-pause-sweep');
      const api = servers.node('a').api;
      const hal = await api.host('hal@chaos-pause.test');
      const tom = await api.traveller('tom@chaos-pause.test');
      // Three bookings due at once: the account is enabled once all three are paid.
      const account = await openAccount(api, provider, hal.token);
      const bookings: string[] = [];
      for (let n = 0; n < 3; n++) {
        const id = await api.listing(hal.token);
        bookings.push(await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1))));
        await payBooking(api, provider, tom.token, bookings[n]);
      }
      const hold = gate.hold(posted(account));
      provider.account(account.id, 'enabled');
      const caught = await within(hold.arrived, 30000);
      expect(caught).toBeDefined();

      const { pausedAt, held } = await pauseBeside(servers, caught!.server, () => hold.release());
      await sleep(4000);
      // Request 100: "From the moment the pause is answered, no server sends any payout to the provider".
      expect(payoutsTo(account).filter(each => each.id !== held.id && each.at > pausedAt + GRACE)).toEqual([]);
      // "A payout sent before the pause goes on too: its payout.paid ... is handled as before."
      provider.settlePayout(String(held.id), true);
      const token = await api.login(hal.email);
      await eventually(
        () => api.list('/hosts/me/payouts', token),
        found => found.some(each => each.status === 'paid'),
        30000,
      );
      await sleep(2000);
      expect(payoutsTo(account).filter(each => each.id !== held.id && each.at > pausedAt + GRACE)).toEqual([]);

      // Resumed on the server that was mid-way: "Nothing is lost", "Each booking is still paid out once".
      const busy = servers.node(caught!.server).api;
      await busy.done('POST', '/admin/payouts/resume', await busy.login(ADA));
      await eventually(
        async () => bookings.every(bookingId => payoutsFor(bookingId).length > 0),
        all => all,
        30000,
      );
      await sleep(2000);
      for (const payout of payoutsTo(account).filter(each => each.status === 'pending'))
        provider.settlePayout(payout.id, true);
      const payouts = await eventually(
        () => api.list('/hosts/me/payouts', token),
        found => found.length >= 3 && found.every(each => each.status === 'paid'),
        30000,
      );
      await sleep(3000);
      for (const bookingId of bookings) expect(payoutsFor(bookingId)).toHaveLength(1);
      expect(payoutsTo(account).map(each => each.amount)).toEqual([DUE, DUE, DUE]);
      expect(payouts.flatMap(each => each.bookingIds as string[]).sort()).toEqual([...bookings].sort());
      expect(payouts.every(each => each.amount === DUE && each.status === 'paid')).toBe(true);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 180000);

  it("pays a weekly host once when its sweep's server is killed as the provider answers, starts paused, and both servers resume at once", async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const servers = await twoServers('chaos-pause-weekly');
      const api = servers.node('a').api;
      const wes = await api.host('wes@chaos-pause.test');
      const tom = await api.traveller('tom2@chaos-pause.test');
      const account = await enabledAccount(api, provider, wes.token);
      const other = WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
      await api.done('PUT', '/hosts/me/payout-schedule', wes.token, { schedule: 'weekly', weekday: other });
      const bookings: string[] = [];
      for (let n = 0; n < 2; n++) {
        const id = await api.listing(wes.token);
        bookings.push(await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1))));
        await payBooking(api, provider, tom.token, bookings[n]);
      }
      await sleep(2000);
      expect(payoutsTo(account)).toEqual([]);

      const hold = gate.hold(posted(account));
      await api.done('PUT', '/hosts/me/payout-schedule', wes.token, {
        schedule: 'weekly',
        weekday: WEEKDAYS[new Date().getUTCDay()],
      });
      const caught = await within(hold.arrived, 30000);
      expect(caught).toBeDefined();
      const busy = caught!.server;
      // The payout on its way reaches the provider, and its server dies before it writes the answer down.
      const { pausedAt, held } = await pauseBeside(servers, busy, () => hold.release(servers.crash));
      await servers.up(busy);

      // Request 100: "A server started while payouts are paused starts paused."
      const restarted = servers.node(busy).api;
      expect(await restarted.read('/admin/payouts/status', await restarted.login(ADA))).toMatchObject({
        paused: true,
        reason: REASON,
      });
      await sleep(4000);
      expect(payoutsTo(account).filter(each => each.id !== held.id && each.at > pausedAt + GRACE)).toEqual([]);

      // "never twice, even when a server is killed between asking the provider and recording it, or when
      // two servers resume at once".
      const [first, second] = [servers.node('a').api, servers.node('b').api];
      const resumed = await Promise.all([
        first.act('POST', '/admin/payouts/resume', await first.login(ADA)),
        second.act('POST', '/admin/payouts/resume', await second.login(ADA)),
      ]);
      expect(resumed.some(each => each.accepted)).toBe(true);
      const token = await first.login(wes.email);
      await eventually(
        () => first.list('/hosts/me/payouts', token),
        found => found.length > 0,
        30000,
      );
      await sleep(3000);
      for (const payout of payoutsTo(account).filter(each => each.status === 'pending'))
        provider.settlePayout(payout.id, true);
      const payouts = await eventually(
        () => first.list('/hosts/me/payouts', token),
        found => found.some(each => each.status === 'paid'),
        30000,
      );
      await sleep(3000);
      expect(payoutsTo(account).map(each => [each.id, each.amount])).toEqual([[held.id, 2 * DUE]]);
      expect(payouts).toHaveLength(1);
      expect(payouts[0]).toMatchObject({ amount: 2 * DUE, status: 'paid' });
      expect([...(payouts[0].bookingIds as string[])].sort()).toEqual([...bookings].sort());
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 180000);
});
