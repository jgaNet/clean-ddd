import { adminEnvironment, client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { Currency, feeOf, paymentProvider, payBooking } from './provider';

/**
 * Request 94: the yearly report on hosts (DAC7), one row per host, country and currency, of the bookings paid
 * through the provider whose check-in falls in the year, and whether each host is reportable.
 */
const db = database('hosts-report');
const provider = paymentProvider();
const ADMIN = 'ada@hosts-report.test';
let server: Running;
let api: Client;
let admin: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, {
    ...(await provider.environment()),
    ...adminEnvironment(ADMIN),
    JOBS_INTERVAL_SECONDS: '1',
  });
  provider.attach(server.port);
  api = client(server.port);
  admin = await api.admin(ADMIN);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** Next calendar year, whole within the 730 days ahead the listings below take (request 17). */
const Y = new Date().getUTCFullYear() + 1;
const date = (month: number, dayOfMonth: number) =>
  `${Y}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

/** A published listing in `country` and `currency` that takes stays up to 730 days ahead. */
async function listing(
  token: string,
  { country, currency, ...fields }: { country: string; currency: Currency } & Json,
): Promise<string> {
  const id = await api.listing(token, fields);
  await api.done('PUT', `/listings/${id}/booking-window`, token, { minNoticeDays: 0, maxAdvanceDays: 730 });
  await api.done('PUT', `/listings/${id}/country`, token, { country });
  await api.done('PUT', `/listings/${id}/currency`, token, { currency });
  return id;
}
const book = async (token: string, listingId: string, checkIn: string, checkOut: string) =>
  api.book(token, await api.quote(token, listingId, checkIn, checkOut));
const refunded = (bookingId: string, token: string, amount: number) =>
  eventually(
    () => api.read(`/bookings/${bookingId}`, token),
    booking => (booking.payment as Json | null)?.refunded === amount,
    20000,
  );

/** Whether `ids` are in the order of `hostId`: as strings, or as numbers when every id is one. */
const inHostOrder = (ids: string[]) => {
  const same = (sorted: string[]) => sorted.every((each, n) => each === ids[n]);
  const numeric = ids.every(each => /^\d+$/.test(each));
  return (
    same([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) ||
    (numeric && same([...ids].sort((a, b) => Number(a) - Number(b))))
  );
};

describe('the yearly report on hosts', () => {
  it('reports each host, country and currency, what counts and what does not, and who is reportable', async () => {
    const amy = await api.host('amy@hosts-report.test');
    const ben = await api.host('ben@hosts-report.test');
    const cat = await api.host('cat@hosts-report.test');
    const dan = await api.host('dan@hosts-report.test');
    const eve = await api.host('eve@hosts-report.test');
    const tom = await api.traveller('tom@hosts-report.test');
    await api.done('PUT', '/admin/rates', admin.token, { base: 'EUR', rates: { GBP: 0.85, JPY: 160 } });
    const pay = (bookingId: string) => payBooking(api, provider, tom.token, bookingId);

    // Amy, in France, in euros: a stay whose dates changed before it was paid, one partly refunded by her,
    // one cancelled by the traveller with half refunded; one she cancelled (all refunded), one she declared
    // paid, one never paid: none of those three counts. And a stay this year, which is not next year's.
    const flexible = await listing(amy.token, { country: 'FR', currency: 'EUR' });
    const strict = await listing(amy.token, { country: 'FR', currency: 'EUR', cancellationPolicy: 'strict' });
    const changed = await book(tom.token, flexible, date(3, 1), date(3, 3));
    await api.done('POST', `/bookings/${changed}/change-dates`, tom.token, { checkIn: date(3, 1), checkOut: date(3, 4) });
    await pay(changed);
    const partly = await book(tom.token, flexible, date(3, 10), date(3, 11));
    await pay(partly);
    await api.create(`/bookings/${partly}/refunds`, amy.token, { amount: 2000, reason: 'A broken shower' });
    await refunded(partly, tom.token, 2000);
    const halved = await book(tom.token, strict, date(3, 1), date(3, 2));
    await pay(halved);
    await api.done('POST', `/bookings/${halved}/cancel`, tom.token);
    await refunded(halved, tom.token, 6000);
    const cancelled = await book(tom.token, flexible, date(3, 20), date(3, 21));
    await pay(cancelled);
    await api.done('POST', `/bookings/${cancelled}/cancel`, amy.token);
    await refunded(cancelled, tom.token, 12000);
    const declared = await book(tom.token, flexible, date(3, 22), date(3, 23));
    await api.done('POST', `/bookings/${declared}/declare-paid`, amy.token);
    await book(tom.token, flexible, date(3, 24), date(3, 25));
    const thisYear = await book(tom.token, flexible, day(0), day(1));
    await pay(thisYear);
    // Amy also lets in Germany, and in pounds.
    const german = await listing(amy.token, { country: 'DE', currency: 'EUR' });
    await pay(await book(tom.token, german, date(4, 1), date(4, 2)));
    const pounds = await listing(amy.token, { country: 'FR', currency: 'GBP' });
    await pay(await book(tom.token, pounds, date(4, 1), date(4, 2)));

    // Ben: 2,000 euros exactly. Cat: ¥320,000 at 160, 2,000 euros. Dan: francs, which have no rate.
    const big = await listing(ben.token, { country: 'FR', currency: 'EUR', nightlyPrice: 198000 });
    await pay(await book(tom.token, big, date(5, 1), date(5, 2)));
    const yen = await listing(cat.token, { country: 'JP', currency: 'JPY', nightlyPrice: 300000, cleaningFee: 20000 });
    await pay(await book(tom.token, yen, date(5, 1), date(5, 2)));
    const francs = await listing(dan.token, { country: 'CH', currency: 'CHF', nightlyPrice: 500000, cleaningFee: 0 });
    await pay(await book(tom.token, francs, date(5, 1), date(5, 2)));
    // Eve: 30 bookings of 1 euro.
    const small = await listing(eve.token, { country: 'FR', currency: 'EUR', nightlyPrice: 100, cleaningFee: 0 });
    for (let n = 1; n <= 30; n++) await pay(await book(tom.token, small, date(7, n), date(7, n + 1)));

    const ours = [amy.id, ben.id, cat.id, dan.id, eve.id];
    const rows = (await api.list(`/admin/hosts-report?year=${Y}`, admin.token)).filter(row =>
      ours.includes(String(row.hostId)),
    );
    // Every row expected, and no other: one per host, country and currency.
    const keyOf = (each: Json) => `${String(each.hostId)} ${String(each.country)} ${String(each.currency)}`;
    expect(rows.map(keyOf).sort()).toEqual(
      [
        [amy.id, 'DE', 'EUR'],
        [amy.id, 'FR', 'EUR'],
        [amy.id, 'FR', 'GBP'],
        [ben.id, 'FR', 'EUR'],
        [cat.id, 'JP', 'JPY'],
        [dan.id, 'CH', 'CHF'],
        [eve.id, 'FR', 'EUR'],
      ]
        .map(([hostId, country, currency]) => keyOf({ hostId, country, currency }))
        .sort(),
    );
    // In the order of hostId, then country, then currency.
    const hosts = rows.map(each => String(each.hostId));
    const runs = hosts.filter((each, n) => n === 0 || hosts[n - 1] !== each);
    expect(new Set(runs).size).toBe(runs.length);
    expect(inHostOrder(runs)).toBe(true);
    expect(rows.filter(each => each.hostId === amy.id).map(each => [each.country, each.currency])).toEqual([
      ['DE', 'EUR'],
      ['FR', 'EUR'],
      ['FR', 'GBP'],
    ]);

    const find = (hostId: string, country: string, currency: string) =>
      rows.find(each => each.hostId === hostId && each.country === country && each.currency === currency);
    expect(find(amy.id, 'FR', 'EUR')).toMatchObject({
      bookings: 3,
      nights: 5,
      paid: 32000 + 10000 + 6000,
      fees: feeOf(32000) + 2 * feeOf(12000),
      reportable: false,
    });
    expect(find(amy.id, 'DE', 'EUR')).toMatchObject({
      bookings: 1,
      nights: 1,
      paid: 12000,
      fees: feeOf(12000),
      reportable: false,
    });
    expect(find(amy.id, 'FR', 'GBP')).toMatchObject({
      bookings: 1,
      nights: 1,
      paid: 12000,
      fees: feeOf(12000, 'GBP'),
      reportable: false,
    });
    expect(find(ben.id, 'FR', 'EUR')).toMatchObject({
      bookings: 1,
      nights: 1,
      paid: 200000,
      fees: feeOf(200000),
      reportable: true,
    });
    expect(find(cat.id, 'JP', 'JPY')).toMatchObject({
      bookings: 1,
      nights: 1,
      paid: 320000,
      fees: feeOf(320000, 'JPY'),
      reportable: true,
    });
    expect(find(dan.id, 'CH', 'CHF')).toMatchObject({
      bookings: 1,
      nights: 1,
      paid: 500000,
      fees: feeOf(500000, 'CHF'),
      reportable: false,
    });
    expect(find(eve.id, 'FR', 'EUR')).toMatchObject({
      bookings: 30,
      nights: 30,
      paid: 3000,
      fees: 30 * feeOf(100),
      reportable: true,
    });

    // This year's report has this year's stay only.
    const now = Number(day(0).slice(0, 4));
    const current = (await api.list(`/admin/hosts-report?year=${now}`, admin.token)).filter(each =>
      ours.includes(String(each.hostId)),
    );
    expect(current).toEqual([
      expect.objectContaining({
        hostId: amy.id,
        country: 'FR',
        currency: 'EUR',
        bookings: 1,
        nights: 1,
        paid: 12000,
        fees: feeOf(12000),
        reportable: false,
      }),
    ]);
  }, 240000);

  it('answers 403 to anyone but an administrator, and 400 to a year that makes no sense', async () => {
    const hal = await api.host('hal@hosts-report.test');
    const tom = await api.traveller('tom2@hosts-report.test');
    for (const token of [hal.token, tom.token])
      expect((await api.call('GET', `/admin/hosts-report?year=${Y}`, token)).status).toBe(403);
    for (const year of ['26', 'abcd', '20270'])
      expect((await api.call('GET', `/admin/hosts-report?year=${year}`, admin.token)).status).toBe(400);
    expect(await api.list(`/admin/hosts-report?year=${Y + 1}`, admin.token)).toEqual([]);
  }, 60000);
});
