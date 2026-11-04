import {
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  Running,
  sleep,
  start,
  stop,
} from '../../acceptance/openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking, Webhook } from '../../acceptance/provider';
import { deliverTo } from './faults';

/**
 * Chaos on the money, 3: the provider's webhooks replayed, reordered, delivered at once to two servers on
 * one database and delivered while one of them is killed and started again. Each changes things once
 * (invariant 12; request 29), a success is final for a payment, a refund and a payout, and nothing is
 * asked again of the provider for a success it already gave. One night at 100 € and 20 € of cleaning.
 */
const db = database('chaos-webhooks');
const provider = paymentProvider();
let environment: Record<string, string>;
/** `a`, the server the provider is attached to, is the one killed; `b` stays up beside it. */
let a: Running;
let b: Running;
let api: Client;
let beside: Client;
beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  a = await start(db.path, environment);
  b = await start(db.path, environment);
  provider.attach(a.port);
  api = client(a.port);
  beside = client(b.port);
}, 60000);
afterAll(async () => {
  await stop(a);
  await stop(b);
  await provider.close();
  db.remove();
}, 90000);

const ok = (status: number) => status >= 200 && status < 300;
const DUE = 12000 - feeOf(12000);

/**
 * Sends what the provider holds, in `order`, to `a` and, at the same moment, to `b`; kills `a` while
 * the deliveries are under way and starts it again; then the provider says it all again, in the order
 * it happened. Every event reaches the application several times, and once at least while `a` is down.
 */
async function storm(order: (held: Webhook[]) => Webhook[]) {
  const held = provider.events.slice(holding);
  provider.flush(order);
  const toB = Promise.all(order(held).map(event => deliverTo(b.port, event)));
  await sleep(20);
  await kill(a);
  a = await start(db.path, environment);
  provider.attach(a.port);
  api = client(a.port);
  await toB;
  for (const event of held) provider.resend(event);
  await provider.settled();
  return held;
}
/** Where the events held since the last `hold()` start in `provider.events`. */
let holding = 0;
const hold = () => {
  provider.state.holding = true;
  holding = provider.events.length;
};

describe('chaos: webhooks replayed, reordered and delivered across a restart', () => {
  it('pays a booking and a donation once, with one receipt, though their successes come reversed, twice, to two servers and across a crash', async () => {
    const hal = await api.host('hal@chaos-webhooks.test');
    const tom = await api.traveller('tom@chaos-webhooks.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    await api.done('POST', `/bookings/${bookingId}/pay`, tom.token);
    const [payment] = provider.paymentFor(bookingId);
    const donationId = await api.create('/donations', tom.token, { amount: 1500 });
    const [gift] = await eventually(
      async () => provider.paymentFor(`donation:${donationId}`),
      found => found.length > 0,
    );
    expect(gift).toBeDefined();

    hold();
    provider.requireAction(payment.id);
    await sleep(1100);
    provider.pay(payment.id);
    provider.pay(gift.id);
    // The success first, then the older requires_action: request 29, "succeeded is final".
    await storm(held => [...held].reverse());

    const token = await api.login(tom.email);
    const booking = await eventually(
      () => api.read(`/bookings/${bookingId}`, token),
      read => (read.payment as Json).status === 'paid',
    );
    expect(booking.payment).toMatchObject({ status: 'paid', amount: 12000, fee: feeOf(12000) });
    expect(
      await eventually(
        () => api.read(`/donations/${donationId}`, token),
        read => read.status === 'paid',
      ),
    ).toMatchObject({ status: 'paid', amount: 1500, fee: feeOf(1500) });

    // A failure after the success changes nothing, for the booking or the donation (requests 29, 80).
    expect(ok(await provider.signed('payment.failed', { ...payment, status: 'failed', reason: 'card_declined' }))).toBe(
      true,
    );
    expect(ok(await provider.signed('payment.failed', { ...gift, status: 'failed', reason: 'card_declined' }))).toBe(
      true,
    );
    await sleep(3000);
    for (const on of [api, beside]) {
      const reader = await on.login(tom.email);
      expect((await on.read(`/bookings/${bookingId}`, reader)).payment).toMatchObject({
        status: 'paid',
        fee: feeOf(12000),
        refunded: 0,
      });
      expect(await on.read(`/donations/${donationId}`, reader)).toMatchObject({ status: 'paid', fee: feeOf(1500) });
      // Request 46: one receipt per payment that succeeds, and none for a donation (request 80).
      expect((await on.list('/receipts/mine', reader)).map(each => [each.kind, each.bookingId, each.amount])).toEqual([
        ['payment', bookingId, 12000],
      ]);
    }
    expect(provider.paymentFor(bookingId)).toHaveLength(1);
  }, 150000);

  it('refunds once, stays refunded and asks nothing again, though the refund succeeds three times over and then fails', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const hal = await api.host('hal2@chaos-webhooks.test');
      const tom = await api.traveller('tom2@chaos-webhooks.test');
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
      const payment = await payBooking(api, provider, tom.token, bookingId);
      await api.create(`/bookings/${bookingId}/refunds`, hal.token, { amount: 4000, reason: 'A broken shower' });
      const [refund] = await eventually(
        async () => [...provider.refunds.values()].filter(each => each.payment === payment.id),
        found => found.length > 0,
      );
      await eventually(
        () => api.list(`/bookings/${bookingId}/refunds`, tom.token),
        found => found[0]?.status === 'pending',
      );

      hold();
      provider.state.twice = true;
      provider.settleRefund(refund.id);
      await storm(held => held);
      provider.state.twice = false;
      // Request 29: "a failure that arrives after a success for the same payment changes nothing", and a
      // refund's success is final: it is not asked again (request 31 asks again only what failed).
      expect(ok(await provider.signed('refund.failed', { ...refund, status: 'failed' }))).toBe(true);
      await sleep(4000);

      const token = await api.login(tom.email);
      for (const [on, reader] of [
        [api, token],
        [beside, await beside.login(tom.email)],
      ] as const) {
        expect(await on.list(`/bookings/${bookingId}/refunds`, reader)).toEqual([
          expect.objectContaining({ amount: 4000, status: 'refunded' }),
        ]);
        expect((await on.read(`/bookings/${bookingId}`, reader)).payment).toMatchObject({ refunded: 4000 });
        expect((await on.list('/receipts/mine', reader)).map(each => [each.kind, each.amount])).toEqual([
          ['refund', 4000],
          ['payment', 12000],
        ]);
      }
      expect([...provider.refunds.values()].filter(each => each.payment === payment.id)).toHaveLength(1);
    } finally {
      provider.state.settleAfterMs = 200;
      provider.state.twice = false;
    }
  }, 150000);

  it('reads a payout paid once, and never replaces it, though its paid comes twice to two servers across a crash and a failure follows', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const hal = await api.host('hal3@chaos-webhooks.test');
      const tom = await api.traveller('tom3@chaos-webhooks.test');
      await enabledAccount(api, provider, hal.token);
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
      await payBooking(api, provider, tom.token, bookingId);
      const payoutsFor = () => [...provider.payouts.values()].filter(each => each.reference === bookingId);
      const [payout] = await eventually(
        async () => payoutsFor(),
        found => found.length > 0,
        20000,
      );
      await eventually(
        () => api.list('/hosts/me/payouts', hal.token),
        found => found[0]?.status === 'pending',
      );

      hold();
      provider.state.twice = true;
      provider.settlePayout(payout.id, true);
      await storm(held => held);
      provider.state.twice = false;
      // Request 29: a payout's success is final; request 34: "A failed payout and the one that replaces
      // it never both read paid".
      expect(ok(await provider.signed('payout.failed', { ...payout, status: 'failed' }))).toBe(true);
      await sleep(4000);

      const token = await api.login(hal.email);
      for (const [on, reader] of [
        [api, token],
        [beside, await beside.login(hal.email)],
      ] as const) {
        expect(await on.list('/hosts/me/payouts', reader)).toEqual([
          expect.objectContaining({ bookingIds: [bookingId], amount: DUE, status: 'paid' }),
        ]);
        // Request 35: each payout once on the statement.
        const statement = await on.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}`, reader);
        expect(
          (statement.lines as Json[])
            .filter(each => each.type === 'payout' && each.bookingId === bookingId)
            .map(each => each.amount),
        ).toEqual([-DUE]);
      }
      expect(payoutsFor()).toHaveLength(1);
    } finally {
      provider.state.settleAfterMs = 200;
      provider.state.twice = false;
    }
  }, 150000);
});
