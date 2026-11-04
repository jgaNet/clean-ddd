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
import { Currency, enabledAccount, feeOf, openAccount, paymentProvider, payBooking, ProviderAccount } from './provider';

/**
 * Probe P3, a minimum payout: a host's minimum per currency, below which what is due waits and is paid
 * with what comes next, in one payout, per booking or weekly; lowering it pays at the next run; a failed
 * payout counts toward it; each booking paid once across a crash and two servers; what waits under it is
 * neither held by the pause nor counted in the dashboard's `heldPayouts`.
 */
const db = database('minimum-payout');
const provider = paymentProvider();
const ADMIN = 'ada@minimum-payout.test';
const others: { server: Running; db: ReturnType<typeof database> }[] = [];
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { ...(await provider.environment()), ...adminEnvironment(ADMIN), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  for (const other of others) {
    await stop(other.server);
    other.db.remove();
  }
  await provider.close();
  db.remove();
});

/** Read when a case runs, after the server started (it may have waited past midnight). */
const today = () => WEEKDAYS[new Date().getUTCDay()];
const anotherDay = () => WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
/** One night from today, at 100 and 20 of cleaning: 12 000 for the host, less the provider's fee in its currency. */
const due = (currency: Currency = 'EUR') => 12000 - feeOf(12000, currency);
const DUE = due();
const payoutsTo = (account: ProviderAccount) =>
  [...provider.payouts.values()].filter(each => each.account === account.id);
const listed = (token: string, expected: (payouts: Json[]) => boolean) =>
  eventually(() => api.list('/hosts/me/payouts', token), expected, 20000);
const minimum = (token: string, currency: string, amount: number) =>
  api.done('PUT', `/hosts/me/payout-minimum/${currency}`, token, { amount });
const sorted = (ids: unknown) => [...(ids as string[])].sort();

/** A listing of `hostToken`'s in `currency`, booked tonight by `travellerToken` and paid: the booking's id. */
async function paidTonight(on: Client, hostToken: string, travellerToken: string, currency: Currency = 'EUR') {
  const id = await on.create('/listings', hostToken, {
    title: 'A room with a view',
    city: 'Lyon',
    capacity: 2,
    nightlyPrice: 10000,
    cleaningFee: 2000,
    cancellationPolicy: 'flexible',
    currency,
  });
  await on.done('POST', `/listings/${id}/publish`, hostToken);
  const bookingId = await on.book(travellerToken, await on.quote(travellerToken, id, day(0), day(1)));
  await payBooking(on, provider, travellerToken, bookingId);
  return bookingId;
}

/** A host with an enabled payout account, and a traveller of their own. */
async function host(name: string) {
  const hal = await api.host(`${name}@minimum-payout.test`);
  const tom = await api.traveller(`tom-${name}@minimum-payout.test`);
  const account = await enabledAccount(api, provider, hal.token);
  return { hal, tom, account };
}

describe('a minimum payout', () => {
  it('is set per currency by a host for themselves, 0 until set, and refuses an unknown currency or a negative amount', async () => {
    const hal = await api.host('hal@minimum-payout.test');
    const ian = await api.host('ian@minimum-payout.test');
    const tom = await api.traveller('tom@minimum-payout.test');
    // The probe does not say whether a minimum may be set before a payout account is opened: it is opened first.
    await openAccount(api, provider, hal.token);
    const path = (currency: string) => `/hosts/me/payout-minimum/${currency}`;
    for (const currency of ['EUR', 'GBP', 'CHF', 'JPY'])
      expect(await api.read(path(currency), hal.token)).toMatchObject({ currency, amount: 0 });

    await minimum(hal.token, 'EUR', 5000);
    await minimum(hal.token, 'JPY', 3000);
    expect(await api.read(path('EUR'), hal.token)).toMatchObject({ currency: 'EUR', amount: 5000 });
    expect(await api.read(path('JPY'), hal.token)).toMatchObject({ currency: 'JPY', amount: 3000 });
    expect(await api.read(path('GBP'), hal.token)).toMatchObject({ currency: 'GBP', amount: 0 });

    expect(await api.refused('PUT', path('USD'), hal.token, { amount: 100 })).toBe(true);
    expect(await api.refused('PUT', path('XYZ'), hal.token, { amount: 100 })).toBe(true);
    expect(await api.refused('PUT', path('EUR'), hal.token, { amount: -1 })).toBe(true);
    expect(await api.read(path('EUR'), hal.token)).toMatchObject({ currency: 'EUR', amount: 5000 });

    // Another host has their own; an account that is not a host sets none.
    expect(await api.read(path('EUR'), ian.token)).toMatchObject({ currency: 'EUR', amount: 0 });
    expect(await api.refused('PUT', path('EUR'), tom.token, { amount: 100 })).toBe(true);

    await minimum(hal.token, 'EUR', 0);
    expect(await api.read(path('EUR'), hal.token)).toMatchObject({ currency: 'EUR', amount: 0 });
  }, 60000);

  it('keeps per-booking payouts below the minimum waiting, and pays them together once they reach it', async () => {
    provider.state.settleAfterMs = 200;
    const { hal, tom, account } = await host('amy');
    await minimum(hal.token, 'EUR', 20000);

    const first = await paidTonight(api, hal.token, tom.token);
    await sleep(3000);
    expect(payoutsTo(account)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', hal.token)).toEqual([]);

    const second = await paidTonight(api, hal.token, tom.token);
    const payouts = await listed(hal.token, found => found.some(each => each.status === 'paid'));
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ amount: 2 * DUE, currency: 'EUR', status: 'paid' });
    expect(sorted(payouts[0].bookingIds)).toEqual(sorted([first, second]));
    expect(payoutsTo(account).map(each => [each.amount, each.currency])).toEqual([[2 * DUE, 'EUR']]);
    // Several bookings: a reference of OpenStay's own.
    expect([first, second]).not.toContain(payoutsTo(account)[0].reference);

    // What comes next waits again, under the same minimum.
    await paidTonight(api, hal.token, tom.token);
    await sleep(3000);
    expect(payoutsTo(account)).toHaveLength(1);
    expect(await api.list('/hosts/me/payouts', hal.token)).toHaveLength(1);
  }, 90000);

  it('waits in one currency only, and pays at the next run once a lowered minimum is reached', async () => {
    provider.state.settleAfterMs = 200;
    const { hal, tom, account } = await host('ben');
    await minimum(hal.token, 'EUR', 50000);

    const euro = await paidTonight(api, hal.token, tom.token, 'EUR');
    const pound = await paidTonight(api, hal.token, tom.token, 'GBP');
    // Pounds have no minimum: paid at once, alone, under the booking's id.
    await listed(hal.token, found => found.some(each => each.status === 'paid'));
    await sleep(2000);
    expect(payoutsTo(account).map(each => [each.reference, each.currency, each.amount])).toEqual([
      [pound, 'GBP', due('GBP')],
    ]);

    // Lowered, but still above what is due: it still waits.
    await minimum(hal.token, 'EUR', DUE + 1);
    await sleep(3000);
    expect(payoutsTo(account).filter(each => each.currency === 'EUR')).toEqual([]);

    // Lowered to exactly what is due: paid, alone, under the booking's id.
    await minimum(hal.token, 'EUR', DUE);
    const payouts = await listed(hal.token, found => found.filter(each => each.status === 'paid').length >= 2);
    expect(payouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookingIds: [euro], amount: DUE, currency: 'EUR', status: 'paid' }),
        expect.objectContaining({ bookingIds: [pound], amount: due('GBP'), currency: 'GBP', status: 'paid' }),
      ]),
    );
    await sleep(2000);
    expect(
      payoutsTo(account)
        .filter(each => each.currency === 'EUR')
        .map(each => [each.reference, each.amount]),
    ).toEqual([[euro, DUE]]);
  }, 90000);

  it('pays a weekly host on the weekday only the currencies that reach their minimum, and the rest once it is lowered', async () => {
    provider.state.settleAfterMs = 200;
    const { hal, tom, account } = await host('cat');
    await api.done('PUT', '/hosts/me/payout-schedule', hal.token, { schedule: 'weekly', weekday: anotherDay() });
    await minimum(hal.token, 'EUR', 20000);
    await minimum(hal.token, 'GBP', 30000);
    const euros = [await paidTonight(api, hal.token, tom.token), await paidTonight(api, hal.token, tom.token)];
    const pound = await paidTonight(api, hal.token, tom.token, 'GBP');
    await sleep(2000);
    expect(payoutsTo(account)).toEqual([]);

    // On the weekday: the euros reach their minimum, the pounds do not.
    await api.done('PUT', '/hosts/me/payout-schedule', hal.token, { schedule: 'weekly', weekday: today() });
    const payouts = await listed(hal.token, found => found.some(each => each.status === 'paid'));
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ currency: 'EUR', amount: 2 * DUE, status: 'paid' });
    expect(sorted(payouts[0].bookingIds)).toEqual(sorted(euros));
    await sleep(3000);
    expect(payoutsTo(account).map(each => [each.currency, each.amount])).toEqual([['EUR', 2 * DUE]]);

    // The pounds' minimum set to 0: paid at the next run, today being the weekday.
    await minimum(hal.token, 'GBP', 0);
    const after = await listed(hal.token, found => found.filter(each => each.status === 'paid').length >= 2);
    expect(after.find(each => each.currency === 'GBP')).toMatchObject({ bookingIds: [pound], amount: due('GBP') });
    await sleep(2000);
    expect(payoutsTo(account).find(each => each.currency === 'GBP')?.reference).toBe(pound);
    expect(payoutsTo(account)).toHaveLength(2);
  }, 90000);

  it('counts a failed payout toward the minimum, and pays it with what comes next', async () => {
    const { hal, tom, account } = await host('dan');
    provider.state.settleAfterMs = undefined;
    try {
      const first = await paidTonight(api, hal.token, tom.token);
      const [sent] = await eventually(
        async () => payoutsTo(account),
        found => found.length > 0,
        20000,
      );
      expect(sent).toMatchObject({ reference: first, amount: DUE });
      await minimum(hal.token, 'EUR', 20000);
      await sleep(1500);
      provider.settlePayout(sent.id, false);
      await listed(hal.token, found => found.some(each => each.status === 'failed'));
      await sleep(3000);
      expect(payoutsTo(account)).toHaveLength(1);

      const second = await paidTonight(api, hal.token, tom.token);
      const next = await eventually(
        async () => payoutsTo(account),
        found => found.length >= 2,
        20000,
      );
      const together = next.find(each => each.id !== sent.id)!;
      expect(together.amount).toBe(2 * DUE);
      provider.settlePayout(together.id, true);
      const payouts = await listed(hal.token, found => found.some(each => each.status === 'paid'));
      expect(payouts.find(each => each.status === 'failed')).toMatchObject({ bookingIds: [first], amount: DUE });
      const paid = payouts.find(each => each.status === 'paid')!;
      expect(paid).toMatchObject({ amount: 2 * DUE });
      expect(sorted(paid.bookingIds)).toEqual(sorted([first, second]));
      await sleep(3000);
      expect(payoutsTo(account)).toHaveLength(2);
      expect(payoutsTo(account).filter(each => each.status === 'succeeded')).toHaveLength(1);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 90000);

  it('pays the bookings that waited once, across two servers on one database and a crash', async () => {
    const { hal, tom, account } = await host('eve');
    await minimum(hal.token, 'EUR', 20000);
    const first = await paidTonight(api, hal.token, tom.token);
    await sleep(2000);
    expect(payoutsTo(account)).toEqual([]);

    const second = await start(db.path, environment);
    // The provider settles the payout once the servers know it (a payout asked just before the kill is
    // asked again by a server still running, and its webhook must find it).
    provider.state.settleAfterMs = undefined;
    try {
      let token: string;
      let last: string;
      try {
        last = await paidTonight(api, hal.token, tom.token);
        await eventually(
          async () => payoutsTo(account),
          found => found.length > 0,
          20000,
        );
        await kill(server);
        server = await start(db.path, environment);
        provider.attach(server.port);
        api = client(server.port);
        token = await api.login(hal.email);
        await listed(token, found => found.length >= 1);
        await sleep(2000);
        for (const payout of payoutsTo(account).filter(each => each.status === 'pending'))
          provider.settlePayout(payout.id);
      } finally {
        provider.state.settleAfterMs = 200;
      }
      const payouts = await listed(token, found => found.length > 0 && found.every(each => each.status === 'paid'));
      await sleep(3000);
      expect(await api.list('/hosts/me/payouts', token)).toHaveLength(1);
      expect(payouts[0]).toMatchObject({ amount: 2 * DUE, status: 'paid' });
      expect(sorted(payouts[0].bookingIds)).toEqual(sorted([first, last]));
      expect(payoutsTo(account).map(each => each.amount)).toEqual([2 * DUE]);
    } finally {
      await stop(second);
    }
  }, 180000);

  it('is neither held by the pause nor counted in heldPayouts, and still waits once payouts resume', async () => {
    provider.state.settleAfterMs = 200;
    const store = database('minimum-payout-pause');
    const own = await start(store.path, environment);
    others.push({ server: own, db: store });
    provider.attach(own.port);
    const on = client(own.port);
    try {
      const admin = await on.admin(ADMIN);
      const amy = await on.host('amy2@minimum-payout.test');
      const bob = await on.host('bob2@minimum-payout.test');
      const tom = await on.traveller('tom2@minimum-payout.test');
      const waiting = await enabledAccount(on, provider, amy.token);
      const held = await enabledAccount(on, provider, bob.token);
      const dashboard = () => on.read('/admin/dashboard', admin.token);

      // Amy's booking waits under her minimum: it is not held.
      await on.done('PUT', '/hosts/me/payout-minimum/EUR', amy.token, { amount: 50000 });
      const amys = await paidTonight(on, amy.token, tom.token);
      await sleep(3000);
      expect(payoutsTo(waiting)).toEqual([]);
      expect((await dashboard()).heldPayouts).toBe(0);

      // Paused: Bob's booking is held and counted; Amy's, waiting under her minimum, is not.
      await on.done('POST', '/admin/payouts/pause', admin.token, { reason: 'The provider pays the wrong accounts.' });
      const bobs = await paidTonight(on, bob.token, tom.token);
      await sleep(3000);
      expect(payoutsTo(held)).toEqual([]);
      const counted = await eventually(
        () => dashboard(),
        read => read.heldPayouts === 1,
      );
      expect(counted.heldPayouts).toBe(1);

      // Resumed: Bob is paid; Amy's still waits under her minimum.
      await on.done('POST', '/admin/payouts/resume', admin.token);
      await eventually(
        async () => payoutsTo(held),
        found => found.some(each => each.status === 'succeeded'),
        20000,
      );
      expect(payoutsTo(held).map(each => [each.reference, each.amount])).toEqual([[bobs, DUE]]);
      await sleep(3000);
      expect(payoutsTo(waiting)).toEqual([]);
      expect((await dashboard()).heldPayouts).toBe(0);
      expect(await on.list('/hosts/me/payouts', amy.token)).toEqual([]);

      // Lowered: Amy is paid what waited, once.
      await on.done('PUT', '/hosts/me/payout-minimum/EUR', amy.token, { amount: 0 });
      await eventually(
        () => on.list('/hosts/me/payouts', amy.token),
        found => found.some(each => each.status === 'paid'),
        20000,
      );
      await sleep(2000);
      expect(payoutsTo(waiting).map(each => [each.reference, each.amount])).toEqual([[amys, DUE]]);
    } finally {
      provider.attach(server.port);
    }
  }, 150000);
});
