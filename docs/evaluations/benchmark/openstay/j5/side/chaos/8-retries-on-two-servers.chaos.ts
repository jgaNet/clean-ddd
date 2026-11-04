import { database, day, eventually, Json, sleep } from '../../acceptance/openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking } from '../../acceptance/provider';
import { cluster, Cluster, deliverTo, providerGate, Sent, sum, within } from './faults';

/**
 * Chaos on the money, 8: what the platform asks again by itself (a failed payout replaced, request 34; a
 * failed refund asked again, request 31; a payment that succeeded too late refunded, request 30), with
 * two servers on one database doing the work at once, the same webhook reaching both, and one killed
 * between the provider's answer and the write. Asked again, never twice (invariant 4), and never more
 * than was paid (invariant 5). One night at 100 € and 20 € of cleaning: 12 000.
 */
const DUE = 12000 - feeOf(12000);
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

async function twoServers(name: string, extra: Record<string, string> = {}) {
  const db = database(name);
  databases.push(db);
  const servers = cluster(provider, gate, db.path, { JOBS_INTERVAL_SECONDS: '1', ...extra });
  clusters.push(servers);
  await servers.up('a');
  await servers.up('b');
  servers.attach('a');
  return servers;
}
const posted = (path: string) => (sent: Sent) => sent.method === 'POST' && sent.path === path;

describe('chaos: what the platform asks again, on two servers', () => {
  it('replaces a failed payout once, though two servers run the work and one is killed as the provider answers the replacement', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const servers = await twoServers('chaos-retries-payout');
      const api = servers.node('a').api;
      const hal = await api.host('hal@chaos-retries.test');
      const tom = await api.traveller('tom@chaos-retries.test');
      await enabledAccount(api, provider, hal.token);
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
      await payBooking(api, provider, tom.token, bookingId);
      const payoutsFor = () => [...provider.payouts.values()].filter(each => each.reference === bookingId);
      const [first] = await eventually(
        async () => payoutsFor(),
        found => found.length > 0,
        20000,
      );
      await eventually(
        () => api.list('/hosts/me/payouts', hal.token),
        found => found[0]?.status === 'pending',
      );

      const trap = gate.crashAfter(
        sent => posted('/payouts')(sent) && sent.body.reference === bookingId,
        servers.crash,
      );
      provider.settlePayout(first.id, false);
      const tripped = await within(trap.tripped, 30000);
      expect(tripped).toBeDefined();
      await servers.up(tripped!.sent.server);

      const reader = servers.node('b').api;
      const token = await reader.login(hal.email);
      await eventually(
        () => reader.list('/hosts/me/payouts', token),
        found => found.length >= 2,
        30000,
      );
      await sleep(3000);
      // Request 34: "What it carried is owed again, and is paid by a new payout"; "Never twice".
      expect(payoutsFor().map(each => each.id)).toEqual([first.id, tripped!.answer.id]);
      provider.settlePayout(String(tripped!.answer.id), true);
      const payouts = await eventually(
        () => reader.list('/hosts/me/payouts', token),
        found => found.some(each => each.status === 'paid'),
        30000,
      );
      await sleep(3000);
      expect(payouts.map(each => `${String(each.status)} ${String(each.amount)}`).sort()).toEqual([
        `failed ${DUE}`,
        `paid ${DUE}`,
      ]);
      expect(payoutsFor().map(each => each.status)).toEqual(['failed', 'succeeded']);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 180000);

  it('asks a failed refund again once, though two servers run the work, its failure reaches both, and one is killed as the provider answers', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const servers = await twoServers('chaos-retries-refund');
      const api = servers.node('a').api;
      const hal = await api.host('hal2@chaos-retries.test');
      const tom = await api.traveller('tom2@chaos-retries.test');
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
      const payment = await payBooking(api, provider, tom.token, bookingId);
      await api.create(`/bookings/${bookingId}/refunds`, hal.token, { amount: 3000, reason: 'A broken shower' });
      const refundsAt = () => [...provider.refunds.values()].filter(each => each.payment === payment.id);
      const [first] = await eventually(
        async () => refundsAt(),
        found => found.length > 0,
      );
      await eventually(
        () => api.list(`/bookings/${bookingId}/refunds`, tom.token),
        found => found[0]?.status === 'pending',
      );

      // The next refund asked of this payment is the one asked again.
      const trap = gate.crashAfter(sent => posted('/refunds')(sent) && sent.body.payment === payment.id, servers.crash);
      provider.state.holding = true;
      provider.settleRefund(first.id, false);
      const failed = provider.events[provider.events.length - 1];
      await Promise.all([
        deliverTo(servers.node('b').server.port, failed),
        deliverTo(servers.node('a').server.port, failed),
      ]);
      provider.flush();
      const tripped = await within(trap.tripped, 30000);
      expect(tripped).toBeDefined();
      await servers.up(tripped!.sent.server);

      const reader = servers.node('b').api;
      const token = await reader.login(tom.email);
      await eventually(
        () => reader.list(`/bookings/${bookingId}/refunds`, token),
        found => found[0]?.status === 'pending',
        30000,
      );
      await sleep(3000);
      // Request 31: "A refund the provider refuses, or that ends with refund.failed, is asked again" — once.
      expect(refundsAt().map(each => [each.id, each.status, each.amount])).toEqual([
        [first.id, 'failed', 3000],
        [tripped!.answer.id, 'pending', 3000],
      ]);
      provider.settleRefund(String(tripped!.answer.id));
      await eventually(
        () => reader.list(`/bookings/${bookingId}/refunds`, token),
        found => found[0]?.status === 'refunded',
        30000,
      );
      await sleep(3000);
      expect(await reader.list(`/bookings/${bookingId}/refunds`, token)).toEqual([
        expect.objectContaining({ amount: 3000, status: 'refunded' }),
      ]);
      expect(((await reader.read(`/bookings/${bookingId}`, token)).payment as Json).refunded).toBe(3000);
      expect(provider.payments.get(payment.id)!.refunded).toBe(3000);
      expect(refundsAt()).toHaveLength(2);
    } finally {
      provider.state.settleAfterMs = 200;
      provider.state.holding = false;
    }
  }, 180000);

  it('refunds a payment that succeeded after its booking lapsed once, whole, though its success reaches both servers at once and twice', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      // Request 30: a booking owes its payment within PAYMENT_TTL_SECONDS of its confirmation.
      const servers = await twoServers('chaos-retries-lapsed', { PAYMENT_TTL_SECONDS: '5' });
      const api = servers.node('a').api;
      const hal = await api.host('hal3@chaos-retries.test');
      const tom = await api.traveller('tom3@chaos-retries.test');
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
      await api.done('POST', `/bookings/${bookingId}/pay`, tom.token);
      const [payment] = provider.paymentFor(bookingId);
      expect(
        await eventually(
          () => api.read(`/bookings/${bookingId}`, tom.token),
          read => read.status === 'lapsed',
          30000,
        ),
      ).toMatchObject({ status: 'lapsed' });

      provider.state.holding = true;
      provider.state.twice = true;
      const succeeded = provider.pay(payment.id)!;
      const ports = [servers.node('a').server.port, servers.node('b').server.port];
      await Promise.all([...ports, ...ports].map(port => deliverTo(port, succeeded)));
      provider.flush();
      await provider.settled();
      provider.state.twice = false;
      const refundsAt = () => [...provider.refunds.values()].filter(each => each.payment === payment.id);
      await eventually(
        async () => refundsAt(),
        found => found.length > 0,
        30000,
      );
      await sleep(4000);
      // "A payment that succeeds for a booking that has lapsed is refunded in full": once (invariant 4).
      expect(refundsAt().map(each => [each.amount, each.reference])).toEqual([[12000, bookingId]]);
      provider.settleRefund(refundsAt()[0].id);
      await provider.settled();
      await sleep(3000);
      expect(sum(refundsAt().map(each => each.amount))).toBe(12000);
      expect(provider.payments.get(payment.id)!.refunded).toBe(12000);
      expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ status: 'lapsed' });
    } finally {
      provider.state.settleAfterMs = 200;
      provider.state.holding = false;
      provider.state.twice = false;
    }
  }, 180000);
});
