import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { feeOf, paymentProvider } from './provider';

/** Request 27: a booking paid through the provider, paid when the provider says so. Invariant 2. */
const db = database('pay');
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

describe('paying a booking', () => {
  it('owes the total, asks the provider for one payment of it, and is paid only when the provider says so', async () => {
    const hal = await api.host('hal@pay.test');
    const tom = await api.traveller('tom@pay.test');
    const id = await api.listing(hal.token, { nightlyPrice: 10000, cleaningFee: 2000 });
    await api.done('PUT', `/listings/${id}/tourist-tax`, hal.token, { perGuestPerNight: 100 });
    // Two nights, one guest: 20 000 + 2 000 + 200 of tax.
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(20), day(22)));
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'due', amount: 22200, fee: 0 });

    const first = await pay(bookingId, tom.token);
    const second = await pay(bookingId, tom.token);
    expect(second.paymentId).toBe(first.paymentId);
    const payments = provider.paymentFor(bookingId);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(22200);
    expect(first.payUrl).toBe(`https://provider.test/pay/${payments[0].id}`);
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'pending', amount: 22200, fee: 0 });

    provider.pay(payments[0].id);
    const paid = await eventually(
      () => paymentOf(bookingId, tom.token),
      payment => payment?.status === 'paid',
    );
    expect(paid).toMatchObject({ status: 'paid', amount: 22200, fee: feeOf(22200) });
    expect(await paymentOf(bookingId, hal.token)).toMatchObject({ status: 'paid', fee: feeOf(22200) });
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).total).toBe(22200);
  }, 60000);

  it('makes the booking due again when the payment fails, and asks for a new payment then', async () => {
    const hal = await api.host('hal2@pay.test');
    const tom = await api.traveller('tom2@pay.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(11)));
    const first = await pay(bookingId, tom.token);
    const [failed] = provider.paymentFor(bookingId);
    provider.fail(failed.id);
    expect(
      await eventually(
        () => paymentOf(bookingId, tom.token),
        payment => payment?.status === 'due',
      ),
    ).toMatchObject({ status: 'due', amount: 12000, fee: 0 });

    const again = await pay(bookingId, tom.token);
    expect(again.paymentId).not.toBe(first.paymentId);
    const retry = provider.paymentFor(bookingId).filter(each => each.id !== failed.id);
    expect(retry.map(each => each.amount)).toEqual([12000]);
    expect(again.payUrl).toBe(`https://provider.test/pay/${retry[0].id}`);
    provider.pay(retry[0].id);
    expect(
      await eventually(
        () => paymentOf(bookingId, tom.token),
        payment => payment?.status === 'paid',
      ),
    ).toMatchObject({ status: 'paid', amount: 12000, fee: feeOf(12000) });
  }, 60000);

  it('owes nothing while a request waits, owes the total once accepted, and lets only its traveller pay', async () => {
    const hal = await api.host('hal3@pay.test');
    const tom = await api.traveller('tom3@pay.test');
    const una = await api.traveller('una3@pay.test');
    const id = await api.listing(hal.token);
    await api.done('PUT', `/listings/${id}/booking-mode`, hal.token, { mode: 'request' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(32)));
    expect(await paymentOf(bookingId, tom.token)).toBeNull();

    await api.done('POST', `/bookings/${bookingId}/accept`, hal.token);
    expect(await paymentOf(bookingId, tom.token)).toMatchObject({ status: 'due', amount: 22000, fee: 0 });
    expect(await paymentOf(bookingId, hal.token)).toMatchObject({ status: 'due', amount: 22000 });
    expect(await api.refused('POST', `/bookings/${bookingId}/pay`, hal.token)).toBe(true);
    expect(await api.refused('POST', `/bookings/${bookingId}/pay`, una.token)).toBe(true);
    expect(provider.paymentFor(bookingId)).toEqual([]);
    expect(await api.hidden(`/bookings/${bookingId}`, una.token)).toBe(true);
  }, 60000);
});
