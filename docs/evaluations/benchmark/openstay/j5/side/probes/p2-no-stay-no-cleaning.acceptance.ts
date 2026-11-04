import { client, Client, database, day, eventually, Json, Running, sleep, start, stop } from './openstay';
import { feeOf, openAccount, paymentProvider, payBooking } from './provider';

/**
 * Probe P2, no stay, no cleaning: the cleaning fee is refundable in full on any cancellation, like the
 * tourist tax, and the policy applies to the rest of the host's lines only; the refund, its receipt and
 * the payout follow; the earnings by month show the cleaning fees apart, as `cleaning`.
 */
const db = database('no-stay-no-cleaning');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** A listing under `policy`, at `nightlyPrice` and `cleaningFee`, with 1 € of tax per guest and night. */
async function listing(token: string, policy: string, nightlyPrice = 10000, cleaningFee = 2000, tax = 100) {
  const id = await api.listing(token, { city: 'Rennes', nightlyPrice, cleaningFee, cancellationPolicy: policy });
  if (tax) await api.done('PUT', `/listings/${id}/tourist-tax`, token, { perGuestPerNight: tax });
  return id;
}
const read = (bookingId: string, token: string) => api.read(`/bookings/${bookingId}`, token);
const refundableOf = async (bookingId: string, token: string) =>
  ((await read(bookingId, token)).cancellation as Json | undefined)?.refundable;
/** Read when a case runs, after the server started (it may have waited past midnight). */
const month = () => day(0).slice(0, 7);
const year = () => day(0).slice(0, 4);

describe('no stay, no cleaning', () => {
  it('makes the cleaning fee refundable in full, and the policy give its share of the rest of the host lines', async () => {
    const hal = await api.host('hal@no-stay-no-cleaning.test');
    const tom = await api.traveller('tom@no-stay-no-cleaning.test');
    const policies = {
      flexible: await listing(hal.token, 'flexible'),
      moderate: await listing(hal.token, 'moderate'),
      strict: await listing(hal.token, 'strict'),
    };
    // Two nights, one guest: 20 000 of nights, 2 000 of cleaning, 200 of tax, 22 200 in all.
    const cases: [keyof typeof policies, 'traveller' | 'host', number, number][] = [
      ['flexible', 'traveller', 10, 22200],
      ['flexible', 'traveller', 1, 22200],
      ['flexible', 'traveller', 0, 2200],
      ['moderate', 'traveller', 10, 22200],
      ['moderate', 'traveller', 5, 22200],
      ['moderate', 'traveller', 3, 200 + 2000 + 10000],
      ['moderate', 'traveller', 0, 2200],
      ['strict', 'traveller', 10, 200 + 2000 + 10000],
      ['strict', 'traveller', 7, 200 + 2000 + 10000],
      ['strict', 'traveller', 3, 2200],
      ['strict', 'traveller', 0, 2200],
      ['strict', 'host', 10, 22200],
      ['strict', 'host', 0, 22200],
    ];
    const seen: [string, string, number, unknown][] = [];
    for (const [policy, by, days] of cases) {
      const bookingId = await api.book(
        tom.token,
        await api.quote(tom.token, policies[policy], day(days), day(days + 2)),
      );
      expect((await read(bookingId, tom.token)).total).toBe(22200);
      await api.done('POST', `/bookings/${bookingId}/cancel`, by === 'host' ? hal.token : tom.token);
      seen.push([policy, by, days, await refundableOf(bookingId, tom.token)]);
    }
    expect(seen).toEqual(cases);
  }, 180000);

  it('rounds the half of the rest down to the cent, and keeps the cleaning fee whole', async () => {
    const hal = await api.host('hal2@no-stay-no-cleaning.test');
    const tom = await api.traveller('tom2@no-stay-no-cleaning.test');
    // Strict, 8 days before: 100 of tax, 2 000 of cleaning, half of 10 001 is 5 000.
    const strict = await listing(hal.token, 'strict', 10001, 2000);
    const first = await api.book(tom.token, await api.quote(tom.token, strict, day(8), day(9)));
    await api.done('POST', `/bookings/${first}/cancel`, tom.token);
    expect(await refundableOf(first, tom.token)).toBe(100 + 2000 + 5000);
    // Moderate, 3 days before: 100 of tax, 2 001 of cleaning whole, half of 10 000.
    const moderate = await listing(hal.token, 'moderate', 10000, 2001);
    const second = await api.book(tom.token, await api.quote(tom.token, moderate, day(3), day(4)));
    await api.done('POST', `/bookings/${second}/cancel`, tom.token);
    expect(await refundableOf(second, tom.token)).toBe(100 + 2001 + 5000);
    expect((await read(second, tom.token)).refund).toMatchObject({ amount: 100 + 2001 + 5000, status: 'owed' });
  }, 60000);

  it('applies the policy to the nights with their discount, the extra guests and a promotion code', async () => {
    const hal = await api.host('hal3@no-stay-no-cleaning.test');
    const tom = await api.traveller('tom3@no-stay-no-cleaning.test');
    const id = await listing(hal.token, 'strict');
    await api.done('PUT', `/listings/${id}/discounts`, hal.token, { weeklyPercent: 10, monthlyPercent: 0 });
    await api.done('PUT', `/listings/${id}/extra-guests`, hal.token, { fromGuests: 1, perGuestPerNight: 500 });

    // Seven nights for two, 10 days ahead: 70 000 of nights, −7 000 of discount, 2 000 of cleaning, 3 500 for
    // the extra guest and 1 400 of tax. Refundable: the tax, the cleaning, half of 66 500.
    const week = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(17), 2));
    expect((await read(week, tom.token)).total).toBe(70000 - 7000 + 2000 + 3500 + 1400);
    await api.done('POST', `/bookings/${week}/cancel`, tom.token);
    expect(await refundableOf(week, tom.token)).toBe(1400 + 2000 + 33250);

    // Two nights for one, with a code of 20 %: 20 000 of nights, −4 000 of code, 2 000 of cleaning, 200 of tax.
    await api.create(`/listings/${id}/codes`, hal.token, { code: 'FRIEND20', percent: 20, uses: 5 });
    const quoteId = await api.create('/quotes', tom.token, {
      listingId: id,
      checkIn: day(20),
      checkOut: day(22),
      guests: 1,
      code: 'FRIEND20',
    });
    const coded = await api.book(tom.token, quoteId);
    expect((await read(coded, tom.token)).total).toBe(20000 - 4000 + 2000 + 200);
    await api.done('POST', `/bookings/${coded}/cancel`, tom.token);
    expect(await refundableOf(coded, tom.token)).toBe(200 + 2000 + 8000);
  }, 90000);

  it('refunds the new amount through the provider, gives its receipt, and pays the host what was not refunded', async () => {
    const hal = await api.host('hal4@no-stay-no-cleaning.test');
    const tom = await api.traveller('tom4@no-stay-no-cleaning.test');
    // The account is opened but not enabled: nothing is paid out before the cancellation is refunded.
    const account = await openAccount(api, provider, hal.token);

    // Strict, 10 days ahead, paid: 100 of tax, 2 000 of cleaning, half of 10 000.
    const strict = await listing(hal.token, 'strict');
    const later = await api.book(tom.token, await api.quote(tom.token, strict, day(10), day(11)));
    const payment = await payBooking(api, provider, tom.token, later);
    await api.done('POST', `/bookings/${later}/cancel`, tom.token);
    const refunded = await eventually(
      () => read(later, tom.token),
      booking => (booking.refund as Json | undefined)?.status === 'refunded',
      20000,
    );
    expect(refunded).toMatchObject({
      cancellation: { by: 'traveller', refundable: 7100 },
      refund: { amount: 7100, status: 'refunded' },
      payment: { refunded: 7100 },
    });
    expect([...provider.refunds.values()].filter(each => each.payment === payment.id).map(each => each.amount)).toEqual(
      [7100],
    );

    // Flexible, tonight, paid, cancelled on the day of check-in: the tax and the cleaning fee come back.
    const flexible = await listing(hal.token, 'flexible');
    const tonight = await api.book(tom.token, await api.quote(tom.token, flexible, day(0), day(1)));
    await payBooking(api, provider, tom.token, tonight);
    await api.done('POST', `/bookings/${tonight}/cancel`, tom.token);
    await eventually(
      () => read(tonight, tom.token),
      booking => (booking.payment as Json).refunded === 2100,
      20000,
    );
    expect(await refundableOf(tonight, tom.token)).toBe(2100);

    const receipts = await eventually(
      () => api.list('/receipts/mine', tom.token),
      found => found.filter(each => each.kind === 'refund').length >= 2,
    );
    expect(receipts.filter(each => each.kind === 'refund')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookingId: later, amount: 7100 }),
        expect.objectContaining({ bookingId: tonight, amount: 2100 }),
      ]),
    );

    // Once the account is enabled, the host is paid what was paid, less the fee, less the refund.
    provider.account(account.id, 'enabled');
    const payouts = await eventually(
      () => api.list('/hosts/me/payouts', hal.token),
      found => found.length > 0,
      20000,
    );
    expect(payouts).toEqual([expect.objectContaining({ bookingIds: [tonight], amount: 12100 - feeOf(12100) - 2100 })]);
    await sleep(2000);
    expect([...provider.payouts.values()].filter(each => each.account === account.id).map(each => each.amount)).toEqual(
      [12100 - feeOf(12100) - 2100],
    );
  }, 120000);

  it('shows the cleaning fees of the bookings charged in the month apart, inside what was charged', async () => {
    const hal = await api.host('hal5@no-stay-no-cleaning.test');
    const ian = await api.host('ian5@no-stay-no-cleaning.test');
    const tom = await api.traveller('tom5@no-stay-no-cleaning.test');
    const bookTen = async (id: string) => api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));

    // Paid: 12 000 charged, 2 000 of it cleaning.
    await payBooking(api, provider, tom.token, await bookTen(await listing(hal.token, 'flexible', 10000, 2000, 0)));
    // Paid, then cancelled under strict: 13 000 charged, 3 000 of cleaning, 3 000 + 5 000 refunded.
    const cancelled = await bookTen(await listing(hal.token, 'strict', 10000, 3000, 0));
    await payBooking(api, provider, tom.token, cancelled);
    await api.done('POST', `/bookings/${cancelled}/cancel`, tom.token);
    // Declared paid by the host, and never paid: neither is charged, and their cleaning counts nothing.
    const declared = await bookTen(await listing(hal.token, 'flexible', 10000, 4000, 0));
    await api.done('POST', `/bookings/${declared}/declare-paid`, hal.token);
    await bookTen(await listing(hal.token, 'flexible', 10000, 5000, 0));
    // In pounds: counted in pounds only.
    const pounds = await api.create('/listings', hal.token, {
      title: 'A room with a view',
      city: 'Rennes',
      capacity: 2,
      nightlyPrice: 10000,
      cleaningFee: 1500,
      cancellationPolicy: 'flexible',
      currency: 'GBP',
    });
    await api.done('POST', `/listings/${pounds}/publish`, hal.token);
    await payBooking(api, provider, tom.token, await bookTen(pounds));

    const earnings = (query = '') => api.list(`/hosts/me/earnings?year=${year()}${query}`, hal.token);
    const euros = await eventually(
      () => earnings(),
      found => found[0]?.refunded === 8000,
      20000,
    );
    expect(euros).toMatchObject([
      {
        month: month(),
        currency: 'EUR',
        charged: 12000 + 13000,
        cleaning: 2000 + 3000,
        fees: feeOf(12000) + feeOf(13000),
        refunded: 8000,
        paidOut: 0,
      },
    ]);
    expect(await earnings('&currency=EUR')).toMatchObject([{ currency: 'EUR', cleaning: 5000, charged: 25000 }]);
    expect(await earnings('&currency=GBP')).toMatchObject([
      { month: month(), currency: 'GBP', charged: 11500, cleaning: 1500, fees: feeOf(11500, 'GBP'), refunded: 0 },
    ]);
    expect(await api.list(`/hosts/me/earnings?year=${year()}`, ian.token)).toEqual([]);
  }, 120000);
});
