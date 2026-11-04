import { adminEnvironment, database, day, eventually, Json, sleep, WEEKDAYS } from '../../acceptance/openstay';
import { enabledAccount, openAccount, paymentProvider, payBooking } from '../../acceptance/provider';
import { cluster, deliverTo, providerGate, Sent, within } from './faults';

/**
 * Chaos on the money, 6: a day of the faults of this suite on one database and two servers (successes
 * replayed to both, refunds racing, a server killed between the provider's answer and the write for a
 * payment, a refund, a payout and a donation, a payout failed and replaced, a weekly payout in two
 * currencies computed by both servers), then the day's reconciliation (request 37): every movement the
 * provider has today is one OpenStay saw, of the same amount, matched by `type`, `reference` and
 * `currency` (request 87); none is missing on either side. The cases run in turn and build that day;
 * the last reconciles it. The provider settles refunds and payouts when the cases say.
 */
const ADA = 'ada@chaos-reconciliation.test';
const db = database('chaos-reconciliation');
const provider = paymentProvider();
const gate = providerGate(provider);
const servers = cluster(provider, gate, db.path, { ...adminEnvironment(ADA), JOBS_INTERVAL_SECONDS: '1' });
beforeAll(async () => {
  provider.state.settleAfterMs = undefined;
  await servers.up('a');
  await servers.up('b');
  servers.attach('a');
  await servers.node('a').api.admin(ADA);
}, 60000);
afterAll(async () => {
  await servers.stop();
  await gate.close();
  await provider.close();
  db.remove();
}, 90000);

const a = () => servers.node('a').api;
const b = () => servers.node('b').api;
const posted = (path: string) => (sent: Sent) => sent.method === 'POST' && sent.path === path;
/** After a crash, the killed server is started again, and the case goes on through `a`. */
async function afterCrash(trap: { tripped: Promise<{ sent: Sent; answer: Json }> }) {
  const tripped = await within(trap.tripped, 30000);
  expect(tripped).toBeDefined();
  await servers.up(tripped!.sent.server);
  return tripped!;
}
const settlePending = () => {
  for (const refund of provider.refunds.values()) if (refund.status === 'pending') provider.settleRefund(refund.id);
  for (const payout of provider.payouts.values())
    if (payout.status === 'pending') provider.settlePayout(payout.id, true);
};
const people = {
  hal: 'hal@chaos-reconciliation.test',
  tom: 'tom@chaos-reconciliation.test',
};

describe('chaos: reconciliation after the faults', () => {
  it('records payments whose success came to both servers twice, and one whose server was killed as the provider answered', async () => {
    const hal = await a().host(people.hal);
    const tom = await a().traveller(people.tom);
    const id = await a().listing(hal.token);
    const replayed = await a().book(tom.token, await a().quote(tom.token, id, day(10), day(11)));
    await a().done('POST', `/bookings/${replayed}/pay`, tom.token);
    provider.state.twice = true;
    const event = provider.pay(provider.paymentFor(replayed)[0].id)!;
    await Promise.all([
      deliverTo(servers.node('b').server.port, event),
      deliverTo(servers.node('b').server.port, event),
    ]);
    await provider.settled();
    provider.state.twice = false;

    const killed = await a().book(tom.token, await a().quote(tom.token, id, day(12), day(13)));
    const trap = gate.crashAfter(sent => posted('/payments')(sent) && sent.body.reference === killed, servers.crash);
    const asked = a()
      .call('POST', `/bookings/${killed}/pay`, tom.token)
      .catch(() => undefined);
    const tripped = await afterCrash(trap);
    await asked;
    const token = await a().login(tom.email);
    const again = await a().act('POST', `/bookings/${killed}/pay`, token);
    expect(again.result).toMatchObject({ paymentId: tripped.answer.id });
    provider.pay(String(tripped.answer.id));
    for (const bookingId of [replayed, killed])
      expect(
        await eventually(
          () => a().read(`/bookings/${bookingId}`, token),
          read => (read.payment as Json).status === 'paid',
        ),
      ).toMatchObject({ payment: { status: 'paid', amount: 12000 } });
  }, 150000);

  it('records refunds racing on two servers, and one whose server was killed as the provider answered', async () => {
    const hal = await a().login(people.hal);
    const tom = await a().login(people.tom);
    const halOnB = await b().login(people.hal);
    const id = await a().listing(hal, { cancellationPolicy: 'flexible' });
    const raced = await a().book(tom, await a().quote(tom, id, day(20), day(21)));
    const racedPayment = await payBooking(a(), provider, tom, raced);
    await Promise.all([
      a().act('POST', `/bookings/${raced}/cancel`, tom),
      b().act('POST', `/bookings/${raced}/refunds`, halOnB, { amount: 5000, reason: 'A broken shower' }),
    ]);

    const killed = await a().book(tom, await a().quote(tom, id, day(22), day(23)));
    const payment = await payBooking(a(), provider, tom, killed);
    const trap = gate.crashAfter(sent => posted('/refunds')(sent) && sent.body.payment === payment.id, servers.crash);
    const asked = a()
      .call('POST', `/bookings/${killed}/refunds`, hal, { amount: 3000, reason: 'A broken shower' })
      .catch(() => undefined);
    await afterCrash(trap);
    await asked;
    const token = await a().login(people.tom);
    await eventually(
      () => a().list(`/bookings/${killed}/refunds`, token),
      found => found.some(each => each.status === 'pending'),
      30000,
    );
    // The cancellation and the host's refund together refund what was paid (request 31), once both are asked.
    await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === racedPayment.id),
      found => found.reduce((total, each) => total + each.amount, 0) >= 12000,
      30000,
    );
    await sleep(2000);
    provider.state.twice = true;
    settlePending();
    await provider.settled();
    provider.state.twice = false;
    for (const [bookingId, refunded] of [
      [raced, 12000],
      [killed, 3000],
    ] as const)
      expect(
        await eventually(
          () => a().read(`/bookings/${bookingId}`, token),
          read => (read.payment as Json).refunded === refunded,
          30000,
        ),
      ).toMatchObject({ payment: { refunded } });
  }, 150000);

  it('records a payout whose server was killed as the provider answered, a failed one replaced, and a weekly one in two currencies', async () => {
    const tom = await a().login(people.tom);
    // Killed: the account is enabled once the booking is paid, after the trap is set.
    const ian = await a().host('ian@chaos-reconciliation.test');
    const ianAccount = await openAccount(a(), provider, ian.token);
    const ians = await a().book(tom, await a().quote(tom, await a().listing(ian.token), day(0), day(1)));
    await payBooking(a(), provider, tom, ians);
    const trap = gate.crashAfter(sent => posted('/payouts')(sent) && sent.body.reference === ians, servers.crash);
    provider.account(ianAccount.id, 'enabled');
    const tripped = await afterCrash(trap);
    expect(tripped.answer.reference).toBe(ians);
    // The provider settles it once the platform knows it again.
    const ianToken = await a().login(ian.email);
    await eventually(
      () => a().list('/hosts/me/payouts', ianToken),
      found => found.length > 0,
      30000,
    );

    // Failed, then replaced.
    const jon = await a().host('jon@chaos-reconciliation.test');
    await enabledAccount(a(), provider, jon.token);
    const jons = await a().book(tom, await a().quote(tom, await a().listing(jon.token), day(0), day(1)));
    await payBooking(a(), provider, tom, jons);
    const [failing] = await eventually(
      async () => [...provider.payouts.values()].filter(each => each.reference === jons),
      found => found.length > 0,
      20000,
    );
    provider.settlePayout(failing.id, false);
    await eventually(
      async () => [...provider.payouts.values()].filter(each => each.reference === jons),
      found => found.length > 1,
      20000,
    );

    // Weekly, on another day, in euros and pounds; today becomes the weekday on the second server.
    const wes = await a().host('wes@chaos-reconciliation.test');
    const wesAccount = await enabledAccount(a(), provider, wes.token);
    const other = WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
    await a().done('PUT', '/hosts/me/payout-schedule', wes.token, { schedule: 'weekly', weekday: other });
    for (const currency of ['EUR', 'GBP', 'EUR']) {
      const listingId = await a().create('/listings', wes.token, {
        title: 'A room with a view',
        city: 'Lyon',
        capacity: 2,
        nightlyPrice: 10000,
        cleaningFee: 2000,
        cancellationPolicy: 'flexible',
        currency,
      });
      await a().done('POST', `/listings/${listingId}/publish`, wes.token);
      await payBooking(a(), provider, tom, await a().book(tom, await a().quote(tom, listingId, day(0), day(1))));
    }
    await b().done('PUT', '/hosts/me/payout-schedule', await b().login(wes.email), {
      schedule: 'weekly',
      weekday: WEEKDAYS[new Date().getUTCDay()],
    });
    await eventually(
      async () => [...provider.payouts.values()].filter(each => each.account === wesAccount.id),
      found => found.length >= 2,
      30000,
    );

    await sleep(3000);
    settlePending();
    for (const [email, count] of [
      [ian.email, 1],
      [jon.email, 1],
      [wes.email, 2],
    ] as const) {
      const token = await a().login(email);
      const payouts = await eventually(
        () => a().list('/hosts/me/payouts', token),
        found => found.filter(each => each.status === 'paid').length >= count,
        30000,
      );
      expect(payouts.filter(each => each.status === 'paid')).toHaveLength(count);
    }
  }, 240000);

  it('records a donation whose server was killed as the provider answered, paid, its success said twice', async () => {
    const una = await a().traveller('una@chaos-reconciliation.test');
    const trap = gate.crashAfter(
      sent => posted('/payments')(sent) && String(sent.body.reference).startsWith('donation:'),
      servers.crash,
    );
    const asked = a()
      .call('POST', '/donations', una.token, { amount: 1500 })
      .catch(() => undefined);
    const tripped = await afterCrash(trap);
    await asked;
    const token = await a().login(una.email);
    const [donation] = await eventually(
      () => a().list('/donations/mine', token),
      found => found.length > 0 && Boolean(found[0].payUrl),
      30000,
    );
    expect(donation).toBeDefined();
    provider.state.twice = true;
    provider.pay(String(tripped.answer.id));
    await provider.settled();
    provider.state.twice = false;
    expect(
      await eventually(
        () => a().read(`/donations/${String(donation.id)}`, token),
        read => read.status === 'paid',
      ),
    ).toMatchObject({ status: 'paid' });
  }, 120000);

  it('reconciles the day with every movement matched and no mismatch, on both servers', async () => {
    await provider.settled();
    await sleep(3000);
    const today = day(0);
    const pairs = new Set(
      provider.transactions
        .filter(each => each.at.startsWith(today))
        .map(each => `${each.type} ${each.reference} ${each.currency}`),
    );
    // A charge and a fee for each of 9 bookings and a donation, a refund for 2 bookings, 4 payouts.
    expect(pairs.size).toBeGreaterThanOrEqual(26);
    for (const api of [a(), b()]) {
      const token = await api.login(ADA);
      const read = await eventually(
        () => api.read(`/admin/reconciliation?date=${today}`, token),
        answer => (answer.mismatches as Json[]).length === 0 && answer.matched === pairs.size,
        30000,
      );
      // Request 37: "How many matched, and every mismatch".
      expect(read).toEqual({ date: today, matched: pairs.size, mismatches: [] });
    }
  }, 120000);
});
