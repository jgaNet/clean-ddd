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
  WEEKDAYS,
} from '../../acceptance/openstay';
import {
  Currency,
  enabledAccount,
  feeOf,
  paymentProvider,
  payBooking,
  ProviderAccount,
} from '../../acceptance/provider';
import { providerGate, Sent, within } from './faults';

/**
 * Chaos on the money, 2: a weekly host's payouts computed by two servers on one database at once, and
 * with a server killed between the provider's answer and the write that records it: each booking paid
 * out once, never twice (invariant 4; requests 33, 47, 89), and nothing lost. One night at 100 and 20
 * of cleaning: 12 000 paid, less the provider's fee.
 */
const provider = paymentProvider();
const gate = providerGate(provider);
const databases: ReturnType<typeof database>[] = [];
const running: Running[] = [];
afterAll(async () => {
  for (const each of running) await stop(each);
  await gate.close();
  await provider.close();
  for (const each of databases) each.remove();
}, 90000);

const due = (currency: Currency = 'EUR') => 12000 - feeOf(12000, currency);
/** Read when a case runs, after the servers started (they may have waited past midnight). */
const today = () => WEEKDAYS[new Date().getUTCDay()];
const anotherDay = () => WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
const payoutsTo = (account: ProviderAccount) =>
  [...provider.payouts.values()].filter(each => each.account === account.id);

interface Node {
  name: string;
  server: Running;
  api: Client;
}
/** Two servers on a database of the case's own, each through its own door of the gate. */
async function twoServers(name: string) {
  const db = database(name);
  databases.push(db);
  const environment = async (door: string) => ({ ...(await gate.environment(door)), JOBS_INTERVAL_SECONDS: '1' });
  const node = async (door: string): Promise<Node> => {
    const server = await start(db.path, await environment(door));
    running.push(server);
    return { name: door, server, api: client(server.port) };
  };
  const nodes = { a: await node('a'), b: await node('b') };
  provider.attach(nodes.a.server.port);
  /** Kills the server that came through `door`, and starts it again on the same database. */
  const crash = async (sent: Sent) => {
    const which = nodes[sent.server as 'a' | 'b'];
    await kill(which.server);
  };
  const again = async (door: 'a' | 'b') => {
    nodes[door] = await node(door);
    return nodes[door];
  };
  return { db, nodes, crash, again };
}

/** A host with an enabled account, paid weekly on another day, and `count` bookings of tonight paid. */
async function weeklyHost(api: Client, name: string, currencies: Currency[]) {
  const host = await api.host(`${name}@chaos-weekly.test`);
  const tom = await api.traveller(`tom-${name}@chaos-weekly.test`);
  const account = await enabledAccount(api, provider, host.token);
  await api.done('PUT', '/hosts/me/payout-schedule', host.token, { schedule: 'weekly', weekday: anotherDay() });
  const bookings: { id: string; currency: Currency }[] = [];
  for (const currency of currencies) {
    const listingId = await api.create('/listings', host.token, {
      title: 'A room with a view',
      city: 'Lyon',
      capacity: 2,
      nightlyPrice: 10000,
      cleaningFee: 2000,
      cancellationPolicy: 'flexible',
      ...(currency !== 'EUR' && { currency }),
    });
    await api.done('POST', `/listings/${listingId}/publish`, host.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(0), day(1)));
    await payBooking(api, provider, tom.token, bookingId);
    bookings.push({ id: bookingId, currency });
  }
  await sleep(2000);
  return { host, account, bookings };
}

const ids = (bookings: { id: string }[]) => bookings.map(each => each.id).sort();
const listedIds = (payouts: Json[]) => payouts.flatMap(each => each.bookingIds as string[]).sort();

describe('chaos: a weekly host paid by two servers', () => {
  it('pays everything due in one payout, once, when two servers run the work at once', async () => {
    provider.state.settleAfterMs = 200;
    const { nodes } = await twoServers('chaos-weekly-two');
    const { host, account, bookings } = await weeklyHost(nodes.a.api, 'hal', ['EUR', 'EUR', 'EUR']);
    expect(payoutsTo(account)).toEqual([]);

    // Today becomes the weekday: both servers' work finds the same three bookings due.
    await nodes.b.api.done('PUT', '/hosts/me/payout-schedule', await nodes.b.api.login(host.email), {
      schedule: 'weekly',
      weekday: today(),
    });
    const payouts = await eventually(
      () => nodes.a.api.list('/hosts/me/payouts', host.token),
      found => found.some(each => each.status === 'paid'),
      30000,
    );
    await sleep(4000);
    // Request 47: "everything due to the host is paid in one payout"; request 89: "Each booking is paid
    // out once, never twice: ... on two servers on one database".
    expect(payoutsTo(account).map(each => each.amount)).toEqual([3 * due()]);
    const listed = await nodes.b.api.list('/hosts/me/payouts', await nodes.b.api.login(host.email));
    expect(listed).toHaveLength(1);
    expect(listedIds(listed)).toEqual(ids(bookings));
    expect(listed[0]).toMatchObject({ amount: 3 * due(), status: 'paid' });
    expect(payouts).toHaveLength(1);
  }, 150000);

  it("pays once, and loses nothing, when a server is killed between the provider's answer and the write", async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const { nodes, crash, again } = await twoServers('chaos-weekly-killed');
      const { host, account, bookings } = await weeklyHost(nodes.a.api, 'ian', ['EUR', 'EUR', 'EUR']);
      const trap = gate.crashAfter(
        sent => sent.method === 'POST' && sent.path === '/payouts' && sent.body.account === account.id,
        crash,
      );
      // The server that answers may be the one killed a moment later: its answer is read back afterwards.
      await nodes.a.api
        .act('PUT', '/hosts/me/payout-schedule', host.token, { schedule: 'weekly', weekday: today() })
        .catch(() => undefined);
      const tripped = await within(trap.tripped, 30000);
      expect(tripped).toBeDefined();
      const killed = tripped!.sent.server as 'a' | 'b';
      const survivor = nodes[killed === 'a' ? 'b' : 'a'];
      provider.attach(survivor.server.port);
      await again(killed);

      // The servers know the payout the provider holds, then the provider settles it.
      const token = await survivor.api.login(host.email);
      expect(await survivor.api.read('/hosts/me/payout-schedule', token)).toEqual({
        schedule: 'weekly',
        weekday: today(),
      });
      await eventually(
        () => survivor.api.list('/hosts/me/payouts', token),
        found => found.length > 0,
        30000,
      );
      await sleep(3000);
      for (const payout of payoutsTo(account).filter(each => each.status === 'pending'))
        provider.settlePayout(payout.id, true);
      const listed = await eventually(
        () => survivor.api.list('/hosts/me/payouts', token),
        found => found.some(each => each.status === 'paid'),
        30000,
      );
      await sleep(3000);
      // Request 33: "once per booking: never twice, even across a crash"; request 47: "Nothing lost".
      expect(payoutsTo(account).map(each => each.amount)).toEqual([3 * due()]);
      expect(payoutsTo(account)[0].id).toBe(tripped!.answer.id);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ amount: 3 * due(), status: 'paid' });
      expect(listedIds(listed)).toEqual(ids(bookings));
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 180000);

  it('pays one payout per currency, each once, when two servers run the work and one is killed mid-way', async () => {
    provider.state.settleAfterMs = undefined;
    try {
      const { nodes, crash, again } = await twoServers('chaos-weekly-currencies');
      const { host, account, bookings } = await weeklyHost(nodes.a.api, 'jon', ['EUR', 'GBP', 'EUR']);
      const trap = gate.crashAfter(
        sent => sent.method === 'POST' && sent.path === '/payouts' && sent.body.account === account.id,
        crash,
      );
      // The server that answers may be the one killed a moment later: its answer is read back afterwards.
      await nodes.a.api
        .act('PUT', '/hosts/me/payout-schedule', host.token, { schedule: 'weekly', weekday: today() })
        .catch(() => undefined);
      const tripped = await within(trap.tripped, 30000);
      expect(tripped).toBeDefined();
      const killed = tripped!.sent.server as 'a' | 'b';
      const survivor = nodes[killed === 'a' ? 'b' : 'a'];
      provider.attach(survivor.server.port);
      await again(killed);

      const token = await survivor.api.login(host.email);
      expect(await survivor.api.read('/hosts/me/payout-schedule', token)).toEqual({
        schedule: 'weekly',
        weekday: today(),
      });
      await eventually(
        () => survivor.api.list('/hosts/me/payouts', token),
        found => found.length >= 2,
        30000,
      );
      await sleep(3000);
      for (const payout of payoutsTo(account).filter(each => each.status === 'pending'))
        provider.settlePayout(payout.id, true);
      const listed = await eventually(
        () => survivor.api.list('/hosts/me/payouts', token),
        found => found.length >= 2 && found.every(each => each.status === 'paid'),
        30000,
      );
      await sleep(3000);
      // Request 89: "one payout for each currency in which something is due"; "Each booking is paid out
      // once, never twice: across a crash, on two servers on one database".
      expect(
        payoutsTo(account)
          .map(each => `${each.currency} ${each.amount}`)
          .sort(),
      ).toEqual([`EUR ${2 * due('EUR')}`, `GBP ${due('GBP')}`]);
      expect(
        listed.map(each => `${String(each.currency)} ${String(each.amount)} ${String(each.status)}`).sort(),
      ).toEqual([`EUR ${2 * due('EUR')} paid`, `GBP ${due('GBP')} paid`]);
      for (const payout of listed) {
        const currency = payout.currency as Currency;
        expect([...(payout.bookingIds as string[])].sort()).toEqual(
          ids(bookings.filter(each => each.currency === currency)),
        );
      }
    } finally {
      provider.state.settleAfterMs = 200;
    }
  }, 180000);
});
