import { client, Client, database, day, eventually, Json, kill, Running, sleep, start, stop } from './openstay';
import { feeOf, paymentProvider } from './provider';

/** Request 29: webhooks late, twice or out of order, and money still moves once. Invariants 4 and 12. */
const db = database('webhooks');
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

const paymentOf = async (bookingId: string, token: string) =>
  (await api.read(`/bookings/${bookingId}`, token)).payment as Json | null;
const ok = (status: number) => status >= 200 && status < 300;
const paid = (bookingId: string, token: string) =>
  eventually(
    () => paymentOf(bookingId, token),
    payment => payment?.status === 'paid',
  );

/** A booking of one night from `checkIn` days ahead, with its payment asked for, and the provider's payment. */
async function asked(email: string, checkIn: number) {
  const hal = await api.host(`hal-${email}`);
  const tom = await api.traveller(`tom-${email}`);
  const id = await api.listing(hal.token);
  const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(checkIn), day(checkIn + 1)));
  await api.done('POST', `/bookings/${bookingId}/pay`, tom.token);
  return { tom, bookingId, payment: provider.paymentFor(bookingId)[0] };
}

describe('webhooks, as they come', () => {
  it('changes things once for a webhook delivered twice, and once for one delivered again after a crash', async () => {
    const { tom, bookingId, payment } = await asked('twice@webhooks.test', 10);
    provider.state.twice = true;
    provider.pay(payment.id);
    await provider.settled();
    provider.state.twice = false;
    expect(await paid(bookingId, tom.token)).toMatchObject({ status: 'paid', fee: feeOf(12000) });

    const second = await asked('crash@webhooks.test', 20);
    provider.state.holding = true;
    const event = provider.pay(second.payment.id)!;
    provider.flush();
    await sleep(20);
    await kill(server);
    server = await start(db.path, environment);
    provider.attach(server.port);
    api = client(server.port);
    provider.resend(event);
    await provider.settled();
    const token = await api.login(second.tom.email);
    expect(await paid(second.bookingId, token)).toMatchObject({ status: 'paid', amount: 12000, fee: feeOf(12000) });
  }, 120000);

  it('keeps a payment paid when an older requires_action, or a failure, arrives after its success', async () => {
    const { tom, bookingId, payment } = await asked('order@webhooks.test', 30);
    provider.state.holding = true;
    provider.requireAction(payment.id);
    await sleep(1100);
    provider.pay(payment.id);
    provider.flush(held => [...held].reverse());
    await provider.settled();
    expect(await paid(bookingId, tom.token)).toMatchObject({ status: 'paid', fee: feeOf(12000) });

    provider.fail(payment.id);
    await provider.settled();
    await sleep(500);
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'paid', fee: feeOf(12000) });
  }, 60000);

  it('answers 2xx to a valid webhook about something unknown, and 400 to a forged one, which changes nothing', async () => {
    const elsewhere = { id: 'pay_elsewhere', amount: 5000, reference: 'another-platform', status: 'succeeded' };
    expect(ok(await provider.signed('payment.succeeded', { ...elsewhere, fee: feeOf(5000), refunded: 0 }))).toBe(true);
    expect(
      ok(await provider.signed('refund.succeeded', {
          id: 're_elsewhere',
          payment: 'pay_elsewhere',
          amount: 100,
          reference: 'another-platform',
          status: 'succeeded',
        })),
    ).toBe(true);

    const { tom, bookingId, payment } = await asked('forged@webhooks.test', 40);
    const data = { ...payment, status: 'succeeded', fee: feeOf(payment.amount) };
    expect(await provider.forge('payment.succeeded', data)).toBe(400);
    const now = Math.floor(Date.now() / 1000);
    expect(await provider.forge('payment.succeeded', data, `t=${now},v1=${'0'.repeat(64)}`)).toBe(400);
    expect(await provider.signed('payment.succeeded', data, 600)).toBe(400);
    await sleep(1000);
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'pending', fee: 0 });
  }, 60000);
});
