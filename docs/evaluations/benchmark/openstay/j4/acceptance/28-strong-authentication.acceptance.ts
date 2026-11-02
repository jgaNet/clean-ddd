import { client, Client, database, day, eventually, Json, Running, sleep, start, stop } from './openstay';
import { feeOf, paymentProvider } from './provider';

/** Request 28: a payment the provider holds for the traveller's action. */
const db = database('authentication');
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

const paymentOf = async (bookingId: string, token: string) =>
  (await api.read(`/bookings/${bookingId}`, token)).payment as Json | null;
const pay = async (bookingId: string, token: string) =>
  (await api.done('POST', `/bookings/${bookingId}/pay`, token)) as Json;
const reads = (bookingId: string, token: string, status: string) =>
  eventually(
    () => paymentOf(bookingId, token),
    payment => payment?.status === status,
  );

describe('strong authentication', () => {
  it('reads requires_action with the actionUrl, gives the same payment when asked again, then reads paid', async () => {
    const hal = await api.host('hal@authentication.test');
    const tom = await api.traveller('tom@authentication.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    const first = await pay(bookingId, tom.token);
    const [payment] = provider.paymentFor(bookingId);
    const actionUrl = `https://provider.test/authenticate/${payment.id}`;

    provider.requireAction(payment.id);
    expect(await reads(bookingId, tom.token, 'requires_action')).toMatchObject({
      status: 'requires_action',
      actionUrl,
    });
    const again = await pay(bookingId, tom.token);
    expect(again).toMatchObject({ paymentId: first.paymentId, payUrl: first.payUrl, actionUrl });
    expect(provider.paymentFor(bookingId)).toHaveLength(1);

    await sleep(2000);
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'requires_action', actionUrl });
    provider.pay(payment.id);
    expect(await reads(bookingId, tom.token, 'paid')).toMatchObject({
      status: 'paid',
      amount: 22000,
      fee: feeOf(22000),
    });
    expect(provider.paymentFor(bookingId)).toHaveLength(1);
  }, 60000);

  it('makes the booking due again when the payment fails after the action was asked, and lets it be paid anew', async () => {
    const hal = await api.host('hal2@authentication.test');
    const tom = await api.traveller('tom2@authentication.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    await pay(bookingId, tom.token);
    const [payment] = provider.paymentFor(bookingId);
    provider.requireAction(payment.id);
    await reads(bookingId, tom.token, 'requires_action');

    provider.fail(payment.id);
    expect(await reads(bookingId, tom.token, 'due')).toMatchObject({ status: 'due', amount: 12000 });
    await pay(bookingId, tom.token);
    const retry = provider.paymentFor(bookingId).filter(each => each.id !== payment.id);
    expect(retry).toHaveLength(1);
    provider.pay(retry[0].id);
    expect(await reads(bookingId, tom.token, 'paid')).toMatchObject({ status: 'paid', fee: feeOf(12000) });
  }, 60000);
});
