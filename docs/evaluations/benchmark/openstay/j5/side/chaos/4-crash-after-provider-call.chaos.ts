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
import { feeOf, openAccount, paymentProvider, payBooking } from '../../acceptance/provider';
import { providerGate, Sent, within } from './faults';

/**
 * Chaos on the money, 4: the server killed after the provider did what it asked and answered, and before
 * it wrote that down, for a payment, a refund, a payout and a donation. Started again, the server asks
 * again with the same `Idempotency-Key` (request 26: "the same key sent again on the same route gets the
 * first answer again, and nothing more happens"), so the provider holds exactly one of each, and what the
 * platform reads is what the provider holds (invariant 4: an operation is not executed twice because of
 * a retry). One night at 100 € and 20 € of cleaning: 12 000.
 */
const db = database('chaos-crash');
const provider = paymentProvider();
const gate = providerGate(provider);
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { ...(await gate.environment('a')), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await gate.close();
  await provider.close();
  db.remove();
}, 90000);

const killServer = async (_sent: Sent) => kill(server);
/** Starts the server again on the same database, once the gate killed it. */
async function startedAgain() {
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}
const posted = (path: string) => (sent: Sent) => sent.method === 'POST' && sent.path === path;
const DUE = 12000 - feeOf(12000);

describe("chaos: a crash between the provider's answer and the write that records it", () => {
  it('gives the same payment, never a second one, when the traveller asks again after the crash', async () => {
    const hal = await api.host('hal@chaos-crash.test');
    const tom = await api.traveller('tom@chaos-crash.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    const trap = gate.crashAfter(sent => posted('/payments')(sent) && sent.body.reference === bookingId, killServer);
    const asked = api.call('POST', `/bookings/${bookingId}/pay`, tom.token).catch(() => undefined);
    const tripped = await within(trap.tripped, 30000);
    expect(tripped).toBeDefined();
    await asked;
    await startedAgain();

    // Request 27: "Asking to pay again while a payment is under way gives the same payment, never a second one."
    const token = await api.login(tom.email);
    const again = await api.act('POST', `/bookings/${bookingId}/pay`, token);
    expect(again.accepted).toBe(true);
    expect(again.result).toMatchObject({ paymentId: tripped!.answer.id, payUrl: tripped!.answer.payUrl });
    expect(provider.paymentFor(bookingId)).toHaveLength(1);

    provider.pay(String(tripped!.answer.id));
    const paid = await eventually(
      () => api.read(`/bookings/${bookingId}`, token),
      read => (read.payment as Json).status === 'paid',
    );
    expect(paid.payment).toMatchObject({ status: 'paid', amount: 12000, fee: feeOf(12000) });
    await sleep(2000);
    expect(provider.paymentFor(bookingId)).toHaveLength(1);
  }, 120000);

  it("refunds once, and reads the refund the provider holds, when the server is killed as the provider answers a host's refund", async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const hal = await api.host('hal2@chaos-crash.test');
      const tom = await api.traveller('tom2@chaos-crash.test');
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
      const payment = await payBooking(api, provider, tom.token, bookingId);
      const trap = gate.crashAfter(sent => posted('/refunds')(sent) && sent.body.payment === payment.id, killServer);
      const asked = api
        .call('POST', `/bookings/${bookingId}/refunds`, hal.token, { amount: 3000, reason: 'A broken shower' })
        .catch(() => undefined);
      const tripped = await within(trap.tripped, 30000);
      expect(tripped).toBeDefined();
      await asked;
      await startedAgain();

      // The provider holds the refund: the platform reads it pending once it has asked again (request 31:
      // "asked again, until it succeeds"), with the same key, so the provider still holds one.
      const token = await api.login(tom.email);
      await eventually(
        () => api.list(`/bookings/${bookingId}/refunds`, token),
        found => found.some(each => each.status === 'pending'),
        30000,
      );
      await sleep(3000);
      const atProvider = [...provider.refunds.values()].filter(each => each.payment === payment.id);
      expect(atProvider.map(each => each.amount)).toEqual([3000]);
      provider.settleRefund(atProvider[0].id);
      const refunds = await eventually(
        () => api.list(`/bookings/${bookingId}/refunds`, token),
        found => found.length > 0 && found.every(each => each.status === 'refunded'),
        30000,
      );
      await sleep(2000);
      expect(refunds).toEqual([expect.objectContaining({ amount: 3000, status: 'refunded', by: hal.id })]);
      expect((await api.read(`/bookings/${bookingId}`, token)).payment).toMatchObject({ refunded: 3000 });
      expect(provider.payments.get(payment.id)!.refunded).toBe(3000);
      expect([...provider.refunds.values()].filter(each => each.payment === payment.id)).toHaveLength(1);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 120000);

  it('pays a booking out once when the server is killed as the provider answers its payout', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const hal = await api.host('hal3@chaos-crash.test');
      const tom = await api.traveller('tom3@chaos-crash.test');
      // The account is enabled once the booking is paid, so that the payout is sent after the trap is set.
      const account = await openAccount(api, provider, hal.token);
      const id = await api.listing(hal.token);
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
      await payBooking(api, provider, tom.token, bookingId);
      const payoutsFor = () => [...provider.payouts.values()].filter(each => each.reference === bookingId);
      const trap = gate.crashAfter(sent => posted('/payouts')(sent) && sent.body.reference === bookingId, killServer);
      provider.account(account.id, 'enabled');
      const tripped = await within(trap.tripped, 30000);
      expect(tripped).toBeDefined();
      await startedAgain();

      const token = await api.login(hal.email);
      await eventually(
        () => api.list('/hosts/me/payouts', token),
        found => found.length > 0,
        30000,
      );
      await sleep(3000);
      // Request 33: "once per booking: never twice, even across a crash"; request 100: "even when a server
      // is killed between asking the provider and recording it".
      expect(payoutsFor().map(each => each.id)).toEqual([tripped!.answer.id]);
      provider.settlePayout(String(tripped!.answer.id), true);
      const payouts = await eventually(
        () => api.list('/hosts/me/payouts', token),
        found => found.some(each => each.status === 'paid'),
        30000,
      );
      await sleep(2000);
      expect(payouts).toEqual([expect.objectContaining({ bookingIds: [bookingId], amount: DUE, status: 'paid' })]);
      expect(payoutsFor()).toHaveLength(1);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 120000);

  it('asks the provider once for a donation when the server is killed as the provider answers it', async () => {
    const una = await api.traveller('una@chaos-crash.test');
    const donations = () => [...provider.payments.values()].filter(each => each.reference.startsWith('donation:'));
    const before = donations().length;
    const trap = gate.crashAfter(
      sent => posted('/payments')(sent) && String(sent.body.reference).startsWith('donation:'),
      killServer,
    );
    const asked = api.call('POST', '/donations', una.token, { amount: 1500 }).catch(() => undefined);
    const tripped = await within(trap.tripped, 30000);
    expect(tripped).toBeDefined();
    await asked;
    await startedAgain();

    // Request 80: "The provider is asked once per donation, even when a server is killed and started again."
    const token = await api.login(una.email);
    const mine = await eventually(
      () => api.list('/donations/mine', token),
      found => found.length > 0 && found.every(each => Boolean(each.payUrl)),
      30000,
    );
    await sleep(3000);
    expect(mine).toHaveLength(1);
    const donation = mine[0];
    expect(tripped!.answer.reference).toBe(`donation:${String(donation.id)}`);
    expect(donation).toMatchObject({ amount: 1500, status: 'pending', payUrl: tripped!.answer.payUrl });
    // The platform knows every payment the provider holds for a donation: none is lost, none is asked twice.
    expect(
      donations()
        .slice(before)
        .map(each => each.id),
    ).toEqual([tripped!.answer.id]);

    provider.pay(String(tripped!.answer.id));
    expect(
      await eventually(
        () => api.read(`/donations/${String(donation.id)}`, token),
        read => read.status === 'paid',
      ),
    ).toMatchObject({ status: 'paid', amount: 1500, fee: feeOf(1500) });
  }, 120000);
});
