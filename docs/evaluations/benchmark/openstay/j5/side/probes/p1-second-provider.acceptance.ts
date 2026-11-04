import { createHmac, randomUUID } from 'crypto';
import { createServer, Server } from 'http';

import {
  adminEnvironment,
  client,
  Client,
  database,
  day,
  eventually,
  idOf,
  Json,
  kill,
  Running,
  sleep,
  start,
  stop,
  WEEKDAYS,
} from './openstay';
import { Currency, CURRENCIES, enabledAccount, feeOf, openAccount, paymentProvider, payBooking } from './provider';

/**
 * Probe P1, a second provider for the hosts of one country: a host paid in `CH` is paid through Alpenpay,
 * with its own API, signature and webhooks; any other host through the first provider, as before; the
 * travellers still pay through the first provider. What is paid, when, once, and what waits, is the
 * same for both; so is what the host sees.
 */

const ALPENPAY_KEY = 'ak_test_openstay';
const ALPENPAY_SECRET = 'alpsec_openstay';

interface AlpenpayRecipient {
  recipientId: string;
  externalId: string;
  state: 'review' | 'verified' | 'rejected';
  setupLink: string;
}
interface AlpenpayTransfer {
  transferId: string;
  recipientId: string;
  value: number;
  currency: Currency;
  externalId: string;
  state: 'queued' | 'completed' | 'returned';
  /** When it completed or was returned, as its webhook says; null while queued. */
  settledAt: string | null;
}
interface AlpenpayEvent {
  eventId: string;
  kind: string;
  occurredAt: string;
  object: Json;
}

const alpenpaySignature = (secret: string, body: string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

/**
 * Alpenpay as the tests play it: the API the probe gives, under `/v2`, for requests that carry
 * `X-Api-Key`, with `X-Request-Id` replays, and signed webhooks (`X-Alpenpay-Signature: sha256=<hex>` of
 * the body as sent) it can hold, send twice, or forge. What Alpenpay decides (verify or reject a
 * recipient, complete or return a transfer) is the test's to say; transfers complete by themselves after
 * `settleAfterMs` unless it is undefined.
 */
function alpenpay({ key = ALPENPAY_KEY, secret = ALPENPAY_SECRET } = {}) {
  const recipients = new Map<string, AlpenpayRecipient>();
  const transfers = new Map<string, AlpenpayTransfer>();
  const replays = new Map<string, { status: number; body: unknown }>();
  /** Every request OpenStay made, with Alpenpay's answer's status. */
  const requests: { method: string; path: string; status: number }[] = [];
  /** Every webhook Alpenpay decided to send, in order. */
  const events: AlpenpayEvent[] = [];
  /** Every attempt to deliver one, with the application's answer. */
  const deliveries: { event: string; status: number }[] = [];
  const queue: AlpenpayEvent[] = [];
  const state = {
    target: undefined as string | undefined,
    holding: false,
    twice: false,
    /** Transfers complete (or return, with `returnTransfers`) by themselves after this many ms; undefined: never. */
    settleAfterMs: 200 as number | undefined,
    returnTransfers: false,
  };
  let sending = Promise.resolve();

  const post = (target: string, body: string, headers: Record<string, string>) =>
    fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  const deliver = async (event: AlpenpayEvent) => {
    const body = JSON.stringify(event);
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!state.target) {
        await sleep(250);
        continue;
      }
      let status = 0;
      try {
        status = (await post(state.target, body, { 'x-alpenpay-signature': alpenpaySignature(secret, body) })).status;
      } catch {
        status = 0;
      }
      deliveries.push({ event: event.eventId, status });
      if (status >= 200 && status < 300) return;
      await sleep(500);
    }
  };
  const send = (event: AlpenpayEvent) => {
    if (state.holding) {
      queue.push(event);
      return;
    }
    sending = sending.then(() => deliver(event));
    if (state.twice) sending = sending.then(() => deliver(event));
  };
  const emit = (kind: string, object: Json, occurredAt = new Date()) => {
    const event = { eventId: `evt_${randomUUID()}`, kind, occurredAt: occurredAt.toISOString(), object };
    events.push(event);
    send(event);
    return event;
  };
  const decideRecipient = (id: string, to: 'verified' | 'rejected') => {
    const recipient = recipients.get(id);
    if (!recipient) throw new Error(`no recipient ${id}`);
    recipient.state = to;
    const { setupLink: _, ...object } = recipient;
    return emit(`recipient.${to}`, object);
  };
  const settleTransfer = (id: string, ok: boolean, occurredAt = new Date()) => {
    const transfer = transfers.get(id);
    if (!transfer || transfer.state !== 'queued') return undefined;
    transfer.state = ok ? 'completed' : 'returned';
    transfer.settledAt = occurredAt.toISOString();
    return emit(ok ? 'transfer.completed' : 'transfer.returned', { ...transfer }, occurredAt);
  };

  const handle = (method: string, path: string, body: Json): { status: number; body: unknown } => {
    const [, version, resource, id] = path.split('/');
    if (version !== 'v2') return { status: 404, body: { error: 'no such route' } };
    if (method === 'GET' && resource === 'recipients' && id) {
      const recipient = recipients.get(id);
      if (!recipient) return { status: 404, body: { error: 'no such recipient' } };
      const { setupLink: _, ...shown } = recipient;
      return { status: 200, body: shown };
    }
    if (method === 'GET' && resource === 'transfers' && id) {
      const transfer = transfers.get(id);
      if (!transfer) return { status: 404, body: { error: 'no such transfer' } };
      const { recipientId: _, ...shown } = transfer;
      return { status: 200, body: shown };
    }
    if (method !== 'POST' || id) return { status: 404, body: { error: 'no such route' } };
    if (resource === 'recipients') {
      if (typeof body.externalId !== 'string') return { status: 400, body: { error: 'externalId is required' } };
      const recipientId = `rcp_${randomUUID()}`;
      const recipient: AlpenpayRecipient = {
        recipientId,
        externalId: body.externalId,
        state: 'review',
        setupLink: `https://alpenpay.test/setup/${recipientId}`,
      };
      recipients.set(recipientId, recipient);
      return { status: 201, body: { ...recipient } };
    }
    if (resource === 'transfers') {
      const value = body.value;
      if (
        typeof body.recipientId !== 'string' ||
        typeof body.externalId !== 'string' ||
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value <= 0 ||
        !CURRENCIES.includes(body.currency as Currency)
      )
        return {
          status: 400,
          body: { error: 'recipientId, value (a positive integer), a known currency and externalId are required' },
        };
      const recipient = recipients.get(body.recipientId);
      if (!recipient) return { status: 404, body: { error: 'no such recipient' } };
      if (recipient.state !== 'verified') return { status: 422, body: { error: 'the recipient is not verified' } };
      const transfer: AlpenpayTransfer = {
        transferId: `trf_${randomUUID()}`,
        recipientId: recipient.recipientId,
        value,
        currency: body.currency as Currency,
        externalId: body.externalId,
        state: 'queued',
        settledAt: null,
      };
      transfers.set(transfer.transferId, transfer);
      if (state.settleAfterMs !== undefined) {
        const ok = !state.returnTransfers;
        setTimeout(() => settleTransfer(transfer.transferId, ok), state.settleAfterMs);
      }
      return { status: 201, body: { ...transfer } };
    }
    return { status: 404, body: { error: 'no such route' } };
  };

  const server: Server = createServer((request, response) => {
    let raw = '';
    request.on('data', chunk => (raw += chunk));
    request.on('end', () => {
      const method = request.method ?? 'GET';
      const path = new URL(request.url ?? '/', 'http://alpenpay').pathname;
      const answer = (status: number, body: unknown) => {
        requests.push({ method, path, status });
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      };
      if (request.headers['x-api-key'] !== key) return answer(401, { error: 'a valid X-Api-Key is required' });
      let body: Json = {};
      try {
        body = raw ? (JSON.parse(raw) as Json) : {};
      } catch {
        return answer(400, { error: 'the body is not JSON' });
      }
      const requestId = request.headers['x-request-id'];
      const replayKey = method === 'POST' && typeof requestId === 'string' ? `${path} ${requestId}` : undefined;
      if (replayKey && replays.has(replayKey)) {
        const replayed = replays.get(replayKey)!;
        return answer(replayed.status, replayed.body);
      }
      const result = handle(method, path, body);
      if (replayKey && result.status < 500) replays.set(replayKey, result);
      return answer(result.status, result.body);
    });
  });
  const listening = new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)),
  );

  /** A webhook signed with `signature` (none when undefined), as `occurredAt`; the application's answer's status. */
  const sendOnce = async (event: AlpenpayEvent, signature: string | undefined) => {
    const body = JSON.stringify(event);
    const reply = await post(state.target!, body, signature === undefined ? {} : { 'x-alpenpay-signature': signature });
    return reply.status;
  };
  const eventOf = (kind: string, object: Json, ageSeconds = 0): AlpenpayEvent => ({
    eventId: `evt_${randomUUID()}`,
    kind,
    occurredAt: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    object,
  });

  return {
    environment: async (): Promise<Record<string, string>> => ({
      ALPENPAY_URL: await listening,
      ALPENPAY_KEY: key,
      ALPENPAY_WEBHOOK_SECRET: secret,
    }),
    /** Where to send webhooks: the server on `port`, from now on. */
    attach: (port: number) => (state.target = `http://127.0.0.1:${port}/v1/payments/alpenpay/webhook`),
    state,
    recipients,
    transfers,
    requests,
    events,
    deliveries,
    /** The recipient behind the onboarding URL OpenStay gave a host. */
    recipientAt: (setupLink: string) => [...recipients.values()].find(each => each.setupLink === setupLink),
    transfersTo: (recipientId: string) => [...transfers.values()].filter(each => each.recipientId === recipientId),
    verify: (recipientId: string) => decideRecipient(recipientId, 'verified'),
    reject: (recipientId: string) => decideRecipient(recipientId, 'rejected'),
    /** Alpenpay completes a queued transfer, and says it completed at `occurredAt` (now). */
    complete: (transferId: string, occurredAt?: Date) => settleTransfer(transferId, true, occurredAt),
    /** Alpenpay returns a queued transfer. */
    giveBack: (transferId: string) => settleTransfer(transferId, false),
    /** Sends what was held, in the order held. */
    flush: () => {
      state.holding = false;
      for (const event of queue.splice(0)) send(event);
    },
    /** A valid webhook, signed, as of `ageSeconds` ago: the answer's status. */
    signed: (kind: string, object: Json, ageSeconds = 0) => {
      const event = eventOf(kind, object, ageSeconds);
      return sendOnce(event, alpenpaySignature(secret, JSON.stringify(event)));
    },
    /** A webhook with `signature` as its header, or none. */
    forge: (kind: string, object: Json, signature?: string) => sendOnce(eventOf(kind, object), signature),
    /** Waits until every webhook decided so far was delivered (or given up). */
    settled: () => sending,
    close: () =>
      new Promise<void>(resolve => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

const db = database('second-provider');
const provider = paymentProvider();
const alps = alpenpay();
const ADMIN = 'ada@second-provider.test';
const others: { server: Running; db: ReturnType<typeof database> }[] = [];
let environment: Record<string, string>;
let server: Running;
let api: Client;
let admin: { id: string; email: string; token: string };
beforeAll(async () => {
  environment = {
    ...(await provider.environment()),
    ...(await alps.environment()),
    ...adminEnvironment(ADMIN),
    JOBS_INTERVAL_SECONDS: '1',
  };
  server = await start(db.path, environment);
  provider.attach(server.port);
  alps.attach(server.port);
  api = client(server.port);
  admin = await api.admin(ADMIN);
}, 60000);
afterAll(async () => {
  await stop(server);
  for (const other of others) {
    await stop(other.server);
    other.db.remove();
  }
  await provider.close();
  await alps.close();
  db.remove();
});

/** Read when a case runs, after the server started (it may have waited past midnight). */
const today = () => WEEKDAYS[new Date().getUTCDay()];
const anotherDay = () => WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
/** One night from today, at 100 and 20 of cleaning: 12 000 paid, less the first provider's fee in its currency. */
const due = (currency: Currency = 'EUR') => 12000 - feeOf(12000, currency);
const DUE = due();
const ok = (status: number) => status >= 200 && status < 300;
const accountOf = (token: string) => api.read('/hosts/me/payout-account', token);
const listed = (token: string, expected: (payouts: Json[]) => boolean) =>
  eventually(() => api.list('/hosts/me/payouts', token), expected, 20000);
const transfersFor = (externalId: string) =>
  [...alps.transfers.values()].filter(each => each.externalId === externalId);
const sorted = (ids: unknown) => [...(ids as string[])].sort();

/** Opens a host's payout account in `CH`, and gives the Alpenpay recipient behind it. */
async function openSwiss(token: string): Promise<AlpenpayRecipient> {
  await api.done('POST', '/hosts/me/payout-account', token, { country: 'CH' });
  const { onboardingUrl } = await accountOf(token);
  const recipient = alps.recipientAt(String(onboardingUrl));
  if (!recipient) throw new Error(`Alpenpay has no recipient behind ${String(onboardingUrl)}`);
  return recipient;
}
/** A Swiss host, their recipient verified by Alpenpay and read `enabled`, and a traveller of their own. */
async function swissHost(name: string) {
  const hal = await api.host(`${name}@second-provider.test`);
  const tom = await api.traveller(`tom-${name}@second-provider.test`);
  const recipient = await openSwiss(hal.token);
  alps.verify(recipient.recipientId);
  const read = await eventually(
    () => accountOf(hal.token),
    each => each.status === 'enabled',
  );
  if (read.status !== 'enabled') throw new Error(`the payout account reads ${String(read.status)}`);
  return { hal, tom, recipient };
}
/** A listing of `hostToken`'s in `country` and `currency`, booked tonight by `travellerToken` and paid. */
async function paidTonight(hostToken: string, travellerToken: string, currency: Currency = 'EUR', country = 'CH') {
  const id = await api.create('/listings', hostToken, {
    title: 'A room with a view',
    city: 'Zurich',
    capacity: 2,
    nightlyPrice: 10000,
    cleaningFee: 2000,
    cancellationPolicy: 'flexible',
    currency,
    country,
  });
  await api.done('POST', `/listings/${id}/publish`, hostToken);
  const bookingId = await api.book(travellerToken, await api.quote(travellerToken, id, day(0), day(1)));
  const payment = await payBooking(api, provider, travellerToken, bookingId);
  return { bookingId, payment };
}

describe('a second provider for the hosts of one country', () => {
  it('keeps the country a host is paid in, FR when not given, and gives the same account whatever is sent again', async () => {
    const tom = await api.traveller('tom@second-provider.test');
    const fay = await api.host('fay@second-provider.test');
    const dov = await api.host('dov@second-provider.test');
    const hal = await api.host('hal@second-provider.test');
    const xan = await api.host('xan@second-provider.test');
    expect(await api.refused('POST', '/hosts/me/payout-account', tom.token, { country: 'CH' })).toBe(true);
    expect((await api.call('GET', '/hosts/me/payout-account', hal.token)).status).toBe(404);

    // Not given: FR, through the first provider. DE, through it too.
    const recipientsBefore = alps.recipients.size;
    const french = await openAccount(api, provider, fay.token);
    expect(await accountOf(fay.token)).toMatchObject({
      status: 'pending',
      country: 'FR',
      onboardingUrl: `https://provider.test/onboard/${french.id}`,
    });
    await api.done('POST', '/hosts/me/payout-account', dov.token, { country: 'DE' });
    const german = await accountOf(dov.token);
    expect(german).toMatchObject({ status: 'pending', country: 'DE' });
    expect(provider.accountAt(String(german.onboardingUrl))).toBeDefined();
    expect(alps.recipients.size).toBe(recipientsBefore);

    // CH: an Alpenpay recipient, whose setup link is the onboarding URL, and no account at the first provider.
    const accountsBefore = provider.accounts.size;
    const recipient = await openSwiss(hal.token);
    const swiss = await accountOf(hal.token);
    expect(swiss).toMatchObject({ id: expect.any(String), status: 'pending', country: 'CH' });
    expect(swiss.onboardingUrl).toBe(recipient.setupLink);
    expect(recipient.state).toBe('review');
    expect(alps.recipients.size).toBe(recipientsBefore + 1);
    expect(provider.accounts.size).toBe(accountsBefore);

    // Asking again gives the same account, whatever country is sent.
    const again = await api.act('POST', '/hosts/me/payout-account', hal.token, { country: 'FR' });
    expect(again.accepted).toBe(true);
    expect(idOf(again.result)).toBe(swiss.id);
    expect(await accountOf(hal.token)).toEqual(swiss);
    const frenchAgain = await api.act('POST', '/hosts/me/payout-account', fay.token, { country: 'CH' });
    expect(frenchAgain.accepted).toBe(true);
    expect(await accountOf(fay.token)).toMatchObject({
      country: 'FR',
      onboardingUrl: `https://provider.test/onboard/${french.id}`,
    });
    expect(alps.recipients.size).toBe(recipientsBefore + 1);
    expect(provider.accounts.size).toBe(accountsBefore);

    // A code that is not one of request 84's.
    expect(await api.refused('POST', '/hosts/me/payout-account', xan.token, { country: 'XX' })).toBe(true);
  }, 60000);

  it('reads a Swiss account pending while Alpenpay reviews it, enabled once verified, disabled once rejected, and pays only an enabled one', async () => {
    alps.state.settleAfterMs = 200;
    const ann = await api.host('ann@second-provider.test');
    const bea = await api.host('bea@second-provider.test');
    const tom = await api.traveller('tom2@second-provider.test');
    const reviewed = await openSwiss(ann.token);
    const rejected = await openSwiss(bea.token);
    alps.reject(rejected.recipientId);
    expect(
      await eventually(
        async () => (await accountOf(bea.token)).status,
        status => status === 'disabled',
      ),
    ).toBe('disabled');
    expect((await accountOf(ann.token)).status).toBe('pending');

    // Nothing is paid to an account in review, or rejected; what is due waits.
    const waiting = (await paidTonight(ann.token, tom.token)).bookingId;
    const never = (await paidTonight(bea.token, tom.token)).bookingId;
    await sleep(3000);
    expect(alps.transfersTo(reviewed.recipientId)).toEqual([]);
    expect(alps.transfersTo(rejected.recipientId)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', ann.token)).toEqual([]);
    expect(await api.list('/hosts/me/payouts', bea.token)).toEqual([]);

    alps.verify(reviewed.recipientId);
    expect(
      await eventually(
        async () => (await accountOf(ann.token)).status,
        status => status === 'enabled',
      ),
    ).toBe('enabled');
    const payouts = await listed(ann.token, found => found.some(each => each.status === 'paid'));
    expect(payouts).toEqual([expect.objectContaining({ bookingIds: [waiting], amount: DUE, status: 'paid' })]);
    expect(alps.transfersTo(reviewed.recipientId).map(each => [each.externalId, each.value, each.currency])).toEqual([
      [waiting, DUE, 'EUR'],
    ]);
    expect(transfersFor(never)).toEqual([]);
    expect([...provider.payouts.values()].filter(each => [waiting, never].includes(each.reference))).toEqual([]);
  }, 60000);

  it('refuses with 400 a webhook unsigned, wrongly signed or more than five minutes old, and answers 2xx to any valid one', async () => {
    const cid = await api.host('cid@second-provider.test');
    const recipient = await openSwiss(cid.token);
    const { setupLink: _, ...object } = { ...recipient, state: 'verified' };

    expect(await alps.forge('recipient.verified', object)).toBe(400);
    expect(await alps.forge('recipient.verified', object, `sha256=${'0'.repeat(64)}`)).toBe(400);
    expect(await alps.forge('recipient.verified', object, 'sha256=')).toBe(400);
    expect(await alps.signed('recipient.verified', object, 600)).toBe(400);
    await sleep(1000);
    expect((await accountOf(cid.token)).status).toBe('pending');

    // Alpenpay's own record says it too: an application may read the recipient back.
    alps.recipients.get(recipient.recipientId)!.state = 'verified';
    expect(ok(await alps.signed('recipient.verified', object))).toBe(true);
    expect(
      await eventually(
        async () => (await accountOf(cid.token)).status,
        status => status === 'enabled',
      ),
    ).toBe('enabled');

    // About something OpenStay does not know, or of a kind it does not act on: 2xx, and nothing changes.
    const elsewhere = {
      transferId: 'trf_elsewhere',
      recipientId: 'rcp_elsewhere',
      value: 5000,
      currency: 'CHF',
      externalId: 'another-platform',
      state: 'completed',
    };
    expect(ok(await alps.signed('transfer.completed', elsewhere))).toBe(true);
    expect(
      ok(await alps.signed('recipient.rejected', { recipientId: 'rcp_elsewhere', externalId: 'x', state: 'rejected' })),
    ).toBe(true);
    expect(ok(await alps.signed('balance.updated', { value: 0 }))).toBe(true);
    expect((await accountOf(cid.token)).status).toBe('enabled');
  }, 60000);

  it('pays a Swiss host through Alpenpay and any other through the first provider, and shows it the same way', async () => {
    alps.state.settleAfterMs = undefined;
    try {
      const { hal, tom, recipient } = await swissHost('dee');
      const fay = await api.host('fay2@second-provider.test');
      const frenchAccount = await enabledAccount(api, provider, fay.token);
      // The traveller pays the first provider, whatever the listing.
      const { bookingId, payment } = await paidTonight(hal.token, tom.token);
      expect(payment).toMatchObject({ amount: 12000, currency: 'EUR', reference: bookingId });
      const french = (await paidTonight(fay.token, tom.token, 'EUR', 'FR')).bookingId;

      const [transfer] = await eventually(
        async () => transfersFor(bookingId),
        found => found.length > 0,
        20000,
      );
      expect(transfer).toMatchObject({
        recipientId: recipient.recipientId,
        value: DUE,
        currency: 'EUR',
        state: 'queued',
      });
      const pending = await listed(hal.token, found => found.length > 0);
      expect(pending).toEqual([
        expect.objectContaining({ bookingIds: [bookingId], amount: DUE, currency: 'EUR', status: 'pending' }),
      ]);

      // Alpenpay completes it, and says so a few seconds later.
      const completedAt = new Date();
      alps.state.holding = true;
      alps.complete(transfer.transferId, completedAt);
      await sleep(4000);
      alps.flush();
      expect(await listed(hal.token, found => found[0]?.status === 'paid')).toEqual([
        expect.objectContaining({ bookingIds: [bookingId], amount: DUE, currency: 'EUR', status: 'paid' }),
      ]);

      // The French host is paid by the first provider, as before; neither goes through the other.
      const frenchPayouts = await eventually(
        async () => [...provider.payouts.values()].filter(each => each.reference === french),
        found => found.length > 0,
        20000,
      );
      expect(frenchPayouts.map(each => [each.account, each.amount])).toEqual([[frenchAccount.id, DUE]]);
      expect([...provider.payouts.values()].filter(each => each.reference === bookingId)).toEqual([]);
      expect(transfersFor(french)).toEqual([]);
      await sleep(2000);
      expect(transfersFor(bookingId)).toHaveLength(1);

      // The statement: a payout line at the time Alpenpay said it completed.
      const statement = await eventually(
        () => api.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}`, hal.token),
        read => (read.lines as Json[]).length >= 3,
      );
      expect(statement).toMatchObject({ balance: 0 });
      const lines = statement.lines as Json[];
      expect(lines.map(line => `${String(line.type)} ${String(line.bookingId)} ${String(line.amount)}`).sort()).toEqual(
        [`charge ${bookingId} 12000`, `fee ${bookingId} ${-feeOf(12000)}`, `payout ${bookingId} ${-DUE}`].sort(),
      );
      const payoutLine = lines.find(line => line.type === 'payout')!;
      expect(Math.abs(Date.parse(String(payoutLine.at)) - completedAt.getTime())).toBeLessThan(2000);

      // The earnings by month, and the yearly report on hosts.
      const year = day(0).slice(0, 4);
      expect(await api.list(`/hosts/me/earnings?year=${year}`, hal.token)).toMatchObject([
        { month: day(0).slice(0, 7), charged: 12000, fees: feeOf(12000), refunded: 0, paidOut: DUE },
      ]);
      const rows = (await api.list(`/admin/hosts-report?year=${year}`, admin.token)).filter(
        row => row.hostId === hal.id,
      );
      expect(rows).toEqual([
        expect.objectContaining({
          country: 'CH',
          currency: 'EUR',
          bookings: 1,
          nights: 1,
          paid: 12000,
          fees: feeOf(12000),
        }),
      ]);
    } finally {
      alps.state.settleAfterMs = 200;
      alps.state.holding = false;
    }
  }, 90000);

  it('pays a weekly Swiss host one Alpenpay transfer per currency on the weekday, and nothing on other days', async () => {
    alps.state.settleAfterMs = 200;
    const { hal, tom, recipient } = await swissHost('eda');
    await api.done('PUT', '/hosts/me/payout-schedule', hal.token, { schedule: 'weekly', weekday: anotherDay() });
    const euros = [
      (await paidTonight(hal.token, tom.token)).bookingId,
      (await paidTonight(hal.token, tom.token)).bookingId,
    ];
    const franc = (await paidTonight(hal.token, tom.token, 'CHF')).bookingId;
    await sleep(3000);
    expect(alps.transfersTo(recipient.recipientId)).toEqual([]);

    await api.done('PUT', '/hosts/me/payout-schedule', hal.token, { schedule: 'weekly', weekday: today() });
    const payouts = await listed(hal.token, found => found.length >= 2 && found.every(each => each.status === 'paid'));
    expect(payouts).toHaveLength(2);
    const inEuros = payouts.find(each => each.currency === 'EUR')!;
    expect(inEuros).toMatchObject({ amount: 2 * DUE });
    expect(sorted(inEuros.bookingIds)).toEqual(sorted(euros));
    expect(payouts.find(each => each.currency === 'CHF')).toMatchObject({ bookingIds: [franc], amount: due('CHF') });

    await sleep(2000);
    const sent = alps.transfersTo(recipient.recipientId);
    expect(sent.map(each => [each.currency, each.value]).sort()).toEqual(
      [
        ['CHF', due('CHF')],
        ['EUR', 2 * DUE],
      ].sort(),
    );
    // Several bookings: a reference of OpenStay's own. One booking: the booking's id.
    expect([...euros, franc]).not.toContain(sent.find(each => each.currency === 'EUR')!.externalId);
    expect(sent.find(each => each.currency === 'CHF')!.externalId).toBe(franc);
  }, 90000);

  it('reads a returned transfer failed and pays it again, once, whatever comes twice or out of order', async () => {
    alps.state.settleAfterMs = undefined;
    try {
      const { hal, tom, recipient } = await swissHost('fox');
      const { bookingId } = await paidTonight(hal.token, tom.token);
      const [first] = await eventually(
        async () => alps.transfersTo(recipient.recipientId),
        found => found.length > 0,
        20000,
      );
      alps.giveBack(first.transferId);
      await listed(hal.token, found => found.some(each => each.status === 'failed'));
      const second = (
        await eventually(
          async () => alps.transfersTo(recipient.recipientId),
          found => found.length >= 2,
          20000,
        )
      ).find(each => each.transferId !== first.transferId)!;
      expect(second.value).toBe(DUE);

      // Its completion delivered twice, then a return arriving after it: paid once, and never undone.
      alps.state.twice = true;
      alps.complete(second.transferId);
      await alps.settled();
      alps.state.twice = false;
      await listed(hal.token, found => found.some(each => each.status === 'paid'));
      expect(ok(await alps.signed('transfer.returned', { ...second, state: 'returned' }))).toBe(true);
      await sleep(3000);

      const payouts = await api.list('/hosts/me/payouts', hal.token);
      expect(payouts.map(each => `${String(each.status)} ${String(each.amount)}`).sort()).toEqual([
        `failed ${DUE}`,
        `paid ${DUE}`,
      ]);
      for (const each of payouts) expect(each.bookingIds).toEqual([bookingId]);
      expect(alps.transfersTo(recipient.recipientId)).toHaveLength(2);
      const statement = await api.read(`/hosts/me/statement?from=${day(-1)}&to=${day(2)}`, hal.token);
      expect((statement.lines as Json[]).filter(line => line.type === 'payout').map(line => line.amount)).toEqual([
        -DUE,
      ]);
      expect(statement).toMatchObject({ balance: 0 });
    } finally {
      alps.state.settleAfterMs = 200;
      alps.state.twice = false;
    }
  }, 90000);

  it('holds Alpenpay transfers while payouts are paused and a disputed booking alone, and pays them after', async () => {
    alps.state.settleAfterMs = 200;
    const { hal, tom, recipient } = await swissHost('gus');
    await api.done('POST', '/admin/payouts/pause', admin.token, { reason: 'Alpenpay pays the wrong accounts.' });
    let resumed = false;
    try {
      const plain = (await paidTonight(hal.token, tom.token)).bookingId;
      const disputed = await paidTonight(hal.token, tom.token);
      const opened = provider.dispute(disputed.payment.id);
      await eventually(
        async () => (await api.read(`/bookings/${disputed.bookingId}`, tom.token)).payment as Json,
        payment => payment.disputed === true,
      );
      await sleep(3000);
      expect(alps.transfersTo(recipient.recipientId)).toEqual([]);

      await api.done('POST', '/admin/payouts/resume', admin.token);
      resumed = true;
      await listed(hal.token, found => found.some(each => each.status === 'paid'));
      await sleep(2000);
      expect(alps.transfersTo(recipient.recipientId).map(each => each.externalId)).toEqual([plain]);

      provider.closeDispute(opened, 'won');
      await listed(hal.token, found => found.filter(each => each.status === 'paid').length >= 2);
      await sleep(2000);
      expect(
        alps
          .transfersTo(recipient.recipientId)
          .map(each => each.externalId)
          .sort(),
      ).toEqual([plain, disputed.bookingId].sort());
    } finally {
      if (!resumed) await api.act('POST', '/admin/payouts/resume', admin.token);
    }
  }, 90000);

  it('pays a booking once through Alpenpay across a crash', async () => {
    const { hal, tom, recipient } = await swissHost('hob');
    // Alpenpay completes the transfer once the server started again knows it.
    alps.state.settleAfterMs = undefined;
    let token: string;
    let bookingId: string;
    try {
      bookingId = (await paidTonight(hal.token, tom.token)).bookingId;
      await eventually(
        async () => transfersFor(bookingId),
        found => found.length > 0,
        20000,
      );
      await kill(server);
      server = await start(db.path, environment);
      provider.attach(server.port);
      alps.attach(server.port);
      api = client(server.port);
      token = await api.login(hal.email);
      await listed(token, found => found.length > 0);
      await sleep(2000);
      for (const transfer of alps.transfersTo(recipient.recipientId).filter(each => each.state === 'queued'))
        alps.complete(transfer.transferId);
    } finally {
      alps.state.settleAfterMs = 200;
    }
    const payouts = await listed(token, found => found.length > 0 && found.every(each => each.status === 'paid'));
    await sleep(3000);
    expect(payouts).toEqual([expect.objectContaining({ bookingIds: [bookingId], amount: DUE, status: 'paid' })]);
    expect(await api.list('/hosts/me/payouts', token)).toHaveLength(1);
    expect(transfersFor(bookingId)).toHaveLength(1);
  }, 120000);

  it('starts without Alpenpay, refuses a Swiss payout account, and works as before for anyone else', async () => {
    const store = database('second-provider-without');
    const own = await start(store.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
    others.push({ server: own, db: store });
    const on = client(own.port);
    const hal = await on.host('hal@without-alpenpay.test');
    const fay = await on.host('fay@without-alpenpay.test');
    const recipientsBefore = alps.recipients.size;
    expect(await on.refused('POST', '/hosts/me/payout-account', hal.token, { country: 'CH' })).toBe(true);
    expect((await on.call('GET', '/hosts/me/payout-account', hal.token)).status).toBe(404);
    expect(alps.recipients.size).toBe(recipientsBefore);

    await on.done('POST', '/hosts/me/payout-account', fay.token);
    const account = await on.read('/hosts/me/payout-account', fay.token);
    expect(account).toMatchObject({ status: 'pending', country: 'FR' });
    expect(provider.accountAt(String(account.onboardingUrl))).toBeDefined();
  }, 60000);
});
