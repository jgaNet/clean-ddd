import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  Json,
  kill,
  restart,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking, ProviderRefund } from './provider';

/**
 * Request 72: a claim the traveller opened and an administrator decided for the traveller refunds them
 * through the provider, never more than is left of what was paid, once, across a decision sent twice
 * and a server killed; every other decision, and a booking not paid through the provider, moves
 * nothing. The stays are booked and paid today (one night at 100 € and 20 € of cleaning: 12 000), then
 * the server is started again two days later (CLOCK_OFFSET_DAYS, request 57).
 */
const db = database('claims-money');
const provider = paymentProvider();
const ADA = 'ada@claims-money.test';
let environment: Record<string, string>;
let server: Running;
let api: Client;
const PAID = 12000;

interface Person {
  id: string;
  email: string;
  token: string;
}
const people: Person[] = [];
const signed = async (made: Promise<Person>) => {
  const person = await made;
  people.push(person);
  return person;
};
const signIn = async () => {
  for (const person of people) person.token = await api.login(person.email);
};

let hal: Person;
let tom: Person;
let ada: Person;
const stays: Record<string, string> = {};
const payments: Record<string, string> = {};

async function stay(name: string, { paid = true } = {}) {
  const listingId = await api.listing(hal.token, { city: 'Biarritz' });
  stays[name] = await api.book(tom.token, await api.quote(tom.token, listingId, day(0), day(1)));
  if (paid) payments[name] = (await payBooking(api, provider, tom.token, stays[name])).id;
}

beforeAll(async () => {
  // A long payment deadline (request 30), so that a stay never paid has not lapsed two days later.
  environment = {
    ...(await provider.environment()),
    ...adminEnvironment(ADA),
    JOBS_INTERVAL_SECONDS: '1',
    PAYMENT_TTL_SECONDS: String(30 * 86400),
  };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await signed(api.host('hal@claims-money.test'));
  tom = await signed(api.traveller('tom@claims-money.test'));
  ada = await signed(api.admin(ADA));
  for (const name of ['refund', 'whole', 'left', 'race', 'nothing', 'twice', 'killed']) await stay(name);
  await stay('declared', { paid: false });
  await api.done('POST', `/bookings/${stays.declared}/declare-paid`, hal.token);
  await stay('unpaid', { paid: false });

  server = await restart(server, db.path, { ...environment, ...clock(2) });
  provider.attach(server.port);
  api = client(server.port);
  await signIn();
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const claimOf = (id: string, token = tom.token) => api.read(`/claims/${id}`, token);
const opened = (name: string, token: string, amount: number) =>
  api.create(`/bookings/${stays[name]}/claims`, token, { amount, description: 'The window of the bedroom was broken' });
const decide = (claimId: string, body: Json) => api.act('POST', `/admin/claims/${claimId}/decide`, ada.token, body);
const refundsAt = (name: string): ProviderRefund[] =>
  [...provider.refunds.values()].filter(each => each.reference === stays[name]);
const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);
const paymentOf = async (name: string) => (await api.read(`/bookings/${stays[name]}`, tom.token)).payment as Json;
const NOTE = 'The photos show the broken window';

describe('a claim decided with money', () => {
  it('refunds the amount decided through the provider, refunded only when the provider says so, and lists it with the booking', async () => {
    provider.state.settleAfterMs = undefined;
    provider.state.twice = true;
    try {
      const id = await opened('refund', tom.token, 5000);
      await api.done('POST', `/admin/claims/${id}/decide`, ada.token, { outcome: 'traveller', note: NOTE, amount: 3000 });
      expect(await claimOf(id)).toMatchObject({
        status: 'decided',
        decision: { outcome: 'traveller', note: NOTE, amount: 3000 },
      });
      const [refund] = await eventually(
        async () => refundsAt('refund'),
        found => found.length > 0,
      );
      expect(refund).toMatchObject({ payment: payments.refund, amount: 3000, reference: stays.refund });
      expect(
        await eventually(
          () => claimOf(id),
          claim => (claim.refund as Json | null)?.status === 'pending',
        ),
      ).toMatchObject({ refund: { amount: 3000, status: 'pending' } });
      // The decision is taken once: sent again, it is refused, and nothing more is asked.
      expect((await decide(id, { outcome: 'traveller', note: NOTE, amount: 3000 })).accepted).toBe(false);

      provider.settleRefund(refund.id);
      expect(
        await eventually(
          () => claimOf(id),
          claim => (claim.refund as Json | null)?.status === 'refunded',
        ),
      ).toMatchObject({ refund: { amount: 3000, status: 'refunded' } });
      await provider.settled();
      await sleep(2000);
      expect(refundsAt('refund')).toHaveLength(1);
      // Delivered twice, refund.succeeded counts once.
      expect(await paymentOf('refund')).toMatchObject({ refunded: 3000 });
      const listed = await api.list(`/bookings/${stays.refund}/refunds`, tom.token);
      expect(listed).toEqual([expect.objectContaining({ amount: 3000, reason: NOTE, by: ada.id, status: 'refunded' })]);
      expect(await api.list(`/bookings/${stays.refund}/refunds`, hal.token)).toHaveLength(1);

      const entries = await eventually(
        () => api.list(`/admin/audit?subjectId=${id}`, ada.token),
        found => found.length > 0,
      );
      expect(entries).toEqual([
        expect.objectContaining({ adminId: ada.id, action: 'claim-decided', subjectId: id, note: NOTE }),
      ]);
      // The host's statement follows, as for any refund (request 35).
      const statement = await api.read(`/hosts/me/statement?from=${day(-2)}&to=${day(5)}`, hal.token);
      const lines = (statement.lines as Json[]).filter(each => each.bookingId === stays.refund && each.type === 'refund');
      expect(lines.map(each => each.amount)).toEqual([-3000]);
    } finally {
      provider.state.settleAfterMs = 200;
      provider.state.twice = false;
    }
  }, 90000);

  it("decides the claim's amount when none is given, refuses one above it or below a cent, and asks again a refund that failed", async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const id = await opened('whole', tom.token, 4000);
      expect((await decide(id, { outcome: 'traveller', note: NOTE, amount: 4001 })).accepted).toBe(false);
      expect((await decide(id, { outcome: 'traveller', note: NOTE, amount: 0 })).accepted).toBe(false);
      expect(await claimOf(id)).toMatchObject({ status: 'open', decision: null });
      expect(refundsAt('whole')).toEqual([]);

      await api.done('POST', `/admin/claims/${id}/decide`, ada.token, { outcome: 'traveller', note: NOTE });
      expect(await claimOf(id)).toMatchObject({ decision: { outcome: 'traveller', amount: 4000 } });
      const [failed] = await eventually(
        async () => refundsAt('whole'),
        found => found.length > 0,
      );
      expect(failed.amount).toBe(4000);
      provider.settleRefund(failed.id, false);
      const again = await eventually(
        async () => refundsAt('whole').filter(each => each.id !== failed.id),
        found => found.length > 0,
        30000,
      );
      expect(again.map(each => each.amount)).toEqual([4000]);
      expect((await claimOf(id)).refund).toMatchObject({ amount: 4000 });
      expect(((await claimOf(id)).refund as Json).status).not.toBe('refunded');
      provider.settleRefund(again[0].id);
      expect(
        await eventually(
          () => claimOf(id),
          claim => (claim.refund as Json | null)?.status === 'refunded',
        ),
      ).toMatchObject({ refund: { amount: 4000, status: 'refunded' } });
      expect(await paymentOf('whole')).toMatchObject({ refunded: 4000 });
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 90000);

  it('refunds no more than is left of what was paid, and nothing when nothing is left', async () => {
    await api.create(`/bookings/${stays.left}/refunds`, hal.token, { amount: 10000, reason: 'A broken shower' });
    await eventually(
      () => paymentOf('left'),
      payment => payment.refunded === 10000,
    );
    const first = await opened('left', tom.token, 5000);
    await api.done('POST', `/admin/claims/${first}/decide`, ada.token, { outcome: 'traveller', note: NOTE });
    expect(
      await eventually(
        () => claimOf(first),
        claim => (claim.refund as Json | null)?.status === 'refunded',
      ),
    ).toMatchObject({ decision: { amount: 5000 }, refund: { amount: 2000, status: 'refunded' } });
    expect(await paymentOf('left')).toMatchObject({ refunded: PAID });

    // A second claim, once the first is decided: nothing is left, nothing is sent.
    const second = await opened('left', tom.token, 1000);
    await api.done('POST', `/admin/claims/${second}/decide`, ada.token, { outcome: 'traveller', note: NOTE });
    await sleep(3000);
    expect(await claimOf(second)).toMatchObject({ status: 'decided', decision: { amount: 1000 }, refund: null });
    expect(refundsAt('left').map(each => each.amount).sort((a, b) => a - b)).toEqual([2000, 10000]);
    expect(sum((await api.list(`/bookings/${stays.left}/refunds`, tom.token)).map(each => Number(each.amount)))).toBe(PAID);
  }, 90000);

  it("never refunds more than was paid when a decision and a host's refund come at the same moment", async () => {
    const id = await opened('race', tom.token, 8000);
    await Promise.all([
      api.act('POST', `/admin/claims/${id}/decide`, ada.token, { outcome: 'traveller', note: NOTE }),
      api.act('POST', `/bookings/${stays.race}/refunds`, hal.token, { amount: 8000, reason: 'A broken shower' }),
    ]);
    const refunds = await eventually(
      () => api.list(`/bookings/${stays.race}/refunds`, tom.token),
      found => found.length > 0 && found.every(each => each.status === 'refunded'),
      30000,
    );
    expect(refunds.every(each => each.status === 'refunded')).toBe(true);
    expect(sum(refunds.map(each => Number(each.amount)))).toBeLessThanOrEqual(PAID);
    expect(await claimOf(id)).toMatchObject({ status: 'decided', decision: { amount: 8000 } });
    expect(refunds.some(each => each.by === ada.id)).toBe(true);
    await provider.settled();
    const payment = await paymentOf('race');
    expect(payment.refunded).toBe(sum(refunds.map(each => Number(each.amount))));
    expect(sum(refundsAt('race').filter(each => each.status === 'succeeded').map(each => each.amount))).toBe(
      payment.refunded,
    );
  }, 90000);

  it('moves nothing for a decision for the host, a rejection, or a claim the host opened, and takes no amount with them', async () => {
    const forHost = await opened('nothing', tom.token, 3000);
    expect((await decide(forHost, { outcome: 'host', note: NOTE, amount: 1000 })).accepted).toBe(false);
    await api.done('POST', `/admin/claims/${forHost}/decide`, ada.token, { outcome: 'host', note: NOTE });
    expect(await claimOf(forHost)).toMatchObject({ decision: { outcome: 'host', amount: null }, refund: null });

    const rejected = await opened('nothing', tom.token, 3000);
    expect((await decide(rejected, { outcome: 'rejected', note: NOTE, amount: 1000 })).accepted).toBe(false);
    await api.done('POST', `/admin/claims/${rejected}/decide`, ada.token, { outcome: 'rejected', note: NOTE });
    expect(await claimOf(rejected)).toMatchObject({ decision: { outcome: 'rejected', amount: null }, refund: null });

    const byHost = await opened('nothing', hal.token, 3000);
    expect((await decide(byHost, { outcome: 'traveller', note: NOTE, amount: 1000 })).accepted).toBe(false);
    await api.done('POST', `/admin/claims/${byHost}/decide`, ada.token, { outcome: 'traveller', note: NOTE });
    expect(await claimOf(byHost)).toMatchObject({ decision: { outcome: 'traveller', amount: null }, refund: null });

    await sleep(3000);
    expect(refundsAt('nothing')).toEqual([]);
    expect(await api.list(`/bookings/${stays.nothing}/refunds`, tom.token)).toEqual([]);
    expect(await paymentOf('nothing')).toMatchObject({ status: 'paid', refunded: 0 });
    // Each decision is one entry of the audit log.
    for (const id of [forHost, rejected, byHost])
      expect(
        await eventually(
          () => api.list(`/admin/audit?subjectId=${id}`, ada.token),
          found => found.length > 0,
        ),
      ).toEqual([expect.objectContaining({ action: 'claim-decided', subjectId: id, note: NOTE })]);
  }, 90000);

  it('records the decision and moves nothing on a booking declared paid by its host, or not paid', async () => {
    const declared = await opened('declared', tom.token, 3000);
    await api.done('POST', `/admin/claims/${declared}/decide`, ada.token, { outcome: 'traveller', note: NOTE, amount: 2000 });
    const unpaid = await opened('unpaid', tom.token, 3000);
    await api.done('POST', `/admin/claims/${unpaid}/decide`, ada.token, { outcome: 'traveller', note: NOTE });
    await sleep(3000);
    expect(await claimOf(declared)).toMatchObject({
      status: 'decided',
      decision: { outcome: 'traveller', amount: 2000 },
      refund: null,
    });
    expect(await claimOf(unpaid)).toMatchObject({
      status: 'decided',
      decision: { outcome: 'traveller', amount: 3000 },
      refund: null,
    });
    expect(refundsAt('declared')).toEqual([]);
    expect(refundsAt('unpaid')).toEqual([]);
    expect(await api.list(`/bookings/${stays.declared}/refunds`, tom.token)).toEqual([]);
    expect(await api.list(`/bookings/${stays.unpaid}/refunds`, tom.token)).toEqual([]);
    expect(await paymentOf('declared')).toMatchObject({ status: 'declared', verified: false });
  }, 60000);

  it('asks the refund once when the decision is sent to two servers at the same moment', async () => {
    const id = await opened('twice', tom.token, 2500);
    const second = await start(db.path, { ...environment, ...clock(2) });
    try {
      const other = client(second.port);
      const outcomes = await Promise.all([
        api.act('POST', `/admin/claims/${id}/decide`, ada.token, { outcome: 'traveller', note: NOTE }),
        other.act('POST', `/admin/claims/${id}/decide`, await other.login(ada.email), {
          outcome: 'traveller',
          note: NOTE,
        }),
      ]);
      expect(outcomes.filter(each => each.accepted)).toHaveLength(1);
      expect(
        await eventually(
          () => claimOf(id),
          claim => (claim.refund as Json | null)?.status === 'refunded',
        ),
      ).toMatchObject({ refund: { amount: 2500, status: 'refunded' } });
      await sleep(3000);
      expect(refundsAt('twice').map(each => each.amount)).toEqual([2500]);
      expect(await paymentOf('twice')).toMatchObject({ refunded: 2500 });
      expect(await api.list(`/admin/audit?subjectId=${id}`, ada.token)).toHaveLength(1);
    } finally {
      await stop(second);
    }
  }, 90000);

  it('asks the refund once when the server is killed right after the decision, and finishes it after a start', async () => {
    const id = await opened('killed', tom.token, 1500);
    await api.done('POST', `/admin/claims/${id}/decide`, ada.token, { outcome: 'traveller', note: NOTE });
    await kill(server);
    server = await start(db.path, { ...environment, ...clock(2) });
    provider.attach(server.port);
    api = client(server.port);
    await signIn();
    expect(
      await eventually(
        () => claimOf(id),
        claim => (claim.refund as Json | null)?.status === 'refunded',
        30000,
      ),
    ).toMatchObject({ decision: { amount: 1500 }, refund: { amount: 1500, status: 'refunded' } });
    await sleep(3000);
    expect(refundsAt('killed').map(each => each.amount)).toEqual([1500]);
    expect(await paymentOf('killed')).toMatchObject({ refunded: 1500 });
  }, 120000);
});
