import {
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  Running,
  sleep,
  start,
  stop,
} from '../../acceptance/openstay';
import { paymentProvider, payBooking, ProviderPayment } from '../../acceptance/provider';
import { deliverTo } from './faults';

/**
 * Chaos on the money, 5: receipts (request 46) numbered from 1 across all of OpenStay, with no gap and no
 * number given twice, while payments and refunds succeed at the same moment on two servers on one
 * database, the same success reaches both at once, and one of them is killed; donations paid among them
 * take no receipt and no number (request 80). Each case has a database of its own, so numbers start at 1.
 * One night at 100 € and 20 € of cleaning: 12 000.
 */
const provider = paymentProvider();
const databases: ReturnType<typeof database>[] = [];
const running: Running[] = [];
let environment: Record<string, string>;
beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
}, 60000);
afterAll(async () => {
  for (const each of running) await stop(each);
  await provider.close();
  for (const each of databases) each.remove();
}, 90000);

async function twoServers(name: string) {
  const db = database(name);
  databases.push(db);
  const first = await start(db.path, environment);
  const second = await start(db.path, environment);
  running.push(first, second);
  provider.attach(first.port);
  return { db, first, second };
}
const numbers = (receipts: Json[]) => receipts.map(each => Number(each.number)).sort((x, y) => x - y);
const upTo = (n: number) => Array.from({ length: n }, (_, k) => k + 1);

/** A host's listing and `count` travellers, each with a booking of one night, `from` days ahead and on. */
async function booked(api: Client, name: string, count: number, from: number) {
  const hal = await api.host(`hal@${name}.chaos.test`);
  const id = await api.listing(hal.token);
  const travellers = await Promise.all(
    Array.from({ length: count }, (_, n) => api.traveller(`t${n}@${name}.chaos.test`)),
  );
  const bookings: string[] = [];
  for (const [n, each] of travellers.entries())
    bookings.push(
      await api.book(each.token, await api.quote(each.token, id, day(from + 2 * n), day(from + 2 * n + 1))),
    );
  return { hal, travellers, bookings };
}

describe('chaos: receipts numbered under concurrency', () => {
  it('numbers payments and refunds succeeding at once on two servers, across a crash, from 1 without gap or repeat, and gives donations none', async () => {
    provider.state.settleAfterMs = undefined;
    const servers = await twoServers('chaos-receipts-burst');
    const { db, second } = servers;
    let first = servers.first;
    try {
      const one = client(first.port);
      const two = client(second.port);
      const { hal, travellers, bookings } = await booked(one, 'burst', 8, 10);
      // Three bookings paid before the storm: receipts 1 to 3, one after the other.
      for (const n of [0, 1, 2]) await payBooking(one, provider, travellers[n].token, bookings[n]);
      const paidBefore = bookings.slice(0, 3).map(bookingId => provider.paymentFor(bookingId)[0]);

      // Their host refunds each of them, at the same moment, on both servers.
      const halOnTwo = await two.login(hal.email);
      await Promise.all(
        [0, 1, 2].map(n =>
          (n % 2 ? two : one).done('POST', `/bookings/${bookings[n]}/refunds`, n % 2 ? halOnTwo : hal.token, {
            amount: 2000,
            reason: 'A broken shower',
          }),
        ),
      );
      const refunds = await eventually(
        async () => [...provider.refunds.values()].filter(each => paidBefore.some(paid => paid.id === each.payment)),
        found => found.length === 3,
      );
      expect(refunds).toHaveLength(3);
      // The five others asked to pay, and two donations given.
      for (const n of [3, 4, 5, 6, 7]) await one.done('POST', `/bookings/${bookings[n]}/pay`, travellers[n].token);
      const payments = bookings.slice(3).map(bookingId => provider.paymentFor(bookingId)[0]);
      const gifts: { id: string; payment: ProviderPayment }[] = [];
      for (const n of [0, 1]) {
        const id = await one.create('/donations', travellers[n].token, { amount: 1000 + n });
        const [payment] = await eventually(
          async () => provider.paymentFor(`donation:${id}`),
          found => found.length > 0,
        );
        gifts.push({ id, payment });
      }

      // Everything succeeds at the same moment, spread over both servers, and the first is killed.
      provider.state.holding = true;
      const from = provider.events.length;
      for (const payment of payments) provider.pay(payment.id);
      for (const gift of gifts) provider.pay(gift.payment.id);
      for (const refund of refunds) provider.settleRefund(refund.id);
      const said = provider.events.slice(from);
      expect(said).toHaveLength(10);
      const burst = provider.burst([first.port, second.port]);
      await sleep(30);
      await kill(first);
      first = await start(db.path, environment);
      running.push(first);
      provider.attach(first.port);
      await burst;
      for (const event of said) provider.resend(event);
      await provider.settled();

      const again = client(first.port);
      const tokens = await Promise.all(travellers.map(each => again.login(each.email)));
      const all = async () => (await Promise.all(tokens.map(token => again.list('/receipts/mine', token)))).flat();
      await eventually(all, found => found.length >= 11, 30000);
      await sleep(3000);
      const receipts = await all();
      // Request 46: "Receipt numbers run from 1 across all of OpenStay, with no gap and no number given twice".
      expect(numbers(receipts)).toEqual(upTo(11));
      const of = (kind: string) =>
        receipts
          .filter(each => each.kind === kind)
          .map(each => String(each.bookingId))
          .sort();
      expect(of('payment')).toEqual([...bookings].sort());
      expect(of('refund')).toEqual(bookings.slice(0, 3).sort());
      expect(receipts.filter(each => each.kind === 'refund').map(each => each.amount)).toEqual([2000, 2000, 2000]);
      // Request 80: a donation "takes no receipt and no receipt number".
      for (const [n, gift] of gifts.entries())
        expect(
          await eventually(
            () => again.read(`/donations/${gift.id}`, tokens[n]),
            read => read.status === 'paid',
          ),
        ).toMatchObject({ status: 'paid' });
      expect(await all()).toHaveLength(11);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 240000);

  it('gives one number to a success delivered to both servers at the same moment, twice', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const { first, second } = await twoServers('chaos-receipts-both');
      const one = client(first.port);
      const two = client(second.port);
      const { hal, travellers, bookings } = await booked(one, 'both', 4, 10);
      for (const [n, bookingId] of bookings.entries())
        await one.done('POST', `/bookings/${bookingId}/pay`, travellers[n].token);
      const payments = bookings.map(bookingId => provider.paymentFor(bookingId)[0]);

      // Each payment's success to both servers at once, twice over.
      provider.state.holding = true;
      const said = payments.map(payment => provider.pay(payment.id)!);
      await Promise.all(
        said.flatMap(event => [first.port, second.port, second.port, first.port].map(port => deliverTo(port, event))),
      );
      provider.flush();
      await provider.settled();
      const tokens = await Promise.all(travellers.map(each => two.login(each.email)));
      const all = async () => (await Promise.all(tokens.map(token => two.list('/receipts/mine', token)))).flat();
      await eventually(all, found => found.length >= 4, 30000);

      // Then a refund of the first, whose success also comes to both at once.
      await one.done('POST', `/bookings/${bookings[0]}/refunds`, hal.token, {
        amount: 1000,
        reason: 'A broken shower',
      });
      const [refund] = await eventually(
        async () => [...provider.refunds.values()].filter(each => each.payment === payments[0].id),
        found => found.length > 0,
      );
      provider.state.holding = true;
      provider.settleRefund(refund.id);
      const refunded = provider.events[provider.events.length - 1];
      await Promise.all([first.port, second.port, first.port, second.port].map(port => deliverTo(port, refunded)));
      provider.flush();
      await provider.settled();
      await eventually(all, found => found.length >= 5, 30000);
      await sleep(3000);
      const receipts = await all();
      expect(numbers(receipts)).toEqual(upTo(5));
      expect(
        receipts
          .filter(each => each.kind === 'payment')
          .map(each => String(each.bookingId))
          .sort(),
      ).toEqual([...bookings].sort());
      expect(receipts.filter(each => each.kind === 'refund').map(each => [each.bookingId, each.amount])).toEqual([
        [bookings[0], 1000],
      ]);
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 180000);
});
