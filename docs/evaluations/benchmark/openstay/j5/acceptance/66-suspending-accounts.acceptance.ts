import {
  adminEnvironment,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  notificationService,
  PASSWORD,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { openAccount, paymentProvider, payBooking } from './provider';

/**
 * Request 66: an account suspended by an administrator signs in no more, its listings leave search, and
 * its stays to come as a host are cancelled by the platform, refunded and noticed once each, across two
 * servers and a crash; reinstated, it signs in again with a new token.
 */
const db = database('suspending-accounts');
const provider = paymentProvider();
const service = notificationService(1);
let environment: Record<string, string>;
let server: Running;
/** A second server on the same database, which the provider's webhooks reach and which is never killed. */
let other: Running;
let api: Client;
let otherApi: Client;
type Person = { id: string; email: string; token: string };
let ada: Person;

beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    JOBS_INTERVAL_SECONDS: '1',
    NOTIFY_URL: await service.url(),
    ...adminEnvironment('ada@suspending.test'),
  };
  server = await start(db.path, environment);
  other = await start(db.path, environment);
  provider.attach(other.port);
  api = client(server.port);
  otherApi = client(other.port);
  ada = await api.admin('ada@suspending.test');
}, 60000);
afterAll(async () => {
  await stop(server);
  await stop(other);
  await provider.close();
  await service.close();
  db.remove();
});

const suspend = (id: string, reason = 'Cheated travellers.') =>
  api.done('POST', `/admin/accounts/${id}/suspend`, ada.token, { reason });
const reinstate = (id: string, note = 'Explained and corrected.') =>
  api.done('POST', `/admin/accounts/${id}/reinstate`, ada.token, { note });
const signIn = (on: Client, email: string, password = PASSWORD) =>
  on.call('POST', '/accounts/login', undefined, { email, password });
const me = async (on: Client, token: string) => (await on.call('GET', '/accounts/me', token)).status;
const booking = (id: string, token: string) => api.read(`/bookings/${id}`, token);
const refundsOf = (bookingId: string) => [...provider.refunds.values()].filter(each => each.reference === bookingId);
const cancelledNotices = (bookingId: string) =>
  service.attempts.filter(each => each.body.kind === 'booking-cancelled' && each.body.bookingId === bookingId);

describe('suspending an account', () => {
  it('is for an administrator only, never their own, once, with a reason and a note of 1 to 500 characters', async () => {
    const hal = await api.host('hal@suspending.test');
    const tom = await api.traveller('tom@suspending.test');
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/suspend`, tom.token, { reason: 'I say so' })).toBe(true);
    expect((await api.call('GET', `/admin/accounts/${hal.id}`, tom.token)).status).toBe(403);
    expect((await api.call('GET', `/admin/accounts/${hal.id}`, hal.token)).status).toBe(403);
    expect(await api.read(`/admin/accounts/${hal.id}`, ada.token)).toMatchObject({
      id: hal.id,
      email: hal.email,
      roles: ['host'],
      status: 'active',
    });
    expect(await api.refused('POST', `/admin/accounts/${ada.id}/suspend`, ada.token, { reason: 'Myself' })).toBe(true);
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/suspend`, ada.token, { reason: '' })).toBe(true);
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/suspend`, ada.token, { reason: 'x'.repeat(501) })).toBe(
      true,
    );
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/reinstate`, ada.token, { note: 'Not suspended' })).toBe(
      true,
    );
    expect(await api.read(`/admin/accounts/${hal.id}`, ada.token)).toMatchObject({ status: 'active' });

    await suspend(hal.id, 'x'.repeat(500));
    expect(await api.read(`/admin/accounts/${hal.id}`, ada.token)).toMatchObject({ id: hal.id, status: 'suspended' });
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/suspend`, ada.token, { reason: 'Again' })).toBe(true);
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/reinstate`, tom.token, { note: 'Free him' })).toBe(true);
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/reinstate`, ada.token, { note: '' })).toBe(true);
    await reinstate(hal.id, 'x'.repeat(500));
    expect(await api.read(`/admin/accounts/${hal.id}`, ada.token)).toMatchObject({ status: 'active' });
    expect(await api.refused('POST', `/admin/accounts/${hal.id}/reinstate`, ada.token, { note: 'Again' })).toBe(true);
  }, 60000);

  it('reads a closed account as closed, without its email, and neither suspends nor reinstates it', async () => {
    const kim = await api.traveller('kim@suspending.test');
    await api.done('POST', '/accounts/me/close', kim.token);
    expect(await api.read(`/admin/accounts/${kim.id}`, ada.token)).toMatchObject({ id: kim.id, email: null, status: 'closed' });
    expect(await api.refused('POST', `/admin/accounts/${kim.id}/suspend`, ada.token, { reason: 'Gone' })).toBe(true);
    expect(await api.refused('POST', `/admin/accounts/${kim.id}/reinstate`, ada.token, { note: 'Back' })).toBe(true);
    expect(await api.read(`/admin/accounts/${kim.id}`, ada.token)).toMatchObject({ status: 'closed' });
  }, 60000);

  it('refuses its sign-in as a wrong password is refused, and every token it had, on every server, even once reinstated', async () => {
    const sam = await api.traveller('sam@suspending.test');
    const earlier = [sam.token, await otherApi.login(sam.email)];
    await suspend(sam.id);

    const wrong = await signIn(api, sam.email, 'not-the-password');
    for (const on of [api, otherApi]) {
      const refused = await signIn(on, sam.email);
      expect(refused.status).toBe(401);
      expect(refused).toEqual(wrong);
      for (const token of earlier) expect(await me(on, token)).toBe(401);
    }

    await reinstate(sam.id);
    const fresh = await otherApi.login(sam.email);
    for (const on of [api, otherApi]) {
      expect(await me(on, fresh)).toBe(200);
      for (const token of earlier) expect(await me(on, token)).toBe(401);
    }
  }, 60000);

  it('takes its published listings out of search, quotes, holds and bookings, keeps their page, and brings them back', async () => {
    const ian = await api.host('ian@suspending.test');
    const tom = await api.traveller('tom2@suspending.test');
    const una = await api.traveller('una2@suspending.test');
    const id = await api.listing(ian.token, { city: 'Pauseville' });
    const asked = await api.listing(ian.token, { city: 'Pauseville' });
    await api.done('PUT', `/listings/${asked}/booking-mode`, ian.token, { mode: 'request' });
    const requested = await api.book(una.token, await api.quote(una.token, asked, day(10), day(12)));
    const quoteId = await api.quote(tom.token, id, day(20), day(21));
    await suspend(ian.id);

    expect(
      await eventually(
        () => api.list('/listings?city=Pauseville'),
        found => found.length === 0,
      ),
    ).toEqual([]);
    expect(await api.read(`/listings/${id}`)).toMatchObject({ id, status: 'published' });
    const stay = { listingId: id, checkIn: day(30), checkOut: day(31), guests: 1 };
    expect(await api.refused('POST', '/quotes', tom.token, stay)).toBe(true);
    expect(await api.refused('POST', '/holds', tom.token, stay)).toBe(true);
    expect(await api.refused('POST', '/bookings', tom.token, { quoteId })).toBe(true);
    // A request waiting for its decision is left as it is, to expire.
    expect(await booking(requested, una.token)).toMatchObject({ status: 'requested' });

    await reinstate(ian.id);
    expect(
      (
        await eventually(
          () => api.list('/listings?city=Pauseville'),
          found => found.length === 2,
        )
      )
        .map(each => each.id)
        .sort(),
    ).toEqual([id, asked].sort());
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(30), day(31)));
    expect(await booking(bookingId, tom.token)).toMatchObject({ status: 'confirmed' });
  }, 60000);

  it('cancels its stays to come as a host, refunds what was paid through the provider, notices each traveller, and keeps the rest', async () => {
    const joe = await api.account('joe@suspending.test', ['host', 'traveller']);
    const lou = await api.host('lou@suspending.test');
    const tom = await api.traveller('tom3@suspending.test');
    const una = await api.traveller('una3@suspending.test');
    const kim = await api.traveller('kim3@suspending.test');
    const payoutAccount = await openAccount(api, provider, joe.token);
    const id = await api.listing(joe.token, { city: 'Cancelville' });
    const paid = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    const declared = await api.book(una.token, await api.quote(una.token, id, day(14), day(15)));
    const unpaid = await api.book(kim.token, await api.quote(kim.token, id, day(16), day(17)));
    const begun = await api.book(tom.token, await api.quote(tom.token, id, day(0), day(1)));
    const asTraveller = await api.book(joe.token, await api.quote(joe.token, await api.listing(lou.token), day(10), day(11)));
    await payBooking(api, provider, tom.token, paid);
    await payBooking(api, provider, tom.token, begun);
    await api.done('POST', `/bookings/${declared}/declare-paid`, joe.token);
    const totals = new Map<string, number>();
    for (const [bookingId, token] of [
      [paid, tom.token],
      [declared, una.token],
      [unpaid, kim.token],
    ])
      totals.set(bookingId, Number((await booking(bookingId, token)).total));

    await suspend(joe.id);
    for (const [bookingId, person] of [
      [paid, tom],
      [declared, una],
      [unpaid, kim],
    ] as const) {
      const cancelled = await eventually(
        () => booking(bookingId, person.token),
        each => each.status === 'cancelled',
      );
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        cancellation: { by: 'platform', at: expect.any(String), refundable: totals.get(bookingId) },
      });
      const history = await api.list(`/bookings/${bookingId}/history`, person.token);
      expect(history[history.length - 1]).toMatchObject({ status: 'cancelled', by: null });
    }

    // Paid through the provider: refunded in full, once, when the provider says so.
    const refunded = await eventually(
      () => booking(paid, tom.token),
      each => (each.refund as Json | undefined)?.status === 'refunded',
    );
    expect(refunded).toMatchObject({
      refund: { amount: totals.get(paid), status: 'refunded' },
      payment: { refunded: totals.get(paid) },
    });
    // Declared paid directly, or not paid: nothing goes to the provider.
    expect(refundsOf(declared)).toEqual([]);
    expect(refundsOf(unpaid)).toEqual([]);
    expect(provider.paymentFor(declared)).toEqual([]);

    // One notice per cancelled booking, to its traveller, accepted in the end.
    for (const [bookingId, person] of [
      [paid, tom],
      [declared, una],
      [unpaid, kim],
    ] as const) {
      const notices = await eventually(
        async () => service.notices('booking-cancelled').filter(each => each.bookingId === bookingId),
        found => found.length > 0,
        30000,
      );
      expect(notices).toEqual([expect.objectContaining({ kind: 'booking-cancelled', accountId: person.id, bookingId })]);
    }

    // What stays: the stay already begun, its bookings as a traveller, and what is due for the stay begun.
    expect(await booking(begun, tom.token)).toMatchObject({ status: 'confirmed' });
    expect(await booking(asTraveller, joe.token)).toMatchObject({ status: 'confirmed' });
    provider.account(payoutAccount.id, 'enabled');
    const payouts = await eventually(
      async () => [...provider.payouts.values()].filter(each => each.reference === begun),
      found => found.length > 0,
      20000,
    );
    expect(payouts).toHaveLength(1);

    await sleep(3000);
    expect(refundsOf(paid).filter(each => each.status !== 'failed').map(each => each.amount)).toEqual([totals.get(paid)]);
    for (const bookingId of [paid, declared, unpaid])
      expect(new Set(cancelledNotices(bookingId).map(each => each.body.id)).size).toBe(1);
    expect(cancelledNotices(begun)).toEqual([]);
    expect(cancelledNotices(asTraveller)).toEqual([]);

    // Reinstated: nothing cancelled comes back, and its nights are free.
    await reinstate(joe.id);
    expect(await booking(paid, tom.token)).toMatchObject({ status: 'cancelled' });
    expect(await api.quote(una.token, id, day(10), day(12))).toEqual(expect.any(String));
  }, 150000);

  it('asks again for a refund the provider fails, and never refunds more than is left of what was paid', async () => {
    const pat = await api.host('pat@suspending.test');
    const tom = await api.traveller('tom4@suspending.test');
    const id = await api.listing(pat.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
    await payBooking(api, provider, tom.token, bookingId);
    const total = Number((await booking(bookingId, tom.token)).total);
    // The host's own refund first (request 32): what is left is the total less 1,000.
    await api.create(`/bookings/${bookingId}/refunds`, pat.token, { amount: 1000, reason: 'A broken shower' });
    await eventually(
      () => booking(bookingId, tom.token),
      each => (each.payment as Json).refunded === 1000,
    );

    provider.state.settleAfterMs = undefined;
    try {
      await suspend(pat.id);
      const [failing] = await eventually(
        async () => refundsOf(bookingId).filter(each => each.status === 'pending'),
        found => found.length > 0,
        20000,
      );
      expect(failing.amount).toBe(total - 1000);
      provider.settleRefund(failing.id, false);
      const [again] = await eventually(
        async () => refundsOf(bookingId).filter(each => each.status === 'pending'),
        found => found.length > 0,
        30000,
      );
      expect(again.id).not.toBe(failing.id);
      expect(again.amount).toBe(total - 1000);
      expect(((await booking(bookingId, tom.token)).refund as Json | undefined)?.status).not.toBe('refunded');
      provider.settleRefund(again.id);
      expect(
        await eventually(
          () => booking(bookingId, tom.token),
          each => (each.refund as Json | undefined)?.status === 'refunded',
        ),
      ).toMatchObject({ status: 'cancelled', cancellation: { by: 'platform' }, payment: { refunded: total } });
    } finally {
      provider.state.settleAfterMs = 200;
    }
    await sleep(2000);
    const succeeded = refundsOf(bookingId).filter(each => each.status === 'succeeded');
    expect(succeeded.reduce((sum, each) => sum + each.amount, 0)).toBe(total);
  }, 120000);

  it('cancels, refunds and notices each booking once with two servers on one database and a server killed', async () => {
    const zed = await api.host('zed@suspending.test');
    const travellers = [
      await api.traveller('tom5@suspending.test'),
      await api.traveller('una5@suspending.test'),
      await api.traveller('kim5@suspending.test'),
    ];
    const id = await api.listing(zed.token);
    const bookings: string[] = [];
    for (const [n, traveller] of travellers.entries()) {
      const bookingId = await api.book(traveller.token, await api.quote(traveller.token, id, day(10 + 2 * n), day(11 + 2 * n)));
      await payBooking(api, provider, traveller.token, bookingId);
      bookings.push(bookingId);
    }

    await suspend(zed.id);
    await kill(server);
    server = await start(db.path, environment);
    api = client(server.port);
    for (const traveller of travellers) traveller.token = await api.login(traveller.email);
    ada.token = await api.login(ada.email);

    for (const [n, bookingId] of bookings.entries()) {
      const read = await eventually(
        () => booking(bookingId, travellers[n].token),
        each => each.status === 'cancelled' && (each.refund as Json | undefined)?.status === 'refunded',
        30000,
      );
      expect(read).toMatchObject({ status: 'cancelled', cancellation: { by: 'platform' }, refund: { status: 'refunded' } });
      await eventually(
        async () => service.notices('booking-cancelled').filter(each => each.bookingId === bookingId),
        found => found.length > 0,
        30000,
      );
    }
    await sleep(3000);
    for (const [n, bookingId] of bookings.entries()) {
      const total = Number((await booking(bookingId, travellers[n].token)).total);
      expect(refundsOf(bookingId).filter(each => each.status !== 'failed').map(each => each.amount)).toEqual([total]);
      expect(new Set(cancelledNotices(bookingId).map(each => each.body.id)).size).toBe(1);
      expect(service.notices('booking-cancelled').filter(each => each.bookingId === bookingId)).toEqual([
        expect.objectContaining({ accountId: travellers[n].id }),
      ]);
      const history = await api.list(`/bookings/${bookingId}/history`, travellers[n].token);
      expect(history.filter(each => each.status === 'cancelled')).toHaveLength(1);
    }
  }, 150000);
});
