import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  sleep,
  start,
  stop,
} from '../../acceptance/openstay';
import { paymentProvider, payBooking } from '../../acceptance/provider';
import { sum } from './faults';

/**
 * Chaos on the money, 1: refunds of one payment asked at the same moment on two servers on one database
 * (a host's refund, another host's refund, a cancellation, a claim decided for the traveller) never
 * together exceed what was paid (invariant 5; requests 31, 32, 72), and what is refunded is what the
 * provider refunded. One night at 100 € and 20 € of cleaning: 12 000 paid.
 */
const provider = paymentProvider();
const ADA = 'ada@chaos-refunds.test';
const PAID = 12000;
const REASON = 'A broken shower';
const NOTE = 'The photos show the broken window';
const databases: ReturnType<typeof database>[] = [];
const running: Running[] = [];
let environment: Record<string, string>;
beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    ...adminEnvironment(ADA),
    JOBS_INTERVAL_SECONDS: '1',
    PAYMENT_TTL_SECONDS: String(30 * 86400),
  };
}, 60000);
afterAll(async () => {
  for (const each of running) await stop(each);
  await provider.close();
  for (const each of databases) each.remove();
}, 90000);

/** Two servers on a database of the case's own, the provider attached to the first. */
async function twoServers(name: string, extra: Record<string, string> = {}) {
  const db = database(name);
  databases.push(db);
  const first = await start(db.path, { ...environment, ...extra });
  const second = await start(db.path, { ...environment, ...extra });
  running.push(first, second);
  provider.attach(first.port);
  return { db, first, second, a: client(first.port), b: client(second.port) };
}

const paymentOf = async (api: Client, bookingId: string, token: string) =>
  (await api.read(`/bookings/${bookingId}`, token)).payment as Json;
const refundsAt = (paymentId: string) => [...provider.refunds.values()].filter(each => each.payment === paymentId);
const succeeded = (paymentId: string) =>
  sum(
    refundsAt(paymentId)
      .filter(each => each.status === 'succeeded')
      .map(each => each.amount),
  );
/** The booking's refunds once every one the provider was asked for has settled. */
const settledRefunds = (api: Client, bookingId: string, token: string, paymentId: string) =>
  eventually(
    () => api.list(`/bookings/${bookingId}/refunds`, token),
    found =>
      found.length > 0 &&
      found.every(each => each.status === 'refunded') &&
      refundsAt(paymentId).every(each => each.status !== 'pending'),
    30000,
  );

describe('chaos: concurrent refunds of one payment', () => {
  it("refuses the second of two host's refunds made at the same moment on two servers when both together would exceed what was paid", async () => {
    provider.state.settleAfterMs = 200;
    const { a, b } = await twoServers('chaos-refunds-host');
    const hal = await a.host('hal@chaos-refunds.test');
    const tom = await a.traveller('tom@chaos-refunds.test');
    const id = await a.listing(hal.token);
    const bookingId = await a.book(tom.token, await a.quote(tom.token, id, day(10), day(11)));
    const payment = await payBooking(a, provider, tom.token, bookingId);
    const halOnB = await b.login(hal.email);

    // Request 32: "so is the second of two made at the same moment when both together would".
    const outcomes = await Promise.all([
      a.act('POST', `/bookings/${bookingId}/refunds`, hal.token, { amount: 8000, reason: REASON }),
      b.act('POST', `/bookings/${bookingId}/refunds`, halOnB, { amount: 8000, reason: REASON }),
    ]);
    expect(outcomes.filter(each => each.accepted)).toHaveLength(1);

    const refunds = await settledRefunds(a, bookingId, tom.token, payment.id);
    await sleep(3000);
    expect(refunds.map(each => each.amount)).toEqual([8000]);
    expect(refundsAt(payment.id).map(each => each.amount)).toEqual([8000]);
    expect(await paymentOf(b, bookingId, await b.login(tom.email))).toMatchObject({ refunded: 8000 });
    expect(succeeded(payment.id)).toBe(8000);
  }, 120000);

  it("refunds exactly what was paid when a cancellation and a host's refund come at the same moment on two servers", async () => {
    provider.state.settleAfterMs = 200;
    const { a, b } = await twoServers('chaos-refunds-cancel');
    const hal = await a.host('hal2@chaos-refunds.test');
    const tom = await a.traveller('tom2@chaos-refunds.test');
    const id = await a.listing(hal.token, { cancellationPolicy: 'flexible' });
    const bookingId = await a.book(tom.token, await a.quote(tom.token, id, day(10), day(11)));
    const payment = await payBooking(a, provider, tom.token, bookingId);
    const halOnB = await b.login(hal.email);

    // Request 31: the cancellation refunds the refundable amount (all of it, flexible, 10 days before),
    // "or what is left of what was paid, if the host's own refunds left less"; never more than paid.
    const [cancelled] = await Promise.all([
      a.act('POST', `/bookings/${bookingId}/cancel`, tom.token),
      b.act('POST', `/bookings/${bookingId}/refunds`, halOnB, { amount: 5000, reason: REASON }),
    ]);
    expect(cancelled.accepted).toBe(true);

    const refunds = await eventually(
      () => a.list(`/bookings/${bookingId}/refunds`, tom.token),
      found =>
        sum(found.map(each => each.amount)) >= PAID &&
        found.every(each => each.status === 'refunded') &&
        refundsAt(payment.id).every(each => each.status !== 'pending'),
      30000,
    );
    await sleep(3000);
    expect(sum(refunds.map(each => each.amount))).toBe(PAID);
    expect(refunds.every(each => each.status === 'refunded')).toBe(true);
    expect(sum(refundsAt(payment.id).map(each => each.amount))).toBe(PAID);
    expect(succeeded(payment.id)).toBe(PAID);
    expect(await paymentOf(a, bookingId, tom.token)).toMatchObject({ refunded: PAID });
    expect(await a.read(`/bookings/${bookingId}`, tom.token)).toMatchObject({
      status: 'cancelled',
      refund: { status: 'refunded' },
    });
  }, 120000);

  it("never refunds more than was paid when a claim decided for the traveller and two host's refunds come at the same moment on two servers", async () => {
    provider.state.settleAfterMs = 200;
    // A stay that took place (request 71): booked and paid tonight, then both servers two days later.
    const db = database('chaos-refunds-claim');
    databases.push(db);
    let first = await start(db.path, environment);
    running.push(first);
    provider.attach(first.port);
    let a = client(first.port);
    const hal = await a.host('hal3@chaos-refunds.test');
    const tom = await a.traveller('tom3@chaos-refunds.test');
    const ada = await a.admin(ADA);
    const id = await a.listing(hal.token);
    const bookingId = await a.book(tom.token, await a.quote(tom.token, id, day(0), day(1)));
    const payment = await payBooking(a, provider, tom.token, bookingId);

    first = await restart(first, db.path, { ...environment, ...clock(2) });
    running.push(first);
    const second = await start(db.path, { ...environment, ...clock(2) });
    running.push(second);
    provider.attach(first.port);
    a = client(first.port);
    const b = client(second.port);
    const [tomOnA, adaOnA, halOnA, halOnB] = await Promise.all([
      a.login(tom.email),
      a.login(ada.email),
      a.login(hal.email),
      b.login(hal.email),
    ]);
    const claimId = await a.create(`/bookings/${bookingId}/claims`, tomOnA, {
      amount: 9000,
      description: 'The window of the bedroom was broken',
    });

    // Request 72: "A decision and a host's refund made at the same moment never together exceed what was paid."
    const [decided] = await Promise.all([
      a.act('POST', `/admin/claims/${claimId}/decide`, adaOnA, { outcome: 'traveller', note: NOTE }),
      b.act('POST', `/bookings/${bookingId}/refunds`, halOnB, { amount: 6000, reason: REASON }),
      a.act('POST', `/bookings/${bookingId}/refunds`, halOnA, { amount: 4000, reason: REASON }),
    ]);
    expect(decided.accepted).toBe(true);

    const claim = await eventually(
      () => a.read(`/claims/${claimId}`, tomOnA),
      read => read.refund === null || (read.refund as Json).status === 'refunded',
      30000,
    );
    const refunds = await settledRefunds(a, bookingId, tomOnA, payment.id);
    await sleep(3000);
    const total = sum(refunds.map(each => each.amount));
    expect(total).toBeLessThanOrEqual(PAID);
    expect(sum(refundsAt(payment.id).map(each => each.amount))).toBeLessThanOrEqual(PAID);
    expect(succeeded(payment.id)).toBe(total);
    expect(await paymentOf(a, bookingId, tomOnA)).toMatchObject({ refunded: total });

    // The claim's refund is the amount decided, or what was left when it was decided; never more.
    expect(claim).toMatchObject({ status: 'decided', decision: { outcome: 'traveller', amount: 9000 } });
    const byAda = refunds.filter(each => each.by === ada.id).map(each => Number(each.amount));
    const claimed = claim.refund === null ? 0 : Number((claim.refund as Json).amount);
    expect(byAda).toEqual(claimed === 0 ? [] : [claimed]);
    expect(claimed).toBeLessThanOrEqual(9000);
    // "The refund is the amount decided, or what is left to refund ... if that is less": nothing short.
    if (claimed < 9000) expect(total).toBe(PAID);
  }, 180000);
});
