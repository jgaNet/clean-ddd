import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { enabledAccount, feeOf, paymentProvider, payBooking } from './provider';

/** Request 35: every movement of the money of a host's bookings, and what OpenStay holds for them. */
const db = database('statement');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
  // The test settles refunds and payouts itself.
  provider.state.settleAfterMs = undefined;
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const statement = async (token: string, from: number, to: number) =>
  (await api.read(`/hosts/me/statement?from=${day(from)}&to=${day(to)}`, token)) as {
    lines: Json[];
    balance: number;
  };
const movements = (lines: Json[]) =>
  lines.map(line => `${String(line.type)} ${String(line.bookingId)} ${String(line.amount)}`);

describe("a host's statement", () => {
  it('lists each charge, fee, refund and payout once the provider said so, oldest first, with the balance', async () => {
    const started = Date.now();
    const hal = await api.host('hal@statement.test');
    const ian = await api.host('ian@statement.test');
    const tom = await api.traveller('tom@statement.test');
    await enabledAccount(api, provider, hal.token);
    const tonight = await api.book(tom.token, await api.quote(tom.token, await api.listing(hal.token), day(0), day(1)));
    const later = await api.book(tom.token, await api.quote(tom.token, await api.listing(hal.token), day(10), day(12)));

    await payBooking(api, provider, tom.token, tonight);
    const [payout] = await eventually(
      async () => [...provider.payouts.values()].filter(each => each.reference === tonight),
      found => found.length > 0,
      20000,
    );
    provider.settlePayout(payout.id);
    const payment = await payBooking(api, provider, tom.token, later);
    await api.create(`/bookings/${later}/refunds`, hal.token, { amount: 2000, reason: 'A broken shower' });
    const [refund] = await eventually(
      async () => [...provider.refunds.values()].filter(each => each.payment === payment.id),
      found => found.length > 0,
    );
    provider.settleRefund(refund.id);
    // A refund still pending is not on the statement.
    await api.create(`/bookings/${later}/refunds`, hal.token, { amount: 500, reason: 'A cold radiator' });

    const expected = [
      `charge ${tonight} 12000`,
      `fee ${tonight} ${-feeOf(12000)}`,
      `payout ${tonight} ${-(12000 - feeOf(12000))}`,
      `charge ${later} 22000`,
      `fee ${later} ${-feeOf(22000)}`,
      `refund ${later} -2000`,
    ];
    const balance = 22000 - feeOf(22000) - 2000;
    const read = await eventually(
      () => statement(hal.token, 0, 1),
      found => found.lines.length >= expected.length,
    );
    expect(movements(read.lines).sort()).toEqual([...expected].sort());
    expect(read.balance).toBe(balance);
    const times = read.lines.map(line => Date.parse(String(line.at)));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const at of times) {
      expect(at).toBeGreaterThanOrEqual(started - 5000);
      expect(at).toBeLessThanOrEqual(Date.now() + 5000);
    }
    expect(await statement(ian.token, 0, 1)).toEqual({ lines: [], balance: 0 });
  }, 90000);

  it('keeps the lines to the range, and counts in the balance every line up to its end', async () => {
    const jon = await api.host('jon@statement.test');
    const una = await api.traveller('una@statement.test');
    const id = await api.listing(jon.token);
    const bookingId = await api.book(una.token, await api.quote(una.token, id, day(10), day(12)));
    await payBooking(api, provider, una.token, bookingId);
    const balance = 22000 - feeOf(22000);
    expect(
      await eventually(
        () => statement(jon.token, 0, 1),
        found => found.lines.length >= 2,
      ),
    ).toMatchObject({ balance });

    expect(await statement(jon.token, 1, 2)).toEqual({ lines: [], balance });
    expect(await statement(jon.token, -1, 0)).toEqual({ lines: [], balance: 0 });
  }, 60000);
});
