import { client, Client, database, day, eventually, Json, Running, sleep, start, stop } from './openstay';
import { enabledAccount, feeOf, openAccount, paymentProvider, payBooking } from './provider';

/** Request 39: a disputed payment holds its payout, and a lost dispute shows on the statement. */
const db = database('disputes');
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

const payoutsFor = (bookingId: string) => [...provider.payouts.values()].filter(each => each.reference === bookingId);
const paymentReads = (bookingId: string, token: string, expected: (payment: Json) => boolean) =>
  eventually(async () => (await api.read(`/bookings/${bookingId}`, token)).payment as Json, expected);
const statementLines = async (token: string) =>
  (await api.read(`/hosts/me/statement?from=${day(0)}&to=${day(1)}`, token)).lines as Json[];
/** One night from today, at 100 € and 20 € of cleaning: 12 000 paid, 12 000 less the fee for the host. */
const DUE = 12000 - feeOf(12000);

/** A host whose account is opened but not enabled, and a booking of tonight on their listing, paid. */
async function paidTonight(name: string) {
  const host = await api.host(`${name}@disputes.test`);
  const tom = await api.traveller(`tom-${name}@disputes.test`);
  await openAccount(api, provider, host.token);
  const id = await api.listing(host.token);
  const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
  const payment = await payBooking(api, provider, tom.token, bookingId);
  return { host, tom, bookingId, payment };
}

describe('disputes', () => {
  it('holds the payout while a dispute is open, and makes it once the dispute is won', async () => {
    const { host, tom, bookingId, payment } = await paidTonight('hal');
    expect(await paymentReads(bookingId, tom.token, () => true)).toMatchObject({ status: 'paid', disputed: false });
    const opened = provider.dispute(payment.id);
    expect(await paymentReads(bookingId, tom.token, each => each.disputed === true)).toMatchObject({ disputed: true });

    await enabledAccount(api, provider, host.token);
    await sleep(3000);
    expect(payoutsFor(bookingId)).toEqual([]);

    provider.closeDispute(opened, 'won');
    expect(await paymentReads(bookingId, host.token, each => each.disputed === false)).toMatchObject({
      disputed: false,
      dispute: { outcome: 'won' },
    });
    const payouts = await eventually(
      () => api.list('/hosts/me/payouts', host.token),
      found => found.length > 0,
      20000,
    );
    expect(payouts).toEqual([expect.objectContaining({ bookingIds: [bookingId], amount: DUE })]);
  }, 90000);

  it('pays nothing more once a dispute is lost, and shows the dispute on the statement', async () => {
    const { host, tom, bookingId, payment } = await paidTonight('ian');
    const opened = provider.dispute(payment.id);
    await paymentReads(bookingId, tom.token, each => each.disputed === true);
    await enabledAccount(api, provider, host.token);
    provider.closeDispute(opened, 'lost');
    expect(await paymentReads(bookingId, tom.token, each => each.disputed === false)).toMatchObject({
      disputed: false,
      dispute: { outcome: 'lost' },
    });

    await sleep(3000);
    expect(payoutsFor(bookingId)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', host.token)).toEqual([]);
    expect(await statementLines(host.token)).toContainEqual(
      expect.objectContaining({ type: 'dispute', bookingId, amount: -12000 }),
    );
  }, 90000);

  it('changes no payout already made, and still shows a lost dispute on the statement', async () => {
    const { host, tom, bookingId, payment } = await paidTonight('jon');
    await enabledAccount(api, provider, host.token);
    const paid = await eventually(
      () => api.list('/hosts/me/payouts', host.token),
      found => found.some(each => each.status === 'paid'),
      20000,
    );
    const opened = provider.dispute(payment.id);
    await paymentReads(bookingId, tom.token, each => each.disputed === true);
    provider.closeDispute(opened, 'lost');
    await paymentReads(bookingId, tom.token, each => each.disputed === false);

    await sleep(2000);
    expect(await api.list('/hosts/me/payouts', host.token)).toEqual(paid);
    expect(payoutsFor(bookingId)).toHaveLength(1);
    expect(await statementLines(host.token)).toContainEqual(
      expect.objectContaining({ type: 'dispute', bookingId, amount: -12000 }),
    );
  }, 90000);
});
