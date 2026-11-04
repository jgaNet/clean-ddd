import { adminEnvironment, client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { cardFeeOf, enabledAccount, feeOf, paymentProvider, payBooking } from './provider';

/**
 * Request 90: card fees passed on where the law allows. In a country an administrator lists, the
 * provider's fee is the traveller's: a line of the quote, paid, never refunded, and the host is paid
 * their lines in full. Everywhere else, nothing changes.
 */
const db = database('card-fees');
const provider = paymentProvider();
let server: Running;
let api: Client;
let ada: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, {
    ...(await provider.environment()),
    ...adminEnvironment('ada@card-fees.test'),
    JOBS_INTERVAL_SECONDS: '1',
  });
  provider.attach(server.port);
  api = client(server.port);
  ada = await api.admin('ada@card-fees.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

type Line = { label: string; for: string; amount: number };
const lines = (read: Json) => read.lines as Line[];
const cardFeeLines = (read: Json) => lines(read).filter(line => line.label === 'cardFee');
const sum = (each: { amount: number }[]) => each.reduce((total, line) => total + line.amount, 0);
const passThrough = (countries: string[]) => api.done('PUT', '/admin/fee-pass-through', ada.token, { countries });
/**
 * A listing in `country`, published, at 80 and 19 of cleaning and 1 of tourist tax a guest a night: one
 * night for one guest is 10,000 before any card fee, whose line is then 167 (the request's example).
 */
async function listing(token: string, country: string, fields: Json = {}) {
  const id = await api.create('/listings', token, {
    title: 'A room with a view',
    city: 'Lyon',
    capacity: 2,
    nightlyPrice: 8000,
    cleaningFee: 1900,
    cancellationPolicy: 'flexible',
    country,
    ...fields,
  });
  await api.done('POST', `/listings/${id}/publish`, token);
  await api.done('PUT', `/listings/${id}/tourist-tax`, token, { perGuestPerNight: 100 });
  return id;
}
const LINE = cardFeeOf(10000);
const quoted = async (token: string, listingId: string, from: number, to: number) => {
  const id = await api.quote(token, listingId, day(from), day(to));
  return { id, read: await api.read(`/quotes/${id}`, token) };
};

describe('card fees passed on where the law allows', () => {
  it('lets only an administrator set and read the countries, replaces them, refuses unknown codes, and audits each setting', async () => {
    const hal = await api.host('hal@card-fees.test');
    const path = '/admin/fee-pass-through';
    expect(await api.read(path, ada.token)).toMatchObject({ countries: [] });
    await passThrough(['US', 'GB']);
    expect(await api.read(path, ada.token)).toMatchObject({ countries: ['GB', 'US'] });
    for (const countries of [['XX'], ['GB', 'XX'], ['FRA']])
      expect(await api.refused('PUT', path, ada.token, { countries })).toBe(true);
    expect(await api.read(path, ada.token)).toMatchObject({ countries: ['GB', 'US'] });
    await passThrough(['DE']);
    expect(await api.read(path, ada.token)).toMatchObject({ countries: ['DE'] });

    expect(await api.refused('PUT', path, hal.token, { countries: ['FR'] })).toBe(true);
    expect((await api.call('GET', path, hal.token)).status).toBe(403);
    await passThrough([]);
    expect(await api.read(path, ada.token)).toMatchObject({ countries: [] });

    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=fee-pass-through', ada.token),
      found => found.length >= 3,
    );
    const entry = expect.objectContaining({
      adminId: ada.id,
      action: 'fee-pass-through-set',
      subjectId: 'fee-pass-through',
      note: null,
    });
    expect(entries).toEqual([entry, entry, entry]);
  }, 60000);

  it('makes the fee a line of the quote, paid by the traveller, with the host paid their lines and the tax in full', async () => {
    const hal = await api.host('hal2@card-fees.test');
    const tom = await api.traveller('tom2@card-fees.test');
    await enabledAccount(api, provider, hal.token);
    await passThrough(['GB']);
    const british = await listing(hal.token, 'GB');
    const french = await listing(hal.token, 'FR');

    const asked = provider.feeQueries.length;
    const withLine = await quoted(tom.token, british, 0, 1);
    expect(provider.feeQueries.length).toBeGreaterThan(asked);
    expect(LINE).toBe(167);
    expect(cardFeeLines(withLine.read)).toEqual([
      expect.objectContaining({ label: 'cardFee', for: 'external', amount: LINE }),
    ]);
    expect(withLine.read.total).toBe(10000 + LINE);
    expect(sum(lines(withLine.read))).toBe(withLine.read.total);
    const without = await quoted(tom.token, french, 0, 1);
    expect(cardFeeLines(without.read)).toEqual([]);
    expect(without.read.total).toBe(10000);
    // In yen, the line is the yen schedule's.
    const yen = await listing(hal.token, 'GB', { currency: 'JPY', nightlyPrice: 9800, cleaningFee: 100 });
    const inYen = await quoted(tom.token, yen, 0, 1);
    expect(cardFeeLines(inYen.read)).toEqual([expect.objectContaining({ amount: cardFeeOf(10000, 'JPY') })]);
    expect(inYen.read.total).toBe(10000 + cardFeeOf(10000, 'JPY'));

    const passed = await api.book(tom.token, withLine.id);
    const kept = await api.book(tom.token, without.id);
    expect(cardFeeLines(await api.read(`/bookings/${passed}`, tom.token))).toEqual([
      expect.objectContaining({ for: 'external', amount: LINE }),
    ]);
    expect(await api.read(`/bookings/${passed}`, hal.token)).toMatchObject({ total: 10000 + LINE });
    const payment = await payBooking(api, provider, tom.token, passed);
    expect(payment).toMatchObject({ amount: 10000 + LINE, fee: LINE });
    expect((await api.read(`/bookings/${passed}`, tom.token)).payment).toMatchObject({
      status: 'paid',
      amount: 10000 + LINE,
      fee: LINE,
    });
    await payBooking(api, provider, tom.token, kept);

    // The host receives the other lines in full where the line is; elsewhere, the fee is still theirs.
    const payouts = await eventually(
      () => api.list('/hosts/me/payouts', hal.token),
      found => found.length >= 2 && found.every(each => each.status === 'paid'),
      20000,
    );
    expect(payouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookingIds: [passed], amount: 10000 }),
        expect.objectContaining({ bookingIds: [kept], amount: 10000 - feeOf(10000) }),
      ]),
    );
    expect([...provider.payouts.values()].find(each => each.reference === passed)).toMatchObject({ amount: 10000 });

    const receipts = await eventually(
      () => api.list('/receipts/mine', tom.token),
      found => found.length >= 2,
    );
    expect(receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'payment', bookingId: passed, amount: 10000 + LINE, cardFee: LINE }),
        expect.objectContaining({ kind: 'payment', bookingId: kept, amount: 10000, cardFee: 0 }),
      ]),
    );

    const statement = await eventually(
      () => api.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}`, hal.token),
      found => (found.lines as Json[]).length >= 6,
    );
    expect(statement.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'charge', bookingId: passed, amount: 10000 + LINE }),
        expect.objectContaining({ type: 'fee', bookingId: passed, amount: -LINE }),
        expect.objectContaining({ type: 'payout', bookingId: passed, amount: -10000 }),
      ]),
    );

    const month = new Date().toISOString().slice(0, 7);
    expect(
      await eventually(
        () => api.read(`/admin/payment-costs?month=${month}`, ada.token),
        found => (found.provider as Json)?.payments === 2,
      ),
    ).toMatchObject({
      provider: {
        payments: 2,
        amount: 10000 + LINE + 10000,
        fees: LINE + feeOf(10000),
        boreByTraveller: LINE,
        boreByHost: feeOf(10000),
        boreByOpenStay: 0,
      },
    });
  }, 120000);

  it('keeps the line a quote was given with, or its absence, whatever the list says afterwards', async () => {
    const hal = await api.host('hal3@card-fees.test');
    const tom = await api.traveller('tom3@card-fees.test');
    await passThrough([]);
    const id = await listing(hal.token, 'GB');
    const before = await quoted(tom.token, id, 10, 11);
    expect(cardFeeLines(before.read)).toEqual([]);

    await passThrough(['GB', 'IE']);
    expect(cardFeeLines(await api.read(`/quotes/${before.id}`, tom.token))).toEqual([]);
    const during = await quoted(tom.token, id, 20, 21);
    expect(cardFeeLines(during.read)).toEqual([expect.objectContaining({ amount: LINE })]);
    const bookedBefore = await api.book(tom.token, before.id);
    expect(await api.read(`/bookings/${bookedBefore}`, tom.token)).toMatchObject({ total: 10000 });
    expect(cardFeeLines(await api.read(`/bookings/${bookedBefore}`, tom.token))).toEqual([]);

    await passThrough(['IE']);
    expect(await api.read(`/quotes/${during.id}`, tom.token)).toMatchObject({ total: 10000 + LINE });
    const bookedDuring = await api.book(tom.token, during.id);
    expect(await api.read(`/bookings/${bookedDuring}`, tom.token)).toMatchObject({ total: 10000 + LINE });
    expect(cardFeeLines(await api.read(`/bookings/${bookedDuring}`, tom.token))).toHaveLength(1);
    const [conditions] = await api.list(`/bookings/${bookedDuring}/conditions`, tom.token);
    expect(conditions).toMatchObject({ total: 10000 + LINE });
    expect(cardFeeLines(conditions)).toEqual([expect.objectContaining({ amount: LINE })]);
    const after = await quoted(tom.token, id, 30, 31);
    expect(cardFeeLines(after.read)).toEqual([]);
    expect(after.read.total).toBe(10000);
  }, 60000);

  it('never refunds the line: a cancellation and every refund together leave it out', async () => {
    const hal = await api.host('hal4@card-fees.test');
    const tom = await api.traveller('tom4@card-fees.test');
    await passThrough(['GB']);
    const id = await listing(hal.token, 'GB');
    const book = async (from: number) => {
      const bookingId = await api.book(tom.token, (await quoted(tom.token, id, from, from + 1)).id);
      const payment = await payBooking(api, provider, tom.token, bookingId);
      expect(payment.amount).toBe(10000 + LINE);
      return { bookingId, payment };
    };
    const refundsOf = (paymentId: string) =>
      eventually(
        async () => [...provider.refunds.values()].filter(each => each.payment === paymentId),
        found => found.length > 0,
      );

    // Cancelled by the traveller, under a flexible policy: everything is refundable but the line.
    const byTraveller = await book(10);
    await api.done('POST', `/bookings/${byTraveller.bookingId}/cancel`, tom.token);
    expect((await api.read(`/bookings/${byTraveller.bookingId}`, tom.token)).cancellation).toMatchObject({
      refundable: 10000,
    });
    expect((await refundsOf(byTraveller.payment.id)).map(each => each.amount)).toEqual([10000]);

    // Cancelled by the host: everything refundable, still but the line.
    const byHost = await book(20);
    await api.done('POST', `/bookings/${byHost.bookingId}/cancel`, hal.token);
    expect((await api.read(`/bookings/${byHost.bookingId}`, tom.token)).cancellation).toMatchObject({
      by: 'host',
      refundable: 10000,
    });
    expect((await refundsOf(byHost.payment.id)).map(each => each.amount)).toEqual([10000]);

    // The host's own refunds: never beyond what was paid less the line.
    const refunded = await book(30);
    const path = `/bookings/${refunded.bookingId}/refunds`;
    expect(await api.refused('POST', path, hal.token, { amount: 10001, reason: 'A broken shower' })).toBe(true);
    await api.create(path, hal.token, { amount: 9000, reason: 'A broken shower' });
    expect(await api.refused('POST', path, hal.token, { amount: 1001, reason: 'A cold radiator' })).toBe(true);
    await api.create(path, hal.token, { amount: 1000, reason: 'A cold radiator' });
    expect(await api.refused('POST', path, hal.token, { amount: 1, reason: 'A noisy street' })).toBe(true);
    const settled = await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === refunded.payment.id),
      found => found.length >= 2 && found.every(each => each.status === 'succeeded'),
    );
    expect(settled.reduce((total, each) => total + each.amount, 0)).toBe(10000);
  }, 120000);

  it("refuses a quote in a listed country while the provider's schedule does not answer, and leaves the others alone", async () => {
    const hal = await api.host('hal5@card-fees.test');
    const tom = await api.traveller('tom5@card-fees.test');
    await passThrough(['GB']);
    const british = await listing(hal.token, 'GB');
    const french = await listing(hal.token, 'FR');
    const body = (listingId: string) => ({ listingId, checkIn: day(40), checkOut: day(41), guests: 1 });

    provider.state.feesDown = true;
    try {
      expect(await api.refused('POST', '/quotes', tom.token, body(british))).toBe(true);
      expect(
        cardFeeLines(await api.read(`/quotes/${await api.create('/quotes', tom.token, body(french))}`, tom.token)),
      ).toEqual([]);
    } finally {
      provider.state.feesDown = false;
    }
    const again = await api.read(`/quotes/${await api.create('/quotes', tom.token, body(british))}`, tom.token);
    expect(cardFeeLines(again)).toEqual([expect.objectContaining({ amount: LINE })]);

    // A server with no provider at all.
    const alone = database('card-fees-alone');
    const other = await start(alone.path, adminEnvironment('ada@card-fees.test'));
    try {
      const offline = client(other.port);
      const admin = await offline.admin('ada@card-fees.test');
      const host = await offline.host('hal@card-fees.test');
      const traveller = await offline.traveller('tom@card-fees.test');
      await offline.done('PUT', '/admin/fee-pass-through', admin.token, { countries: ['GB'] });
      const create = async (country: string) => {
        const id = await offline.create('/listings', host.token, {
          title: 'A room with a view',
          city: 'Lyon',
          capacity: 2,
          nightlyPrice: 8000,
          cleaningFee: 1900,
          cancellationPolicy: 'flexible',
          country,
        });
        await offline.done('POST', `/listings/${id}/publish`, host.token);
        return id;
      };
      const there = await create('GB');
      const here = await create('FR');
      expect(await offline.refused('POST', '/quotes', traveller.token, body(there))).toBe(true);
      const quoteId = await offline.create('/quotes', traveller.token, body(here));
      expect(await offline.read(`/quotes/${quoteId}`, traveller.token)).toMatchObject({ total: 9900 });
    } finally {
      await stop(other);
      alone.remove();
    }
  }, 120000);
});
