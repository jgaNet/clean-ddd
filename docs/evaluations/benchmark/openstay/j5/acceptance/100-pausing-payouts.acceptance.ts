import {
  adminEnvironment,
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
  WEEKDAYS,
} from './openstay';
import { enabledAccount, paymentProvider, payBooking, ProviderAccount } from './provider';

/**
 * Request 100: an administrator pauses every payout during an incident, on every server and across a
 * restart, and resumes them later with nothing lost and nothing paid twice.
 */
const provider = paymentProvider();
const ADMIN = 'ada@pausing-payouts.test';
const databases: ReturnType<typeof database>[] = [];
const running: Running[] = [];
let environment: Record<string, string>;
beforeAll(async () => {
  environment = { ...(await provider.environment()), ...adminEnvironment(ADMIN), JOBS_INTERVAL_SECONDS: '1' };
}, 60000);
afterAll(async () => {
  for (const each of running) await stop(each);
  await provider.close();
  for (const each of databases) each.remove();
});

/** A database of the case's own, and a server on it. */
async function serverOn(name: string) {
  const db = database(name);
  databases.push(db);
  return { db, ...(await another(db.path)) };
}
/** Another server on `path`, with a client and the administrator signed in there. */
async function another(path: string) {
  const server = await start(path, environment);
  running.push(server);
  const api = client(server.port);
  const token = await api.login(ADMIN).catch(async () => (await api.admin(ADMIN)).token);
  return { server, api, token };
}
const payoutsFor = (reference: string) => [...provider.payouts.values()].filter(each => each.reference === reference);
const payoutsTo = (account: ProviderAccount) =>
  [...provider.payouts.values()].filter(each => each.account === account.id);
const status = (api: Client, token: string) => api.read('/admin/payouts/status', token);
const REASON = 'The provider sends money to the wrong accounts.';
/** A paid booking of tonight, owed a payout from now on. */
const paidTonight = async (api: Client, host: string, traveller: string) => {
  const id = await api.listing(host);
  const bookingId = await api.book(traveller, await api.quote(traveller, id, day(0), day(1)));
  await payBooking(api, provider, traveller, bookingId);
  return bookingId;
};

describe('pausing payouts', () => {
  it('is read, paused and resumed by administrators only, once each way, and written in the audit log', async () => {
    const { api, token } = await serverOn('pausing-payouts-rules');
    const tom = await api.traveller('tom@pausing-payouts.test');
    const hal = await api.host('hal@pausing-payouts.test');
    for (const other of [tom.token, hal.token]) {
      expect((await api.call('GET', '/admin/payouts/status', other)).status).toBe(403);
      expect(await api.refused('POST', '/admin/payouts/pause', other, { reason: REASON })).toBe(true);
      expect(await api.refused('POST', '/admin/payouts/resume', other)).toBe(true);
    }
    expect(await status(api, token)).toMatchObject({ paused: false, since: null, reason: null });
    expect(await api.refused('POST', '/admin/payouts/resume', token)).toBe(true);
    for (const reason of ['', 'x'.repeat(501)])
      expect(await api.refused('POST', '/admin/payouts/pause', token, { reason })).toBe(true);
    expect(await status(api, token)).toMatchObject({ paused: false });

    const before = Date.now();
    await api.done('POST', '/admin/payouts/pause', token, { reason: REASON });
    const paused = await status(api, token);
    expect(paused).toMatchObject({ paused: true, reason: REASON });
    expect(Date.parse(String(paused.since))).toBeGreaterThanOrEqual(before - 5000);
    expect(Date.parse(String(paused.since))).toBeLessThanOrEqual(Date.now() + 5000);
    expect(await api.refused('POST', '/admin/payouts/pause', token, { reason: 'Again.' })).toBe(true);
    expect(await status(api, token)).toMatchObject({ paused: true, since: paused.since, reason: REASON });

    await api.done('POST', '/admin/payouts/resume', token);
    expect(await status(api, token)).toMatchObject({ paused: false, since: null, reason: null });
    expect(await api.refused('POST', '/admin/payouts/resume', token)).toBe(true);

    const adminId = String((await api.read('/accounts/me', token)).id);
    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=payouts', token),
      found => found.length >= 2,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId, action: 'payouts-paused', subjectId: 'payouts', note: REASON }),
      expect.objectContaining({ adminId, action: 'payouts-resumed', subjectId: 'payouts', note: null }),
    ]);
  }, 90000);

  it('sends no payout from any server while paused, across a kill, and pays each booking once on resume', async () => {
    provider.state.settleAfterMs = 200;
    const first = await serverOn('pausing-payouts-servers');
    const second = await another(first.db.path);
    provider.attach(first.server.port);
    const hal = await first.api.host('hal2@pausing-payouts.test');
    const tom = await first.api.traveller('tom2@pausing-payouts.test');
    await enabledAccount(first.api, provider, hal.token);

    await first.api.done('POST', '/admin/payouts/pause', first.token, { reason: REASON });
    expect(await status(second.api, second.token)).toMatchObject({ paused: true, reason: REASON });
    expect(await second.api.refused('POST', '/admin/payouts/pause', second.token, { reason: REASON })).toBe(true);

    // Payments go on; payouts do not, and the dashboard counts them held (request 99).
    const before = await paidTonight(first.api, hal.token, tom.token);
    await sleep(4000);
    expect(payoutsFor(before)).toEqual([]);
    const held = await eventually(
      () => second.api.read('/admin/dashboard', second.token),
      dashboard => dashboard.heldPayouts === 1,
    );
    expect(held.heldPayouts).toBe(1);

    // A server killed and started again starts paused.
    await kill(first.server);
    const restarted = await another(first.db.path);
    provider.attach(restarted.server.port);
    expect(await status(restarted.api, restarted.token)).toMatchObject({ paused: true, reason: REASON });
    const during = await paidTonight(
      restarted.api,
      await restarted.api.login(hal.email),
      await restarted.api.login(tom.email),
    );
    await sleep(4000);
    expect(payoutsFor(before)).toEqual([]);
    expect(payoutsFor(during)).toEqual([]);

    // Both servers resume at once, and a server is killed as soon as the provider holds a payout: each
    // booking is paid out once. The provider settles the payouts once a server started again knows them.
    provider.state.settleAfterMs = undefined;
    let last: Awaited<ReturnType<typeof another>>;
    let token: string;
    try {
      const resumed = await Promise.all([
        restarted.api.act('POST', '/admin/payouts/resume', restarted.token),
        second.api.act('POST', '/admin/payouts/resume', second.token),
      ]);
      expect(resumed.some(each => each.accepted)).toBe(true);
      await eventually(
        async () => [...payoutsFor(before), ...payoutsFor(during)],
        found => found.length > 0,
        20000,
      );
      await kill(restarted.server);
      expect(await status(second.api, second.token)).toMatchObject({ paused: false, since: null, reason: null });
      last = await another(first.db.path);
      provider.attach(last.server.port);
      token = await last.api.login(hal.email);
      await eventually(
        () => last.api.list('/hosts/me/payouts', token),
        found => found.length >= 2,
        20000,
      );
      await sleep(2000);
      for (const payout of [...payoutsFor(before), ...payoutsFor(during)].filter(each => each.status === 'pending'))
        provider.settlePayout(payout.id, true);
    } finally {
      provider.state.settleAfterMs = 200;
    }
    await eventually(
      () => last.api.list('/hosts/me/payouts', token),
      found => found.filter(each => each.status === 'paid').length >= 2,
      20000,
    );
    await sleep(3000);
    expect(payoutsFor(before)).toHaveLength(1);
    expect(payoutsFor(during)).toHaveLength(1);
  }, 180000);

  it('lets a payout sent before the pause finish, holds a failed one and a weekly one until resumed, and lets payments and refunds go on', async () => {
    provider.state.settleAfterMs = undefined;
    const { server, api, token } = await serverOn('pausing-payouts-schedules');
    provider.attach(server.port);
    const amy = await api.host('amy3@pausing-payouts.test');
    const bob = await api.host('bob3@pausing-payouts.test');
    const wes = await api.host('wes3@pausing-payouts.test');
    const tom = await api.traveller('tom3@pausing-payouts.test');
    for (const each of [amy, bob]) await enabledAccount(api, provider, each.token);
    const weekly = await enabledAccount(api, provider, wes.token);
    await api.done('PUT', '/hosts/me/payout-schedule', wes.token, {
      schedule: 'weekly',
      weekday: WEEKDAYS[new Date().getUTCDay()],
    });

    const amys = await paidTonight(api, amy.token, tom.token);
    const bobs = await paidTonight(api, bob.token, tom.token);
    const [sentToAmy] = await eventually(
      async () => payoutsFor(amys),
      found => found.length > 0,
    );
    const [sentToBob] = await eventually(
      async () => payoutsFor(bobs),
      found => found.length > 0,
    );
    await api.done('POST', '/admin/payouts/pause', token, { reason: REASON });

    // What was sent before the pause is settled as before.
    provider.settlePayout(sentToAmy.id, true);
    provider.settlePayout(sentToBob.id, false);
    await eventually(
      () => api.list('/hosts/me/payouts', amy.token),
      found => found[0]?.status === 'paid',
    );
    await eventually(
      () => api.list('/hosts/me/payouts', bob.token),
      found => found[0]?.status === 'failed',
    );

    // Payments and refunds go on; the weekly host's payout waits with the failed one.
    const wess = await paidTonight(api, wes.token, tom.token);
    const id = await api.listing(amy.token);
    const refunded = await api.book(tom.token, await api.quote(tom.token, id, day(5), day(6)));
    const payment = await payBooking(api, provider, tom.token, refunded);
    await api.create(`/bookings/${refunded}/refunds`, amy.token, { amount: 1000, reason: 'A broken shower' });
    const [refund] = await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === payment.id),
      found => found.length > 0,
    );
    provider.settleRefund(refund.id);
    const booking = await eventually(
      () => api.read(`/bookings/${refunded}`, tom.token),
      each => (each.payment as Json).refunded === 1000,
    );
    expect((booking.payment as Json).refunded).toBe(1000);
    await sleep(3000);
    expect(payoutsFor(bobs)).toHaveLength(1);
    expect(payoutsTo(weekly)).toEqual([]);

    // Resumed: the failed one is paid again, and the weekly host today, its weekday.
    await api.done('POST', '/admin/payouts/resume', token);
    const again = await eventually(
      async () => payoutsFor(bobs),
      found => found.length >= 2,
      20000,
    );
    const toWes = await eventually(
      async () => payoutsTo(weekly),
      found => found.length >= 1,
      20000,
    );
    for (const each of [...again, ...toWes]) provider.settlePayout(each.id, true);
    await eventually(
      () => api.list('/hosts/me/payouts', wes.token),
      found => found.some(each => each.status === 'paid'),
    );
    await sleep(3000);
    expect(
      payoutsFor(bobs)
        .map(each => each.status)
        .sort(),
    ).toEqual(['failed', 'succeeded']);
    expect(payoutsTo(weekly)).toHaveLength(1);
    expect(
      (await api.list('/hosts/me/payouts', wes.token)).filter(each => (each.bookingIds as string[]).includes(wess)),
    ).toHaveLength(1);
    expect(payoutsFor(amys)).toHaveLength(1);
    provider.state.settleAfterMs = 200;
  }, 180000);
});
