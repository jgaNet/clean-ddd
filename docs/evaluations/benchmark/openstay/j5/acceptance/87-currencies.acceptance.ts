import {
  adminEnvironment,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { Currency, enabledAccount, feeOf, paymentProvider, payBooking } from './provider';

/**
 * Request 87: currencies. A listing priced in EUR, GBP, CHF or JPY, and every amount that follows from a
 * stay in it: the quote, the booking, the payment and its fee, the refunds, the payout and the receipt.
 */
const db = database('currencies');
const provider = paymentProvider();
const ADA = 'ada@currencies.test';
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, {
    ...(await provider.environment()),
    ...adminEnvironment(ADA),
    JOBS_INTERVAL_SECONDS: '1',
    // Short enough for a test to see a quote stop being valid.
    QUOTE_TTL_SECONDS: '8',
  });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const description = (fields: Json = {}) => ({
  title: 'A room with a view',
  city: 'Lyon',
  capacity: 2,
  nightlyPrice: 10000,
  cleaningFee: 2000,
  cancellationPolicy: 'flexible',
  ...fields,
});
/** A listing created with `fields` (a `currency` among them, or not), published unless said otherwise. */
async function listing(token: string, fields: Json = {}, publish = true) {
  const id = await api.create('/listings', token, description(fields));
  if (publish) await api.done('POST', `/listings/${id}/publish`, token);
  return id;
}
const currencyOf = async (id: string, token?: string) => (await api.read(`/listings/${id}`, token)).currency;
const lines = (read: Json) => read.lines as { label: string; for: string; amount: number }[];
const sum = (each: { amount: number }[]) => each.reduce((total, line) => total + line.amount, 0);
const payoutsFor = (bookingId: string) => [...provider.payouts.values()].filter(each => each.reference === bookingId);

describe('currencies', () => {
  it('prices a listing in EUR until its host gives another of the four, and refuses a change once it was quoted or booked', async () => {
    const hal = await api.host('hal@currencies.test');
    const ian = await api.host('ian@currencies.test');
    const tom = await api.traveller('tom@currencies.test');
    const euros = await listing(hal.token, { city: 'Bath' });
    const pounds = await listing(hal.token, { city: 'Bath', currency: 'GBP' });
    const draft = await listing(hal.token, { city: 'Bath' }, false);
    expect(await currencyOf(euros)).toBe('EUR');
    expect(await currencyOf(pounds)).toBe('GBP');
    expect(await currencyOf(draft, hal.token)).toBe('EUR');
    for (const currency of ['USD', 'XYZ', '', 42])
      expect(await api.refused('POST', '/listings', hal.token, description({ currency }))).toBe(true);
    // A nightly price of at least 100 of the minor unit: ¥100.
    expect(await api.refused('POST', '/listings', hal.token, description({ currency: 'JPY', nightlyPrice: 99 }))).toBe(
      true,
    );
    const yen = await listing(hal.token, { city: 'Bath', currency: 'JPY', nightlyPrice: 100, cleaningFee: 0 });
    expect(await api.read(`/listings/${yen}`)).toMatchObject({ currency: 'JPY', nightlyPrice: 100 });

    for (const currency of ['CHF', 'JPY', 'GBP', 'EUR', 'CHF']) {
      await api.done('PUT', `/listings/${draft}/currency`, hal.token, { currency });
      expect(await currencyOf(draft, hal.token)).toBe(currency);
    }
    for (const currency of ['USD', 'chf-', ''])
      expect(await api.refused('PUT', `/listings/${draft}/currency`, hal.token, { currency })).toBe(true);
    expect(await api.refused('PUT', `/listings/${draft}/currency`, ian.token, { currency: 'GBP' })).toBe(true);
    expect(await currencyOf(draft, hal.token)).toBe('CHF');
    expect((await api.list('/listings/mine', hal.token)).find(each => each.id === draft)).toMatchObject({
      currency: 'CHF',
    });
    expect((await api.list('/listings?city=Bath')).find(each => each.id === pounds)).toMatchObject({ currency: 'GBP' });

    // A quote still valid holds the currency; once it has lapsed, the currency may change again.
    const quoted = await listing(hal.token, { city: 'Bath' });
    await api.quote(tom.token, quoted, day(10), day(11));
    expect(await api.refused('PUT', `/listings/${quoted}/currency`, hal.token, { currency: 'GBP' })).toBe(true);
    // A booking holds it whatever its status, cancelled included.
    const booked = await listing(hal.token, { city: 'Bath' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, booked, day(10), day(11)));
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    await sleep(9000);
    await api.done('PUT', `/listings/${quoted}/currency`, hal.token, { currency: 'GBP' });
    expect(await currencyOf(quoted)).toBe('GBP');
    expect(await api.refused('PUT', `/listings/${booked}/currency`, hal.token, { currency: 'GBP' })).toBe(true);
    expect(await currencyOf(booked)).toBe('EUR');
  }, 90000);

  it('keeps a GBP stay and a JPY stay in their currency from the quote to the payout and the receipt', async () => {
    const hal = await api.host('hal2@currencies.test');
    const tom = await api.traveller('tom2@currencies.test');
    await enabledAccount(api, provider, hal.token);
    const stays: { currency: Currency; nightlyPrice: number; cleaningFee: number; tax: number }[] = [
      { currency: 'GBP', nightlyPrice: 10000, cleaningFee: 2000, tax: 100 },
      { currency: 'JPY', nightlyPrice: 15000, cleaningFee: 3000, tax: 200 },
    ];
    const booked: { bookingId: string; currency: Currency; total: number }[] = [];
    for (const { currency, nightlyPrice, cleaningFee, tax } of stays) {
      const id = await listing(hal.token, { city: 'Kyoto', currency, nightlyPrice, cleaningFee });
      await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: tax });
      const total = nightlyPrice + cleaningFee + tax;
      const quoteId = await api.quote(tom.token, id, day(0), day(1));
      const quote = await api.read(`/quotes/${quoteId}`, tom.token);
      expect(quote).toMatchObject({ currency, total });
      expect(sum(lines(quote))).toBe(total);
      expect(lines(quote).filter(line => line.for === 'external')).toEqual([expect.objectContaining({ amount: tax })]);
      expect((await api.list('/quotes/mine', tom.token)).find(each => each.id === quoteId)).toMatchObject({ currency });

      const bookingId = await api.book(tom.token, quoteId);
      expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ currency, total });
      expect((await api.list(`/bookings/${bookingId}/conditions`, tom.token))[0]).toMatchObject({ currency, total });
      const payment = await payBooking(api, provider, tom.token, bookingId);
      expect(payment).toMatchObject({ amount: total, currency, fee: feeOf(total, currency) });
      expect((await api.read(`/bookings/${bookingId}`, hal.token)).payment).toMatchObject({
        status: 'paid',
        amount: total,
        fee: feeOf(total, currency),
      });
      booked.push({ bookingId, currency, total });
    }

    // Each booking paid out once, in its own currency, what was paid less the fee.
    for (const { bookingId, currency, total } of booked) {
      const [payout] = await eventually(
        async () => payoutsFor(bookingId),
        found => found.length > 0,
        20000,
      );
      expect(payout).toMatchObject({ amount: total - feeOf(total, currency), currency });
    }
    const payouts = await eventually(
      () => api.list('/hosts/me/payouts', hal.token),
      found => found.length === 2 && found.every(each => each.status === 'paid'),
      20000,
    );
    expect(payouts).toEqual(
      expect.arrayContaining(
        booked.map(({ bookingId, currency, total }) =>
          expect.objectContaining({ bookingIds: [bookingId], currency, amount: total - feeOf(total, currency) }),
        ),
      ),
    );
    const receipts = await eventually(
      () => api.list('/receipts/mine', tom.token),
      found => found.length >= 2,
    );
    expect(receipts).toEqual(
      expect.arrayContaining(
        booked.map(({ bookingId, currency, total }) =>
          expect.objectContaining({ kind: 'payment', bookingId, currency, amount: total }),
        ),
      ),
    );

    // A refund is in its booking's currency.
    const later = await listing(hal.token, { city: 'Kyoto', currency: 'GBP' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, later, day(10), day(11)));
    const payment = await payBooking(api, provider, tom.token, bookingId);
    await api.create(`/bookings/${bookingId}/refunds`, hal.token, { amount: 1000, reason: 'A broken shower' });
    const [refund] = await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === payment.id),
      found => found.length > 0,
    );
    expect(refund).toMatchObject({ amount: 1000, currency: 'GBP' });
    expect(
      await eventually(
        () => api.list(`/bookings/${bookingId}/refunds`, hal.token),
        found => found.some(each => each.status === 'refunded'),
      ),
    ).toEqual([expect.objectContaining({ amount: 1000, currency: 'GBP' })]);

    // The statement counts the euros only, and this host has none; other currencies' fees stand apart.
    expect(await api.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}`, hal.token)).toMatchObject({
      lines: [],
      balance: 0,
    });
    const gbpFees = feeOf(booked[0].total, 'GBP') + feeOf(payment.amount, 'GBP');
    const month = new Date().toISOString().slice(0, 7);
    expect(await api.read(`/transparency?month=${month}`)).toMatchObject({
      providerFees: 0,
      otherProviderFees: [
        expect.objectContaining({ currency: 'GBP', amount: gbpFees }),
        expect.objectContaining({ currency: 'JPY', amount: feeOf(booked[1].total, 'JPY') }),
      ],
    });
  }, 150000);

  it('finds listings in every currency, by currency in the order of its code, and filters a price in the currency asked', async () => {
    const hal = await api.host('hal3@currencies.test');
    const euros = await listing(hal.token, { city: 'Zermatt', nightlyPrice: 10000 });
    const pounds = await listing(hal.token, { city: 'Zermatt', currency: 'GBP', nightlyPrice: 9000 });
    const francs = await listing(hal.token, { city: 'Zermatt', currency: 'CHF', nightlyPrice: 12000 });
    const yen = await listing(hal.token, { city: 'Zermatt', currency: 'JPY', nightlyPrice: 5000 });
    const cheaper = await listing(hal.token, { city: 'Zermatt', nightlyPrice: 8000 });

    const search = async (query: string) =>
      (await api.list(`/listings?city=Zermatt${query}`)).map(each => [each.id, each.currency]);
    expect(await search('')).toEqual([
      [francs, 'CHF'],
      [cheaper, 'EUR'],
      [euros, 'EUR'],
      [pounds, 'GBP'],
      [yen, 'JPY'],
    ]);
    expect(await search('&currency=GBP')).toEqual([[pounds, 'GBP']]);
    expect(await search('&currency=EUR')).toEqual([
      [cheaper, 'EUR'],
      [euros, 'EUR'],
    ]);
    expect(await search('&maxPrice=9500')).toEqual([[cheaper, 'EUR']]);
    expect(await search('&maxPrice=9500&currency=GBP')).toEqual([[pounds, 'GBP']]);
    expect(await search('&maxPrice=6000&currency=JPY')).toEqual([[yen, 'JPY']]);
    expect(await search('&maxPrice=4000&currency=JPY')).toEqual([]);
  }, 60000);

  it('adds up the tourist tax, the cost of payments and the reconciliation one currency at a time, and sets no season across two', async () => {
    const kit = await api.host('kit@currencies.test');
    const tom = await api.traveller('tom4@currencies.test');
    const ada = await api.admin(ADA);
    const euros = await listing(kit.token, { city: 'York' });
    const pounds = await listing(kit.token, { city: 'York', currency: 'GBP' });
    await api.done('PUT', `/listings/${euros}/tourist-tax`, kit.token, { perGuestPerNight: 150 });
    await api.done('PUT', `/listings/${pounds}/tourist-tax`, kit.token, { perGuestPerNight: 100 });
    const paid: Record<string, string> = {};
    for (const [currency, id] of [
      ['EUR', euros],
      ['GBP', pounds],
    ]) {
      paid[currency] = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
      await payBooking(api, provider, tom.token, paid[currency]);
    }
    const month = new Date().toISOString().slice(0, 7);

    // The tourist tax: one line per city and currency.
    expect(
      await eventually(
        () => api.list(`/hosts/me/tourist-tax?month=${month}`, kit.token),
        found => found.length >= 2,
      ),
    ).toEqual([
      expect.objectContaining({ city: 'York', currency: 'EUR', collected: 150 }),
      expect.objectContaining({ city: 'York', currency: 'GBP', collected: 100 }),
    ]);

    // The cost of payments: those of the currency asked, euros when none is.
    const succeeded = (currency: Currency) =>
      [...provider.payments.values()].filter(each => each.status === 'succeeded' && each.currency === currency);
    for (const currency of ['GBP', 'EUR'] as const) {
      const expected = {
        payments: succeeded(currency).length,
        amount: succeeded(currency).reduce((total, each) => total + each.amount, 0),
        fees: succeeded(currency).reduce((total, each) => total + each.fee, 0),
      };
      const query = currency === 'EUR' ? '' : `&currency=${currency}`;
      expect(
        await eventually(
          () => api.read(`/admin/payment-costs?month=${month}${query}`, ada.token),
          found => (found.provider as Json)?.payments === expected.payments,
        ),
      ).toMatchObject({ month, currency, provider: expected });
    }

    // The reconciliation: a charge the provider has in pounds under a booking paid in euros is a
    // mismatch of its own, and the euro charge still matches.
    provider.inject('charge', 12150, paid.EUR, 'GBP');
    const about = await eventually(
      async () =>
        ((await api.read(`/admin/reconciliation?date=${day(0)}`, ada.token)).mismatches as Json[]).filter(
          each => each.reference === paid.EUR,
        ),
      found => found.length > 0,
    );
    expect(about).toEqual([
      expect.objectContaining({
        type: 'charge',
        reference: paid.EUR,
        currency: 'GBP',
        provider: 12150,
        openstay: null,
      }),
    ]);

    // A season set on listings of two currencies at once is refused, for both.
    expect(
      await api.refused('POST', '/hosts/me/seasonal-prices', kit.token, {
        listingIds: [euros, pounds],
        from: day(40),
        to: day(42),
        nightlyPrice: 20000,
      }),
    ).toBe(true);
    for (const id of [euros, pounds]) {
      const quote = await api.read(`/quotes/${await api.quote(tom.token, id, day(40), day(41))}`, tom.token);
      expect(quote.total).toBe(10000 + 2000 + (id === euros ? 150 : 100));
    }
  }, 120000);
});
