import { client, Client, database, day, eventually, Json, kill, Running, sleep, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/** Request 46: a receipt for every payment and refund, numbered with no gap and no repeat. */
const db = database('receipts');
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

const numbers = (receipts: Json[]) => receipts.map(each => Number(each.number)).sort((a, b) => a - b);

describe('receipts', () => {
  it('gives each payment and refund that succeeds a receipt, numbered in order, listed to its traveller', async () => {
    const hal = await api.host('hal@receipts.test');
    const tom = await api.traveller('tom@receipts.test');
    const una = await api.traveller('una@receipts.test');
    const id = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    const before = Date.now();
    await payBooking(api, provider, tom.token, bookingId);
    await api.create(`/bookings/${bookingId}/refunds`, hal.token, { amount: 5000, reason: 'A broken shower' });

    const receipts = await eventually(
      () => api.list('/receipts/mine', tom.token),
      found => found.length >= 2,
    );
    expect(receipts.map(each => [each.kind, each.bookingId])).toEqual([
      ['refund', bookingId],
      ['payment', bookingId],
    ]);
    expect(receipts[1].amount).toBe(22000);
    expect(Math.abs(Number(receipts[0].amount))).toBe(5000);
    expect(Number(receipts[0].number)).toBe(Number(receipts[1].number) + 1);
    for (const receipt of receipts) {
      expect(Date.parse(String(receipt.at))).toBeGreaterThanOrEqual(before - 5000);
      expect(Date.parse(String(receipt.at))).toBeLessThanOrEqual(Date.now() + 5000);
    }
    expect(await api.list('/receipts/mine', una.token)).toEqual([]);
  }, 60000);

  it('numbers from 1 with no gap and no repeat many payments succeeding at once, across two servers and a crash', async () => {
    const store = database('receipts-burst');
    const environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
    let first = await start(store.path, environment);
    const second = await start(store.path, environment);
    provider.attach(first.port);
    try {
      const one = client(first.port);
      const hal = await one.host('hal2@receipts.test');
      const id = await one.listing(hal.token);
      const travellers = await Promise.all(
        Array.from({ length: 8 }, (_, n) => one.traveller(`t${n}@burst.receipts.test`)),
      );
      const bookings = await Promise.all(
        travellers.map(async (each, n) =>
          one.book(each.token, await one.quote(each.token, id, day(10 + 2 * n), day(11 + 2 * n))),
        ),
      );
      for (const [n, bookingId] of bookings.entries())
        await one.done('POST', `/bookings/${bookingId}/pay`, travellers[n].token);
      const payments = bookings.map(bookingId => provider.paymentFor(bookingId)[0]);

      provider.state.holding = true;
      const succeeded = payments.map(payment => provider.pay(payment.id)!);
      const burst = provider.burst([first.port, second.port]);
      await sleep(30);
      await kill(first);
      first = await start(store.path, environment);
      provider.attach(first.port);
      await burst;
      for (const event of succeeded) provider.resend(event);
      await provider.settled();

      const again = client(first.port);
      const tokens = await Promise.all(travellers.map(each => again.login(each.email)));
      const all = async () => (await Promise.all(tokens.map(token => again.list('/receipts/mine', token)))).flat();
      await eventually(all, found => found.length >= 8, 30000);
      await sleep(2000);
      const receipts = await all();
      expect(numbers(receipts)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(receipts.map(each => each.bookingId).sort()).toEqual([...bookings].sort());
    } finally {
      await stop(first);
      await stop(second);
      store.remove();
      provider.attach(server.port);
    }
  }, 180000);
});
