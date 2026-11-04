import { adminEnvironment, client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 88: indicative prices. The rates an administrator sets, and a search or a quote shown in
 * another currency, marked indicative, while the stay is booked and paid in the listing's own.
 */
const db = database('indicative-prices');
const provider = paymentProvider();
let server: Running;
let api: Client;
let ada: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, {
    ...(await provider.environment()),
    ...adminEnvironment('ada@indicative-prices.test'),
    JOBS_INTERVAL_SECONDS: '1',
  });
  provider.attach(server.port);
  api = client(server.port);
  ada = await api.admin('ada@indicative-prices.test');
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
async function listing(token: string, fields: Json = {}) {
  const id = await api.create('/listings', token, description(fields));
  await api.done('POST', `/listings/${id}/publish`, token);
  return id;
}
const setRates = (rates: Json, token = ada.token) => api.done('PUT', '/admin/rates', token, { base: 'EUR', rates });
/** The rates as anyone reads them: `base` is always EUR, and `rates` holds the currencies set, no other. */
const rates = async (token?: string) => {
  const read = await api.read('/rates', token);
  expect(read).toMatchObject({ base: 'EUR' });
  return read.rates;
};
const indicativeOf = (read: Json) => read.indicative as Json | null | undefined;
/** Absent: the request says so; a tree that writes it `null` is read the same. */
const absent = (read: Json) => indicativeOf(read) === undefined || indicativeOf(read) === null;

describe('indicative prices', () => {
  it('has no rate until an administrator sets them, replaces them all at each setting, and audits each one', async () => {
    const hal = await api.host('hal@indicative-prices.test');
    expect(await rates()).toEqual({});

    await setRates({ GBP: 0.85, JPY: 160 });
    expect(await rates()).toEqual({ GBP: 0.85, JPY: 160 });
    expect(await rates(hal.token)).toEqual({ GBP: 0.85, JPY: 160 });
    await setRates({ CHF: 0.123456 });
    expect(await rates()).toEqual({ CHF: 0.123456 });

    for (const body of [
      { base: 'USD', rates: { GBP: 0.85 } },
      { base: 'EUR', rates: { USD: 1.1 } },
      { base: 'EUR', rates: { EUR: 1 } },
      { base: 'EUR', rates: { GBP: 0 } },
      { base: 'EUR', rates: { GBP: -0.85 } },
      { base: 'EUR', rates: { GBP: 0.1234567 } },
    ])
      expect(await api.refused('PUT', '/admin/rates', ada.token, body)).toBe(true);
    expect((await api.call('PUT', '/admin/rates', hal.token, { base: 'EUR', rates: { GBP: 0.9 } })).status).toBe(403);
    expect(await rates()).toEqual({ CHF: 0.123456 });

    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=rates', ada.token),
      found => found.length >= 2,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId: ada.id, action: 'rates-set', subjectId: 'rates', note: null }),
      expect.objectContaining({ adminId: ada.id, action: 'rates-set', subjectId: 'rates', note: null }),
    ]);
  }, 60000);

  it('shows each listing found in the display currency, at the rates, rounded half up once, the order unchanged', async () => {
    const hal = await api.host('hal2@indicative-prices.test');
    await setRates({ GBP: 0.85, CHF: 0.95, JPY: 160 });
    const euros = await listing(hal.token, { city: 'Bruges', nightlyPrice: 12345 });
    // 130 euro cents at 0.85 is exactly 110.5 pence: 111, rounded half up.
    const cheap = await listing(hal.token, { city: 'Bruges', nightlyPrice: 130 });
    const pounds = await listing(hal.token, { city: 'Bruges', currency: 'GBP', nightlyPrice: 10000 });
    const yen = await listing(hal.token, { city: 'Bruges', currency: 'JPY', nightlyPrice: 16000 });

    const search = async (query: string) => {
      const found = await api.list(`/listings?city=Bruges${query}`);
      return Object.fromEntries(found.map(each => [String(each.id), each])) as Record<string, Json>;
    };
    const order = async (query: string) => (await api.list(`/listings?city=Bruges${query}`)).map(each => each.id);
    const plain = await order('');
    for (const display of ['GBP', 'EUR', 'JPY', 'CHF']) expect(await order(`&display=${display}`)).toEqual(plain);

    const inPounds = await search('&display=GBP');
    expect(inPounds[euros]).toMatchObject({
      nightlyPrice: 12345,
      currency: 'EUR',
      indicative: { currency: 'GBP', nightlyPrice: 10493, rate: 0.85 },
    });
    expect(inPounds[cheap]).toMatchObject({ indicative: { currency: 'GBP', nightlyPrice: 111, rate: 0.85 } });
    expect(absent(inPounds[pounds])).toBe(true);
    // ¥16,000 is 100 euros, so 85 pounds; the rate is 0.85 ÷ 160, rounded to 6 decimals.
    expect(inPounds[yen]).toMatchObject({ indicative: { currency: 'GBP', nightlyPrice: 8500 } });
    expect(indicativeOf(inPounds[yen])?.rate).toBeCloseTo(0.0053125, 5);

    const inEuros = await search('&display=EUR');
    expect(absent(inEuros[euros])).toBe(true);
    expect(inEuros[yen]).toMatchObject({ indicative: { currency: 'EUR', nightlyPrice: 10000, rate: 0.00625 } });
    // 10,000 pence at 0.85 is 11,764.705… euro cents.
    expect(inEuros[pounds]).toMatchObject({ indicative: { currency: 'EUR', nightlyPrice: 11765 } });
    expect(indicativeOf(inEuros[pounds])?.rate).toBeCloseTo(1.176471, 6);

    const inYen = await search('&display=JPY');
    expect(inYen[euros]).toMatchObject({ indicative: { currency: 'JPY', nightlyPrice: 19752, rate: 160 } });
    expect(inYen[cheap]).toMatchObject({ indicative: { currency: 'JPY', nightlyPrice: 208 } });
    expect(absent(inYen[yen])).toBe(true);

    const plainly = await search('');
    for (const id of [euros, cheap, pounds, yen]) expect(absent(plainly[id])).toBe(true);

    // A currency with no rate gives no indicative price.
    await setRates({ GBP: 0.85 });
    const noYen = await search('&display=JPY');
    for (const id of [euros, pounds, yen]) expect(absent(noYen[id])).toBe(true);
    expect((await search('&display=GBP'))[euros]).toMatchObject({ indicative: { nightlyPrice: 10493 } });

    for (const display of ['USD', 'pounds'])
      expect((await api.call('GET', `/listings?city=Bruges&display=${display}`)).status).toBe(400);
  }, 60000);

  it("shows a quote's total in the display currency at the rates of the moment, while the stay is booked and paid as quoted", async () => {
    const hal = await api.host('hal3@indicative-prices.test');
    const tom = await api.traveller('tom3@indicative-prices.test');
    await setRates({ GBP: 0.85, JPY: 160 });
    const id = await listing(hal.token, { city: 'Ghent', nightlyPrice: 10000, cleaningFee: 2345 });
    const quoteId = await api.quote(tom.token, id, day(10), day(11));
    const plain = await api.read(`/quotes/${quoteId}`, tom.token);
    expect(plain).toMatchObject({ total: 12345 });
    expect(absent(plain)).toBe(true);

    const inPounds = await api.read(`/quotes/${quoteId}?display=GBP`, tom.token);
    expect(inPounds).toMatchObject({
      total: 12345,
      lines: plain.lines,
      indicative: { currency: 'GBP', total: 10493, rate: 0.85 },
    });
    expect(await api.read(`/quotes/${quoteId}?display=JPY`, tom.token)).toMatchObject({
      total: 12345,
      indicative: { currency: 'JPY', total: 19752, rate: 160 },
    });
    expect(absent(await api.read(`/quotes/${quoteId}?display=EUR`, tom.token))).toBe(true);
    expect(absent(await api.read(`/quotes/${quoteId}?display=CHF`, tom.token))).toBe(true);
    expect((await api.call('GET', `/quotes/${quoteId}?display=USD`, tom.token)).status).toBe(400);

    // The rates change: the indicative total follows them, the quote does not.
    await setRates({ GBP: 0.9, JPY: 160 });
    expect(await api.read(`/quotes/${quoteId}?display=GBP`, tom.token)).toMatchObject({
      total: 12345,
      lines: plain.lines,
      // 12,345 at 0.9 is 11,110.5 pence: 11,111.
      indicative: { currency: 'GBP', total: 11111, rate: 0.9 },
    });

    const bookingId = await api.book(tom.token, quoteId);
    expect(await api.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({ total: 12345, lines: plain.lines });
    const payment = await payBooking(api, provider, tom.token, bookingId);
    expect(payment).toMatchObject({ amount: 12345, currency: 'EUR' });
  }, 60000);
});
