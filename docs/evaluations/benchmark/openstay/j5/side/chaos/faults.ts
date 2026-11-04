import { createHmac } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';

import { client, kill, start, stop } from '../../acceptance/openstay';
import type { Client, Json, Running } from '../../acceptance/openstay';
import { SECRET } from '../../acceptance/provider';
import type { Provider, Webhook } from '../../acceptance/provider';

/**
 * What the chaos suite adds to the acceptance support (side experiment "chaos on the money", J5 proposal):
 * a gate between a server and the provider the tests play, where a request a server sends can be held,
 * or answered by the provider and then never answered to the server, which is killed in between. The
 * provider is the acceptance support's, unchanged: the gate only forwards to it. It knows nothing of a
 * tree, and every assertion stays on the API the requests give, or on the provider's books.
 */

/** A request a server sent to the provider, as the gate saw it arrive. */
export interface Sent {
  /** The name of the gate's door it came through: one door per server (`gate.environment(name)`). */
  server: string;
  method: string;
  /** The path, without the query. */
  path: string;
  body: Json;
  /** The `Idempotency-Key` it carried, if any (request 26). */
  key: string | undefined;
  at: number;
}

interface Trap {
  match: (sent: Sent) => boolean;
  spent: boolean;
  act: (sent: Sent, request: IncomingMessage, raw: string, response: ServerResponse) => Promise<void>;
}

const parse = (text: string): Json => {
  try {
    return (text ? JSON.parse(text) : {}) as Json;
  } catch {
    return {};
  }
};

/** Resolves with what `promise` gives, or `undefined` once `ms` have passed. */
export const within = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), ms);
    void promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });

export const sum = (amounts: unknown[]) => amounts.reduce<number>((total, amount) => total + Number(amount), 0);

/**
 * A gate in front of `provider`. A server started with `await gate.environment('a')` talks to the
 * provider through its own door `a`; every request is forwarded as it came (its key, its
 * `Idempotency-Key`, its body) and the provider's answer given back, unless a trap set on the gate
 * catches it. A trap catches one request, the first that matches, on any door.
 */
export function providerGate(provider: Provider) {
  const sent: Sent[] = [];
  const traps: Trap[] = [];
  const servers: Server[] = [];
  const doors = new Map<string, Promise<string>>();

  const forward = async (request: IncomingMessage, raw: string) => {
    const upstream = (await provider.environment()).PAYMENT_PROVIDER_URL;
    const headers: Record<string, string> = {};
    for (const name of ['authorization', 'content-type', 'idempotency-key']) {
      const value = request.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const method = request.method ?? 'GET';
    const reply = await fetch(`${upstream}${request.url ?? '/'}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : raw,
    });
    return { status: reply.status, text: await reply.text() };
  };
  const answer = (response: ServerResponse, reply: { status: number; text: string }) => {
    try {
      response.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.text);
    } catch {
      // the server went away while its request was held
    }
  };

  const door = (name: string) => {
    if (!doors.has(name)) {
      const server = createServer((request, response) => {
        let raw = '';
        request.on('data', chunk => (raw += chunk));
        request.on('end', () => {
          const url = new URL(request.url ?? '/', 'http://gate');
          const key = request.headers['idempotency-key'];
          const entry: Sent = {
            server: name,
            method: request.method ?? 'GET',
            path: url.pathname,
            body: parse(raw),
            key: typeof key === 'string' ? key : undefined,
            at: Date.now(),
          };
          sent.push(entry);
          const trap = traps.find(each => !each.spent && each.match(entry));
          if (trap) {
            trap.spent = true;
            void trap.act(entry, request, raw, response).catch(() => response.destroy());
            return;
          }
          forward(request, raw).then(
            reply => answer(response, reply),
            () => response.destroy(),
          );
        });
      });
      servers.push(server);
      doors.set(
        name,
        new Promise<string>(resolve =>
          server.listen(0, '127.0.0.1', () =>
            resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`),
          ),
        ),
      );
    }
    return doors.get(name)!;
  };

  return {
    /** The variables of a server that talks to the provider through the door `name` (one per server). */
    environment: async (name: string): Promise<Record<string, string>> => ({
      ...(await provider.environment()),
      PAYMENT_PROVIDER_URL: await door(name),
    }),
    /** Every request the servers sent, in the order they arrived. */
    sent,
    /** The `POST`s to `path` (`/payments`, `/refunds`, `/payouts`) whose body matches `body`. */
    posts: (path: string, body: (body: Json) => boolean = () => true) =>
      sent.filter(each => each.method === 'POST' && each.path === path && body(each.body)),
    /**
     * A crash between the provider's answer and the write that records it: the first request that
     * matches reaches the provider, which does what it asks and answers; then `crash` runs (a kill of
     * the server it came from, told by `sent.server`), and the server never gets the answer.
     * `tripped` gives the request and the provider's answer once the crash is over.
     */
    crashAfter: (match: (sent: Sent) => boolean, crash: (sent: Sent) => Promise<void>) => {
      let trip!: (value: { sent: Sent; answer: Json }) => void;
      const tripped = new Promise<{ sent: Sent; answer: Json }>(resolve => (trip = resolve));
      const trap: Trap = {
        match,
        spent: false,
        act: async (entry, request, raw, response) => {
          const reply = await forward(request, raw);
          await crash(entry);
          response.destroy();
          trip({ sent: entry, answer: parse(reply.text) });
        },
      };
      traps.push(trap);
      return { tripped, spent: () => trap.spent };
    },
    /**
     * The first request that matches waits at the gate, not yet at the provider, until `release()`:
     * a sweep caught mid-way. `arrived` gives it when it comes. `release()` forwards it and gives the
     * provider's answer; with `crash`, the server is killed once the provider answered, and never
     * gets the answer.
     */
    hold: (match: (sent: Sent) => boolean) => {
      let arrive!: (sent: Sent) => void;
      const arrived = new Promise<Sent>(resolve => (arrive = resolve));
      let go!: (crash: ((sent: Sent) => Promise<void>) | undefined) => void;
      const going = new Promise<((sent: Sent) => Promise<void>) | undefined>(resolve => (go = resolve));
      let done!: (answer: Json) => void;
      const answered = new Promise<Json>(resolve => (done = resolve));
      const trap: Trap = {
        match,
        spent: false,
        act: async (entry, request, raw, response) => {
          arrive(entry);
          const crash = await going;
          const reply = await forward(request, raw);
          if (crash) {
            await crash(entry);
            response.destroy();
          } else answer(response, reply);
          done(parse(reply.text));
        },
      };
      traps.push(trap);
      return {
        arrived,
        spent: () => trap.spent,
        release: (crash?: (sent: Sent) => Promise<void>) => {
          go(crash);
          return answered;
        },
      };
    },
    close: () =>
      Promise.all(
        servers.map(
          server =>
            new Promise<void>(resolve => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
      ).then(() => undefined),
  };
}
export type Gate = ReturnType<typeof providerGate>;

/**
 * Delivers `event` to the server on `port`, once, signed now with the webhook secret, as the provider
 * delivers it (request 26): the same event, to a server the provider is not attached to, or again.
 * Gives the answer's status (0 when the server did not answer).
 */
export async function deliverTo(port: number, event: Webhook, secret = SECRET): Promise<number> {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  try {
    const reply = await fetch(`http://127.0.0.1:${port}/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'provider-signature': signature },
      body,
    });
    return reply.status;
  } catch {
    return 0;
  }
}

/** A server of a cluster: its door at the gate, its process, and a client for it. */
export interface Node {
  name: string;
  server: Running;
  api: Client;
}

/**
 * Servers on one database `path`, each through its own door of `gate` (its name), with `extra` added to
 * their environment. `attach(name)` sends the provider's webhooks to that server, and again to it each
 * time it is started again; `crash` kills the server a request came from, as a gate's trap is given.
 */
export function cluster(provider: Provider, gate: Gate, path: string, extra: Record<string, string> = {}) {
  const nodes = new Map<string, Node>();
  const all: Running[] = [];
  let attached: string | undefined;
  const node = (name: string) => {
    const found = nodes.get(name);
    if (!found) throw new Error(`no server ${name}`);
    return found;
  };
  return {
    /** Starts the server `name` (again, when it was killed): its client is new, its tokens must be asked again. */
    up: async (name: string) => {
      const server = await start(path, { ...(await gate.environment(name)), ...extra });
      all.push(server);
      const started = { name, server, api: client(server.port) };
      nodes.set(name, started);
      if (attached === name) provider.attach(server.port);
      return started;
    },
    node,
    attach: (name: string) => {
      attached = name;
      provider.attach(node(name).server.port);
    },
    /** Kills the server `sent` came through. */
    crash: (sent: Sent) => kill(node(sent.server).server),
    kill: (name: string) => kill(node(name).server),
    stop: async () => {
      for (const each of all) await stop(each);
    },
  };
}
export type Cluster = ReturnType<typeof cluster>;
