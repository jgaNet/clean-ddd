import { createHmac, randomUUID } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';

import { eventually } from './openstay';
import type { Client, Json } from './openstay';

/**
 * The payment provider of requests 26 to 100, as the tests play it (docs/evaluations/benchmark/openstay/j0.md:
 * a hidden test cannot depend on a real provider's test mode). It answers the API request 26 gives, keeps
 * its own books, and tells the application what happened through signed webhooks it can delay, send
 * twice, reorder or hold back. What a traveller does at the provider (pay, authenticate, fail) and what
 * the provider decides (enable an account, settle a refund or a payout) are the test's to say.
 *
 * From J5 (requests 87 and 90): every payment, refund and payout has a `currency` (`EUR` when none is
 * given), given back in every answer, transaction and webhook's `data`; a payment's fee is in its
 * currency, from the schedule `GET /fees?amount=&currency=` publishes; a refund in another currency
 * than its payment's is refused with `400`. A server that sends no currency gets the answers it got at
 * J4, each with `currency: "EUR"` added, and fees rounded half up rather than down (`feeOf`).
 */
/** The currencies the provider takes (request 87), and the one it assumes when none is given. */
export const CURRENCIES = ['EUR', 'GBP', 'CHF', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];
const isCurrency = (value: unknown): value is Currency => CURRENCIES.includes(value as Currency);

export interface ProviderPayment {
  id: string;
  amount: number;
  currency: Currency;
  reference: string;
  status: 'requires_payment' | 'requires_action' | 'succeeded' | 'failed';
  fee: number;
  refunded: number;
  at: number;
}
export interface ProviderMove {
  id: string;
  amount: number;
  currency: Currency;
  reference: string;
  status: 'pending' | 'succeeded' | 'failed';
  at: number;
}
export interface ProviderRefund extends ProviderMove {
  payment: string;
}
export interface ProviderPayout extends ProviderMove {
  account: string;
}
export interface ProviderAccount {
  id: string;
  reference: string;
  status: 'pending' | 'enabled' | 'disabled';
}
export interface Transaction {
  id: string;
  type: 'charge' | 'fee' | 'refund' | 'payout' | 'dispute';
  amount: number;
  currency: Currency;
  reference: string;
  object: string;
  at: string;
}
export interface Webhook {
  id: string;
  type: string;
  created: number;
  data: Json;
}

/**
 * The provider's schedule (request 90), what `GET /fees` answers and what it charges every payment:
 * 1.4 % of `amount`, rounded half up to the currency's minor unit, plus 25 in `EUR`, `GBP` and `CHF`,
 * or plus 40 in `JPY` (¥40). Amounts are integers of the minor unit (request 87).
 */
export const feeOf = (amount: number, currency: Currency = 'EUR') =>
  Math.floor((amount * 14 + 500) / 1000) + (currency === 'JPY' ? 40 : 25);

/**
 * The card fee line of a quote whose other lines add up to `t` (request 90): the smallest `c` whose
 * fee on `t + c` is `c`, found from the fee on `t`, asking again with the last answer added until the
 * answer no longer changes. `cardFeeOf(10000)` is 167.
 */
export const cardFeeOf = (t: number, currency: Currency = 'EUR') => {
  let c = feeOf(t, currency);
  for (let next = feeOf(t + c, currency); next !== c; next = feeOf(t + c, currency)) c = next;
  return c;
};

export const KEY = 'sk_test_openstay';
export const SECRET = 'whsec_openstay';

const sign = (secret: string, timestamp: number, body: string) =>
  `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

export function paymentProvider({ secret = SECRET, key = KEY } = {}) {
  const accounts = new Map<string, ProviderAccount>();
  const payments = new Map<string, ProviderPayment>();
  const refunds = new Map<string, ProviderRefund>();
  const payouts = new Map<string, ProviderPayout>();
  const transactions: Transaction[] = [];
  const replays = new Map<string, { status: number; body: unknown }>();
  /** Every webhook the provider has decided to send, in the order it decided them. */
  const events: Webhook[] = [];
  /** Every attempt to deliver one, with the application's answer. */
  const deliveries: { event: string; status: number; at: number }[] = [];
  const queue: Webhook[] = [];
  const state = {
    /** Where the application listens; set with `attach(port)` after every start. */
    target: undefined as string | undefined,
    /** While true, webhooks wait in the queue (`flush()` sends them). */
    holding: false,
    /** Each webhook sent twice. */
    twice: false,
    /** Refunds and payouts settle by themselves after this many ms (undefined: the test settles them). */
    settleAfterMs: 200 as number | undefined,
    /** Payouts fail when they settle, while true. */
    failPayouts: false,
    /** While true, `GET /fees` answers 503: the schedule does not answer (request 90). */
    feesDown: false,
  };
  /** Every question asked of the schedule, `GET /fees`, in order (request 90: OpenStay keeps no copy). */
  const feeQueries: { amount: number; currency: Currency; at: number }[] = [];
  let sending = Promise.resolve();

  /** Delivers an event to `to`, or to the attached server when none is given, until it is accepted. */
  const deliver = async (event: Webhook, to?: string) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const target = to ?? state.target;
      if (!target) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      const body = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000);
      let status = 0;
      try {
        const answer = await fetch(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'provider-signature': sign(secret, timestamp, body) },
          body,
        });
        status = answer.status;
      } catch {
        status = 0;
      }
      deliveries.push({ event: event.id, status, at: Date.now() });
      if (status >= 200 && status < 300) return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };
  const send = (event: Webhook) => {
    if (state.holding) {
      queue.push(event);
      return;
    }
    sending = sending.then(() => deliver(event));
    if (state.twice) sending = sending.then(() => deliver(event));
  };
  const emit = (type: string, data: Json) => {
    const event = { id: `evt_${randomUUID()}`, type, created: Math.floor(Date.now() / 1000), data };
    events.push(event);
    send(event);
    return event;
  };
  const record = (
    type: Transaction['type'],
    amount: number,
    reference: string,
    object: string,
    currency: Currency = 'EUR',
  ) =>
    transactions.push({
      id: `txn_${randomUUID()}`,
      type,
      amount,
      currency,
      reference,
      object,
      at: new Date().toISOString(),
    });

  const settleRefund = (id: string, ok = true) => {
    const refund = refunds.get(id);
    if (!refund || refund.status !== 'pending') return;
    refund.status = ok ? 'succeeded' : 'failed';
    if (ok) {
      payments.get(refund.payment)!.refunded += refund.amount;
      record('refund', -refund.amount, refund.reference, refund.id, refund.currency);
    }
    emit(ok ? 'refund.succeeded' : 'refund.failed', { ...refund });
  };
  const settlePayout = (id: string, ok = !state.failPayouts) => {
    const payout = payouts.get(id);
    if (!payout || payout.status !== 'pending') return;
    payout.status = ok ? 'succeeded' : 'failed';
    if (ok) record('payout', -payout.amount, payout.reference, payout.id, payout.currency);
    emit(ok ? 'payout.paid' : 'payout.failed', { ...payout });
  };
  const later = (settle: () => void) => {
    if (state.settleAfterMs !== undefined) setTimeout(settle, state.settleAfterMs);
  };

  const answer = (response: ServerResponse, status: number, body: unknown) =>
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  const refuse = (response: ServerResponse, status: number, message: string) =>
    answer(response, status, { error: message });
  const int = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0;

  const handle = (request: IncomingMessage, body: Json): { status: number; body: unknown } => {
    const url = new URL(request.url ?? '/', 'http://provider');
    const [, resource, id] = url.pathname.split('/');
    // `currency` may be left out, `EUR`; anything else than the four is refused (request 87).
    const currencyOf = (given: unknown): Currency | undefined =>
      given === undefined || given === null ? 'EUR' : isCurrency(given) ? given : undefined;
    if (request.method === 'GET' && resource === 'fees') {
      if (state.feesDown) return { status: 503, body: { error: 'the schedule is unavailable' } };
      const amount = url.searchParams.get('amount') ?? '';
      const currency = currencyOf(url.searchParams.get('currency') ?? undefined);
      if (!/^\d+$/.test(amount) || !currency)
        return {
          status: 400,
          body: { error: 'amount (an integer of the minor unit) and a known currency are required' },
        };
      feeQueries.push({ amount: Number(amount), currency, at: Date.now() });
      return { status: 200, body: { fee: feeOf(Number(amount), currency) } };
    }
    if (request.method === 'GET' && resource === 'transactions') {
      const date = url.searchParams.get('date');
      return { status: 200, body: transactions.filter(each => !date || each.at.startsWith(date)) };
    }
    if (request.method === 'GET' && id) {
      const found = { accounts, payments, refunds, payouts }[resource as 'accounts']?.get(id);
      return found ? { status: 200, body: found } : { status: 404, body: { error: 'no such object' } };
    }
    if (request.method !== 'POST') return { status: 404, body: { error: 'no such route' } };
    if (resource === 'accounts') {
      if (typeof body.reference !== 'string') return { status: 400, body: { error: 'reference is required' } };
      const account: ProviderAccount = { id: `acct_${randomUUID()}`, reference: body.reference, status: 'pending' };
      accounts.set(account.id, account);
      return { status: 201, body: { ...account, onboardingUrl: `https://provider.test/onboard/${account.id}` } };
    }
    if (resource === 'payments') {
      const currency = currencyOf(body.currency);
      if (!int(body.amount) || typeof body.reference !== 'string')
        return { status: 400, body: { error: 'amount (a positive integer of cents) and reference are required' } };
      if (!currency) return { status: 400, body: { error: `no such currency: ${String(body.currency)}` } };
      const payment: ProviderPayment = {
        id: `pay_${randomUUID()}`,
        amount: body.amount as number,
        currency,
        reference: body.reference,
        status: 'requires_payment',
        fee: 0,
        refunded: 0,
        at: Date.now(),
      };
      payments.set(payment.id, payment);
      return { status: 201, body: { ...payment, payUrl: `https://provider.test/pay/${payment.id}` } };
    }
    if (resource === 'refunds') {
      const payment = payments.get(String(body.payment));
      if (!payment || payment.status !== 'succeeded') return { status: 400, body: { error: 'no such paid payment' } };
      const currency = currencyOf(body.currency);
      if (currency !== payment.currency)
        return {
          status: 400,
          body: { error: `the payment is in ${payment.currency}, not ${String(body.currency ?? 'EUR')}` },
        };
      const pending = [...refunds.values()]
        .filter(each => each.payment === payment.id && each.status === 'pending')
        .reduce((sum, each) => sum + each.amount, 0);
      if (!int(body.amount) || (body.amount as number) > payment.amount - payment.refunded - pending)
        return { status: 400, body: { error: 'amount exceeds what is left to refund' } };
      const refund: ProviderRefund = {
        id: `re_${randomUUID()}`,
        payment: payment.id,
        amount: body.amount as number,
        currency,
        reference: String(body.reference ?? payment.reference),
        status: 'pending',
        at: Date.now(),
      };
      refunds.set(refund.id, refund);
      later(() => settleRefund(refund.id));
      return { status: 201, body: refund };
    }
    if (resource === 'payouts') {
      const account = accounts.get(String(body.account));
      if (!account || account.status !== 'enabled')
        return { status: 400, body: { error: 'the account is not enabled' } };
      const currency = currencyOf(body.currency);
      if (!int(body.amount) || typeof body.reference !== 'string')
        return { status: 400, body: { error: 'amount and reference are required' } };
      if (!currency) return { status: 400, body: { error: `no such currency: ${String(body.currency)}` } };
      const payout: ProviderPayout = {
        id: `po_${randomUUID()}`,
        account: account.id,
        amount: body.amount as number,
        currency,
        reference: body.reference,
        status: 'pending',
        at: Date.now(),
      };
      payouts.set(payout.id, payout);
      later(() => settlePayout(payout.id));
      return { status: 201, body: payout };
    }
    return { status: 404, body: { error: 'no such route' } };
  };

  const server: Server = createServer((request, response) => {
    let raw = '';
    request.on('data', chunk => (raw += chunk));
    request.on('end', () => {
      if (request.headers.authorization !== `Bearer ${key}`) return refuse(response, 401, 'a valid key is required');
      let body: Json = {};
      try {
        body = raw ? (JSON.parse(raw) as Json) : {};
      } catch {
        return refuse(response, 400, 'the body is not JSON');
      }
      const idempotency = request.headers['idempotency-key'];
      const replayKey = typeof idempotency === 'string' ? `${request.url} ${idempotency}` : undefined;
      if (replayKey && replays.has(replayKey)) {
        const replayed = replays.get(replayKey)!;
        return answer(response, replayed.status, replayed.body);
      }
      const result = handle(request, body);
      if (replayKey && result.status < 500) replays.set(replayKey, result);
      return answer(response, result.status, result.body);
    });
  });
  const listening = new Promise<string>(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)),
  );

  const paymentFor = (reference: string) => [...payments.values()].filter(each => each.reference === reference);

  return {
    /** The variables a server is started with. */
    environment: async (): Promise<Record<string, string>> => ({
      PAYMENT_PROVIDER_URL: await listening,
      PAYMENT_PROVIDER_KEY: key,
      PAYMENT_WEBHOOK_SECRET: secret,
    }),
    /** Where to send webhooks: the server on `port`, from now on. */
    attach: (port: number) => (state.target = `http://127.0.0.1:${port}/v1/payments/webhook`),
    state,
    accounts,
    payments,
    refunds,
    payouts,
    transactions,
    feeQueries,
    events,
    deliveries,
    paymentFor,
    /** The provider's account behind the onboarding URL OpenStay gave a host (request 26). */
    accountAt: (onboardingUrl: string) => [...accounts.values()].find(each => onboardingUrl.includes(each.id)),
    /** The provider enables or disables an account, and says so. */
    account: (id: string, status: 'enabled' | 'disabled') => {
      const account = accounts.get(id);
      if (!account) throw new Error(`no account ${id}`);
      account.status = status;
      return emit('account.updated', { ...account });
    },
    /** The traveller pays at the provider: the payment succeeds. */
    pay: (id: string) => {
      const payment = payments.get(id);
      if (!payment) throw new Error(`no payment ${id}`);
      if (payment.status === 'succeeded') return;
      payment.status = 'succeeded';
      payment.fee = feeOf(payment.amount, payment.currency);
      record('charge', payment.amount, payment.reference, payment.id, payment.currency);
      record('fee', -payment.fee, payment.reference, payment.id, payment.currency);
      return emit('payment.succeeded', { ...payment });
    },
    /** The provider asks the traveller to authenticate. */
    requireAction: (id: string) => {
      const payment = payments.get(id)!;
      payment.status = 'requires_action';
      return emit('payment.requires_action', { ...payment, actionUrl: `https://provider.test/authenticate/${id}` });
    },
    /** The payment fails. */
    fail: (id: string) => {
      const payment = payments.get(id)!;
      payment.status = 'failed';
      return emit('payment.failed', { ...payment, reason: 'card_declined' });
    },
    /** A dispute opened by the traveller's bank on a paid payment, then closed. */
    dispute: (id: string) => {
      const payment = payments.get(id)!;
      return emit('dispute.created', {
        id: `dp_${randomUUID()}`,
        payment: id,
        amount: payment.amount,
        currency: payment.currency,
      });
    },
    closeDispute: (dispute: Webhook, outcome: 'won' | 'lost') => {
      const data = dispute.data as { id: string; payment: string; amount: number; currency: Currency };
      if (outcome === 'lost')
        record('dispute', -data.amount, payments.get(data.payment)!.reference, data.id, data.currency);
      return emit('dispute.closed', { ...data, outcome });
    },
    settleRefund,
    settlePayout,
    /** A transaction the platform never asked for, as reconciliation must find (request 37), in `currency` (87). */
    inject: (type: Transaction['type'], amount: number, reference: string, currency: Currency = 'EUR') =>
      record(type, amount, reference, 'manual', currency),
    /** Sends what was held, in the order given (the held order when none is given). */
    flush: (order?: (held: Webhook[]) => Webhook[]) => {
      state.holding = false;
      const held = queue.splice(0);
      for (const event of order ? order(held) : held) send(event);
    },
    /** Sends an event again, as a provider does when it is unsure it was received. */
    resend: (event: Webhook) => send(event),
    /**
     * Sends what was held all at once, without waiting for one answer before the next, spread over the
     * servers on `ports` in turn: many successes at the same moment, across servers (request 46).
     */
    burst: (ports: number[]) => {
      state.holding = false;
      const held = queue.splice(0);
      return Promise.all(
        held.map((event, n) => deliver(event, `http://127.0.0.1:${ports[n % ports.length]}/v1/payments/webhook`)),
      ).then(() => undefined);
    },
    /**
     * Sends a webhook once, signed with the right secret as of `age` seconds ago, and gives the answer's
     * status: a valid one when `age` is 0, one too old to be believed past 300 (request 26).
     */
    signed: async (type: string, data: Json, age = 0) => {
      const created = Math.floor(Date.now() / 1000) - age;
      const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, created, data });
      const reply = await fetch(state.target!, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'provider-signature': sign(secret, created, body) },
        body,
      });
      return reply.status;
    },
    /** Sends a webhook with a signature that does not match, or none. */
    forge: async (type: string, data: Json, signature?: string) => {
      const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, created: Math.floor(Date.now() / 1000), data });
      const reply = await fetch(state.target!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature !== undefined && { 'provider-signature': signature }),
        },
        body,
      });
      return reply.status;
    },
    /** Waits until every webhook decided so far was delivered (or given up). */
    settled: () => sending,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
export type Provider = ReturnType<typeof paymentProvider>;

/** Opens a host's payout account through OpenStay (request 26), and gives the provider's account behind it. */
export async function openAccount(api: Client, provider: Provider, token: string): Promise<ProviderAccount> {
  await api.done('POST', '/hosts/me/payout-account', token);
  const { onboardingUrl } = await api.read('/hosts/me/payout-account', token);
  const account = provider.accountAt(String(onboardingUrl));
  if (!account) throw new Error(`the provider has no account behind ${String(onboardingUrl)}`);
  return account;
}

/** Opens a host's payout account, has the provider enable it, and waits until OpenStay reads it enabled. */
export async function enabledAccount(api: Client, provider: Provider, token: string): Promise<ProviderAccount> {
  const account = await openAccount(api, provider, token);
  provider.account(account.id, 'enabled');
  const read = await eventually(
    () => api.read('/hosts/me/payout-account', token),
    each => each.status === 'enabled',
  );
  if (read.status !== 'enabled') throw new Error(`the payout account reads ${String(read.status)}`);
  return account;
}

/**
 * Pays a booking as its traveller does (request 27): asks OpenStay to pay, pays at the provider, and
 * waits until OpenStay reads the booking paid. Gives the provider's payment.
 */
export async function payBooking(
  api: Client,
  provider: Provider,
  token: string,
  bookingId: string,
): Promise<ProviderPayment> {
  await api.done('POST', `/bookings/${bookingId}/pay`, token);
  const payment = provider.paymentFor(bookingId).find(each => each.status !== 'failed');
  if (!payment) throw new Error(`OpenStay asked the provider for no payment of ${bookingId}`);
  provider.pay(payment.id);
  const booking = await eventually(
    () => api.read(`/bookings/${bookingId}`, token),
    each => (each.payment as Json | null)?.status === 'paid',
  );
  if ((booking.payment as Json | null)?.status !== 'paid') throw new Error(`${bookingId} never read paid`);
  return payment;
}
