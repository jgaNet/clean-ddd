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
  WEEKDAYS,
} from './openstay';
import { Currency, enabledAccount, feeOf, paymentProvider, payBooking, ProviderAccount } from './provider';

/**
 * Request 89: payouts per currency. A host paid each currency apart, per booking or once a week, never a
 * booking twice; the statement and the earnings of one currency at a time.
 */
const db = database('payouts-per-currency');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** Read when a case runs, after the server started (it may have waited past midnight). */
const today = () => WEEKDAYS[new Date().getUTCDay()];
const anotherDay = () => WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
/** One night at 100 and 20 of cleaning in `currency` (¥15,000 and ¥3,000 in yen): what is paid. */
const TOTAL: Record<Currency, number> = { EUR: 12000, GBP: 12000, CHF: 12000, JPY: 18000 };
/** What is due for such a night: what was paid, less the provider's fee in its currency. */
const due = (currency: Currency) => TOTAL[currency] - feeOf(TOTAL[currency], currency);
const payoutsTo = (account: ProviderAccount) =>
  [...provider.payouts.values()].filter(each => each.account === account.id);
const listed = (token: string, expected: (payouts: Json[]) => boolean) =>
  eventually(() => api.list('/hosts/me/payouts', token), expected, 20000);

/** A listing in `currency`, booked tonight by `traveller` and paid: the booking's id. */
async function paidTonight(hostToken: string, travellerToken: string, currency: Currency) {
  const id = await api.create('/listings', hostToken, {
    title: 'A room with a view',
    city: 'Lyon',
    capacity: 2,
    nightlyPrice: currency === 'JPY' ? 15000 : 10000,
    cleaningFee: currency === 'JPY' ? 3000 : 2000,
    cancellationPolicy: 'flexible',
    currency,
  });
  await api.done('POST', `/listings/${id}/publish`, hostToken);
  const bookingId = await api.book(travellerToken, await api.quote(travellerToken, id, day(0), day(1)));
  const payment = await payBooking(api, provider, travellerToken, bookingId);
  expect(payment).toMatchObject({ amount: TOTAL[currency], currency });
  return { bookingId, payment };
}

describe('payouts per currency', () => {
  it('pays each booking apart in its currency, and gives the statement and the earnings of one currency', async () => {
    const hal = await api.host('hal@payouts-per-currency.test');
    const tom = await api.traveller('tom@payouts-per-currency.test');
    const account = await enabledAccount(api, provider, hal.token);
    const bookings = {} as Record<'EUR' | 'GBP' | 'JPY', string>;
    for (const currency of ['EUR', 'GBP', 'JPY'] as const)
      bookings[currency] = (await paidTonight(hal.token, tom.token, currency)).bookingId;

    const payouts = await listed(hal.token, found => found.length === 3 && found.every(each => each.status === 'paid'));
    expect(payouts).toEqual(
      expect.arrayContaining(
        (['EUR', 'GBP', 'JPY'] as const).map(currency =>
          expect.objectContaining({
            bookingIds: [bookings[currency]],
            currency,
            amount: due(currency),
            status: 'paid',
          }),
        ),
      ),
    );
    expect(
      payoutsTo(account)
        .map(each => [each.reference, each.currency, each.amount])
        .sort(),
    ).toEqual((['EUR', 'GBP', 'JPY'] as const).map(currency => [bookings[currency], currency, due(currency)]).sort());

    const statement = (query: string) =>
      api.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}${query}`, hal.token);
    const movements = (read: Json) =>
      (read.lines as Json[])
        .map(line => `${String(line.type)} ${String(line.bookingId)} ${String(line.amount)}`)
        .sort();
    const linesOf = (currency: Currency) =>
      [
        `charge ${bookings[currency as 'EUR']} ${TOTAL[currency]}`,
        `fee ${bookings[currency as 'EUR']} ${-feeOf(TOTAL[currency], currency)}`,
        `payout ${bookings[currency as 'EUR']} ${-due(currency)}`,
      ].sort();
    for (const [query, currency] of [
      ['', 'EUR'],
      ['&currency=EUR', 'EUR'],
      ['&currency=GBP', 'GBP'],
      ['&currency=JPY', 'JPY'],
    ] as const) {
      const read = await eventually(
        () => statement(query),
        found => (found.lines as Json[]).length >= 3,
      );
      expect(read).toMatchObject({ currency, balance: 0 });
      expect(movements(read)).toEqual(linesOf(currency));
    }
    expect(await statement('&currency=CHF')).toMatchObject({ currency: 'CHF', lines: [], balance: 0 });
    for (const currency of ['USD', 'gbp-', 'yen'])
      expect(
        (await api.call('GET', `/hosts/me/statement?from=${day(-1)}&to=${day(2)}&currency=${currency}`, hal.token))
          .status,
      ).toBe(400);

    const year = new Date().toISOString().slice(0, 4);
    const month = new Date().toISOString().slice(0, 7);
    for (const [query, currency] of [
      ['', 'EUR'],
      ['&currency=GBP', 'GBP'],
      ['&currency=JPY', 'JPY'],
    ] as const)
      expect(await api.list(`/hosts/me/earnings?year=${year}${query}`, hal.token)).toEqual([
        expect.objectContaining({
          month,
          currency,
          charged: TOTAL[currency],
          fees: feeOf(TOTAL[currency], currency),
          refunded: 0,
          paidOut: due(currency),
        }),
      ]);
    expect((await api.call('GET', `/hosts/me/earnings?year=${year}&currency=USD`, hal.token)).status).toBe(400);
  }, 120000);

  it('pays a weekly host one payout per currency in which something is due, on their weekday', async () => {
    const ian = await api.host('ian@payouts-per-currency.test');
    const tom = await api.traveller('tom2@payouts-per-currency.test');
    const account = await enabledAccount(api, provider, ian.token);
    await api.done('PUT', '/hosts/me/payout-schedule', ian.token, { schedule: 'weekly', weekday: anotherDay() });
    const euros = [
      (await paidTonight(ian.token, tom.token, 'EUR')).bookingId,
      (await paidTonight(ian.token, tom.token, 'EUR')).bookingId,
    ];
    const pounds = (await paidTonight(ian.token, tom.token, 'GBP')).bookingId;
    await sleep(3000);
    expect(payoutsTo(account)).toEqual([]);

    await api.done('PUT', '/hosts/me/payout-schedule', ian.token, { schedule: 'weekly', weekday: today() });
    const payouts = await listed(ian.token, found => found.length >= 2 && found.every(each => each.status === 'paid'));
    expect(payouts).toHaveLength(2);
    const inEuros = payouts.find(each => each.currency === 'EUR');
    expect([...((inEuros?.bookingIds as string[]) ?? [])].sort()).toEqual([...euros].sort());
    expect(inEuros).toMatchObject({ amount: 2 * due('EUR') });
    expect(payouts.find(each => each.currency === 'GBP')).toMatchObject({ bookingIds: [pounds], amount: due('GBP') });

    await sleep(3000);
    const sent = payoutsTo(account);
    expect(sent.map(each => [each.currency, each.amount]).sort()).toEqual(
      [
        ['EUR', 2 * due('EUR')],
        ['GBP', due('GBP')],
      ].sort(),
    );
    // Several bookings: a reference of OpenStay's own. One booking: the booking's id.
    const euroPayout = sent.find(each => each.currency === 'EUR')!;
    expect([...euros, pounds]).not.toContain(euroPayout.reference);
    expect(sent.find(each => each.currency === 'GBP')?.reference).toBe(pounds);
    expect(await api.list('/hosts/me/payouts', ian.token)).toHaveLength(2);
  }, 120000);

  it('pays nothing while the account is disabled, holds a disputed booking alone, and pays a failed payout again in its currency', async () => {
    const jon = await api.host('jon@payouts-per-currency.test');
    const tom = await api.traveller('tom3@payouts-per-currency.test');
    const account = await enabledAccount(api, provider, jon.token);
    provider.account(account.id, 'disabled');
    await eventually(
      () => api.read('/hosts/me/payout-account', jon.token),
      read => read.status === 'disabled',
    );
    const euro = (await paidTonight(jon.token, tom.token, 'EUR')).bookingId;
    const pound = (await paidTonight(jon.token, tom.token, 'GBP')).bookingId;
    const disputed = await paidTonight(jon.token, tom.token, 'GBP');
    const opened = provider.dispute(disputed.payment.id);
    await eventually(
      async () => (await api.read(`/bookings/${disputed.bookingId}`, tom.token)).payment as Json,
      payment => payment.disputed === true,
    );
    await sleep(3000);
    expect(payoutsTo(account)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', jon.token)).toEqual([]);

    provider.account(account.id, 'enabled');
    const paid = await listed(jon.token, found => found.filter(each => each.status === 'paid').length >= 2);
    expect(paid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookingIds: [euro], currency: 'EUR', amount: due('EUR'), status: 'paid' }),
        expect.objectContaining({ bookingIds: [pound], currency: 'GBP', amount: due('GBP'), status: 'paid' }),
      ]),
    );
    await sleep(2000);
    expect(payoutsTo(account).filter(each => each.reference === disputed.bookingId)).toEqual([]);

    provider.state.failPayouts = true;
    provider.closeDispute(opened, 'won');
    await listed(jon.token, found =>
      found.some(each => each.status === 'failed' && (each.bookingIds as string[]).includes(disputed.bookingId)),
    );
    provider.state.failPayouts = false;
    const after = await listed(jon.token, found =>
      found.some(each => each.status === 'paid' && (each.bookingIds as string[]).includes(disputed.bookingId)),
    );
    const forDisputed = after.filter(each => (each.bookingIds as string[]).includes(disputed.bookingId));
    expect(forDisputed.filter(each => each.status === 'paid')).toEqual([
      expect.objectContaining({ currency: 'GBP', amount: due('GBP') }),
    ]);
    expect(forDisputed.filter(each => each.status === 'failed').length).toBeGreaterThan(0);
    for (const each of forDisputed) expect(each).toMatchObject({ currency: 'GBP', amount: due('GBP') });
    await sleep(2000);
    const succeeded = payoutsTo(account).filter(each => each.status === 'succeeded');
    expect(succeeded.map(each => [each.currency, each.amount]).sort()).toEqual(
      [
        ['EUR', due('EUR')],
        ['GBP', due('GBP')],
        ['GBP', due('GBP')],
      ].sort(),
    );
  }, 120000);

  it('pays each booking once across two servers on one database, a crash, and a change of schedule', async () => {
    const kai = await api.host('kai@payouts-per-currency.test');
    const tom = await api.traveller('tom4@payouts-per-currency.test');
    const account = await enabledAccount(api, provider, kai.token);
    await api.done('PUT', '/hosts/me/payout-schedule', kai.token, { schedule: 'weekly', weekday: anotherDay() });
    const bookings = [
      (await paidTonight(kai.token, tom.token, 'EUR')).bookingId,
      (await paidTonight(kai.token, tom.token, 'EUR')).bookingId,
      (await paidTonight(kai.token, tom.token, 'JPY')).bookingId,
    ];
    await sleep(2000);
    expect(payoutsTo(account)).toEqual([]);

    const second = await start(db.path, environment);
    try {
      await api.done('PUT', '/hosts/me/payout-schedule', kai.token, { schedule: 'weekly', weekday: today() });
      await eventually(
        async () => payoutsTo(account),
        found => found.length > 0,
        20000,
      );
      await kill(server);
      server = await start(db.path, environment);
      provider.attach(server.port);
      api = client(server.port);
      const token = await api.login(kai.email);
      // What the provider said while the server was down is said again.
      for (const event of provider.events.filter(
        each => each.type.startsWith('payout.') && each.data.account === account.id,
      ))
        provider.resend(event);
      await listed(token, found => found.length >= 2 && found.every(each => each.status === 'paid'));
      await api.done('PUT', '/hosts/me/payout-schedule', token, { schedule: 'daily' });
      await sleep(4000);

      const payouts = await api.list('/hosts/me/payouts', token);
      const paidIds = payouts.flatMap(each => each.bookingIds as string[]);
      expect([...paidIds].sort()).toEqual([...bookings].sort());
      expect(payouts.map(each => [each.currency, each.amount]).sort()).toEqual(
        [
          ['EUR', 2 * due('EUR')],
          ['JPY', due('JPY')],
        ].sort(),
      );
      expect(
        payoutsTo(account)
          .map(each => [each.currency, each.amount])
          .sort(),
      ).toEqual(
        [
          ['EUR', 2 * due('EUR')],
          ['JPY', due('JPY')],
        ].sort(),
      );
    } finally {
      await stop(second);
    }
  }, 180000);
});
