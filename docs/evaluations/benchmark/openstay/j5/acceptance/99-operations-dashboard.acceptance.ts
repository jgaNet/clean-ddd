import {
  adminEnvironment,
  clock,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  sleep,
  start,
  stop,
  WEEKDAYS,
} from './openstay';
import { enabledAccount, paymentProvider, payBooking } from './provider';

/**
 * Request 99: what waits for OpenStay's people, counted as it is when read: today's bookings and failed
 * payments, the payouts held, the open reports and claims, the support tickets not answered.
 */
const db = database('operations-dashboard');
const provider = paymentProvider();
const ADMIN = 'ada@dashboard.test';
let environment: Record<string, string>;
let server: Running;
let api: Client;
let admin: { id: string; email: string; token: string };
beforeAll(async () => {
  environment = { ...(await provider.environment()), ...adminEnvironment(ADMIN), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  admin = await api.admin(ADMIN);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

type Counts = Record<
  'bookingsToday' | 'failedPaymentsToday' | 'heldPayouts' | 'openReports' | 'openClaims' | 'unansweredTickets',
  number
>;
const dashboard = async () => (await api.read('/admin/dashboard', admin.token)) as unknown as Counts;
/** Reads the dashboard until `field` is `value`, and gives that value. */
const reads = async (field: keyof Counts, value: number) =>
  (await eventually(dashboard, counts => counts[field] === value, 20000))[field];
const bookingOf = (token: string, listingId: string, from: number, to: number) =>
  api.quote(token, listingId, day(from), day(to)).then(quoteId => api.book(token, quoteId));

describe('the operations dashboard', () => {
  it('is read by administrators only, each count a number', async () => {
    const tom = await api.traveller('tom@dashboard.test');
    const hal = await api.host('hal@dashboard.test');
    for (const token of [tom.token, hal.token])
      expect((await api.call('GET', '/admin/dashboard', token)).status).toBe(403);
    expect(await dashboard()).toMatchObject({
      bookingsToday: expect.any(Number),
      failedPaymentsToday: expect.any(Number),
      heldPayouts: expect.any(Number),
      openReports: expect.any(Number),
      openClaims: expect.any(Number),
      unansweredTickets: expect.any(Number),
    });
  }, 60000);

  it('counts the open reports of every kind, and the tickets opened or replied to by their user', async () => {
    const hal = await api.host('hal2@dashboard.test');
    const tom = await api.traveller('tom2@dashboard.test');
    const id = await api.listing(hal.token);
    const before = await dashboard();

    await api.create(`/listings/${id}/report`, tom.token, { reason: 'scam' });
    expect(await reads('openReports', before.openReports + 1)).toBe(before.openReports + 1);
    const conversationId = await api.create('/conversations', tom.token, {
      listingId: id,
      text: 'Is the flat close to the old harbour, please?',
    });
    const [message] = (await api.read(`/conversations/${conversationId}`, hal.token)).messages as Json[];
    await api.create(`/messages/${String(message.id)}/report`, hal.token, { reason: 'It reads like a scam to me.' });
    expect(await reads('openReports', before.openReports + 2)).toBe(before.openReports + 2);
    const reports = await api.list('/admin/reports', admin.token);
    const reportOf = (subjectId: unknown) => String(reports.find(each => each.subjectId === subjectId)?.id);
    await api.done('POST', `/admin/reports/${reportOf(id)}/dismiss`, admin.token, { note: 'Nothing wrong here.' });
    expect(await reads('openReports', before.openReports + 1)).toBe(before.openReports + 1);
    await api.done('POST', `/admin/reports/${reportOf(message.id)}/uphold`, admin.token, { note: 'A scam indeed.' });
    expect(await reads('openReports', before.openReports)).toBe(before.openReports);

    const ticket = await api.create('/support/tickets', tom.token, {
      subject: 'My refund',
      text: 'Where is my refund?',
    });
    expect(await reads('unansweredTickets', before.unansweredTickets + 1)).toBe(before.unansweredTickets + 1);
    await api.done('POST', `/support/tickets/${ticket}/messages`, admin.token, { text: 'On its way.' });
    expect(await reads('unansweredTickets', before.unansweredTickets)).toBe(before.unansweredTickets);
    await api.done('POST', `/support/tickets/${ticket}/messages`, tom.token, { text: 'Still nothing.' });
    expect(await reads('unansweredTickets', before.unansweredTickets + 1)).toBe(before.unansweredTickets + 1);
    await api.done('POST', `/support/tickets/${ticket}/close`, tom.token);
    expect(await reads('unansweredTickets', before.unansweredTickets)).toBe(before.unansweredTickets);
  }, 90000);

  it("counts today's bookings whatever became of them, and each payment that failed today once", async () => {
    const hal = await api.host('hal3@dashboard.test');
    const tom = await api.traveller('tom3@dashboard.test');
    const instant = await api.listing(hal.token);
    const asked = await api.listing(hal.token);
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const before = await dashboard();

    const confirmed = await bookingOf(tom.token, instant, 10, 12);
    const requested = await bookingOf(tom.token, asked, 10, 12);
    expect(await reads('bookingsToday', before.bookingsToday + 2)).toBe(before.bookingsToday + 2);
    await api.done('POST', `/bookings/${confirmed}/cancel`, tom.token);
    await api.done('POST', `/bookings/${requested}/decline`, hal.token);
    expect((await dashboard()).bookingsToday).toBe(before.bookingsToday + 2);

    const unpaid = await bookingOf(tom.token, instant, 20, 22);
    await api.done('POST', `/bookings/${unpaid}/pay`, tom.token);
    const [payment] = provider.paymentFor(unpaid);
    provider.state.twice = true;
    const failed = provider.fail(payment.id);
    expect(await reads('failedPaymentsToday', before.failedPaymentsToday + 1)).toBe(before.failedPaymentsToday + 1);
    provider.resend(failed);
    await provider.settled();
    provider.state.twice = false;
    await sleep(2000);
    expect(await dashboard()).toMatchObject({
      bookingsToday: before.bookingsToday + 3,
      failedPaymentsToday: before.failedPaymentsToday + 1,
    });
  }, 90000);

  it('counts the payouts held for want of an enabled account, not those waiting for their weekday', async () => {
    const ned = await api.host('ned@dashboard.test');
    const wes = await api.host('wes@dashboard.test');
    const tom = await api.traveller('tom4@dashboard.test');
    const before = await dashboard();

    const nedListing = await api.listing(ned.token);
    await payBooking(api, provider, tom.token, await bookingOf(tom.token, nedListing, 0, 1));
    expect(await reads('heldPayouts', before.heldPayouts + 1)).toBe(before.heldPayouts + 1);

    // A weekly host whose weekday is another day is not held.
    await enabledAccount(api, provider, wes.token);
    const weekday = WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
    await api.done('PUT', '/hosts/me/payout-schedule', wes.token, { schedule: 'weekly', weekday });
    const wesListing = await api.listing(wes.token);
    await payBooking(api, provider, tom.token, await bookingOf(tom.token, wesListing, 0, 1));
    await sleep(3000);
    expect((await dashboard()).heldPayouts).toBe(before.heldPayouts + 1);

    // Once the account is enabled, the payout is made and nothing is held.
    await enabledAccount(api, provider, ned.token);
    expect(await reads('heldPayouts', before.heldPayouts)).toBe(before.heldPayouts);
  }, 90000);

  it("starts each day afresh, holds a disputed booking's payout, and counts the claims until decided", async () => {
    const pat = await api.host('pat@dashboard.test');
    const cal = await api.host('cal@dashboard.test');
    const tom = await api.traveller('tom5@dashboard.test');
    await enabledAccount(api, provider, pat.token);
    const disputedListing = await api.listing(pat.token);
    const disputed = await bookingOf(tom.token, disputedListing, 1, 2);
    const payment = await payBooking(api, provider, tom.token, disputed);
    const dispute = provider.dispute(payment.id);
    await eventually(
      () => api.read(`/bookings/${disputed}`, tom.token),
      booking => (booking.payment as Json).disputed === true,
    );
    const claimedListing = await api.listing(cal.token);
    const claimed = await bookingOf(tom.token, claimedListing, 1, 2);
    await api.done('POST', `/bookings/${claimed}/declare-paid`, cal.token);
    const held = (await dashboard()).heldPayouts;

    // Three days later: the stays have taken place.
    server = await restart(server, db.path, { ...environment, ...clock(3) });
    provider.attach(server.port);
    api = client(server.port);
    admin = { ...admin, token: await api.login(ADMIN) };
    const traveller = await api.login(tom.email);
    const host = await api.login(cal.email);
    expect(await dashboard()).toMatchObject({ bookingsToday: 0, failedPaymentsToday: 0 });
    expect(await reads('heldPayouts', held + 1)).toBe(held + 1);
    provider.closeDispute(dispute, 'won');
    expect(await reads('heldPayouts', held)).toBe(held);

    const claims = (await dashboard()).openClaims;
    const claimId = await api.create(`/bookings/${claimed}/claims`, traveller, {
      amount: 5000,
      description: 'The heating did not work.',
    });
    expect(await reads('openClaims', claims + 1)).toBe(claims + 1);
    await api.done('POST', `/claims/${claimId}/answer`, host, { text: 'It worked when we checked.' });
    await sleep(1000);
    expect((await dashboard()).openClaims).toBe(claims + 1);
    await api.done('POST', `/admin/claims/${claimId}/decide`, admin.token, { outcome: 'rejected', note: 'No proof.' });
    expect(await reads('openClaims', claims)).toBe(claims);

    const bookedToday = await api.quote(traveller, claimedListing, day(5), day(6));
    await api.book(traveller, bookedToday);
    expect(await reads('bookingsToday', 1)).toBe(1);
  }, 120000);
});
