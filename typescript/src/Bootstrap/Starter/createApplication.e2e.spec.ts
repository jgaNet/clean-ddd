import { DomainEvent } from '@Architecture/Domain';
import {
  FreshDatabase,
  freshDatabase,
  TEST_POSTGRES,
} from '@Architecture/Infrastructure/Postgres/FreshDatabase.spec-helper';
import { PostgresDatabase } from '@Architecture/Infrastructure/Postgres/PostgresDatabase';
import { PostgresOutbox } from '@Architecture/Infrastructure/Postgres/PostgresOutbox';

import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { apiClient } from '@Bootstrap/Fastify/api.spec-helper';

import { createApplication } from './createApplication';

/**
 * How an end-to-end suite boots the application: in this process, on a free port, with fresh
 * in-memory stores, spoken to over HTTP as a client would, through the client that holds every
 * answer to the API `api/` gives; one application per suite, shared by its tests in order. A
 * context's suite sits beside its routes, as `<thing>.routes.e2e.spec.ts`.
 */
let app: FastifyApplication;
let http: ReturnType<typeof apiClient>;
let api: string;
beforeAll(async () => {
  app = await createApplication();
  await app.start(0);
  http = apiClient(app.address);
  api = `/${app.apiPrefix}`;
});
afterAll(() => app.stop());

/** A fact nobody subscribes to, published as a context would: the Tracker records what the bus carries. */
class StarterChecked extends DomainEvent<{ at: string }> {}

describe('the application a project starts from', () => {
  it('serves the Tracker under the prefix, to an anonymous caller, with the trace of the request', async () => {
    const traceId = '11111111-1111-4111-8111-111111111111';
    const answer = await http.get(`${api}/tracker/operations/00000000-0000-4000-8000-000000000000`, {
      headers: { 'x-trace-id': traceId },
    });

    // An operation is followed by whoever started it; nobody started this one, and an anonymous
    // caller is told to sign in (401, API-CALLER-AT-TRANSPORT) rather than whether it exists.
    expect(answer.status).toBe(401);
    expect(answer.body).toEqual({ message: expect.any(String) });
    expect(answer.headers.get('x-trace-id')).toBe(traceId);
  });

  it('lists operations for an administrator only', async () => {
    expect((await http.get(`${api}/tracker/operations`)).status).toBe(401);
  });

  it('answers an operation nobody started to whoever holds its id, as the contract records it', async () => {
    const operation = app
      .getEventBus()
      .publish(StarterChecked.set({ at: new Date().toISOString() }), app.executionContext('starter-trace'));

    const answer = await http.get(`${api}/tracker/operations/${operation.id}`);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ id: operation.id, name: 'StarterChecked', traceId: 'starter-trace' });
  });
});

/**
 * The promise ADR 24 makes, held across a restart: a fact made durable by a transaction that the
 * process died before relaying is published once, by the next process, with the id it was made
 * durable under. Nothing in a single process can show it, which is why no suite did until J6: the
 * server is stopped and started again on the same database. Needs the server `TEST_POSTGRES`
 * names; skipped, and said so, without one.
 */
(TEST_POSTGRES ? describe : describe.skip)('the application, restarted on its database', () => {
  let fresh: FreshDatabase;
  let database: PostgresDatabase;
  beforeAll(async () => {
    fresh = await freshDatabase('starter-restart');
    database = new PostgresDatabase(fresh.url, { max: 2 });
  });
  afterAll(async () => {
    await database.close();
    await fresh.drop();
  });

  it('publishes once, at start, what the previous run made durable and did not publish', async () => {
    // The first run: a transaction commits a fact to the outbox, and the process dies before the
    // relay runs (what a crash between the commit and the publication leaves behind).
    const first = await createApplication({ databaseUrl: fresh.url });
    await first.start(0);
    const unitOfWork = first.executionContext('first-run').unitOfWork!;
    await unitOfWork.beginTransaction();
    const [entry] = await unitOfWork.outbox.append([StarterChecked.set({ at: 'before the crash' })]);
    await unitOfWork.commitTransaction();
    const path = `/${first.apiPrefix}/tracker/operations/${entry.id}`;
    expect((await apiClient(first.address).get(path)).status).toBe(401); // nothing was published yet
    await first.stop();

    // The second run, on the same database: the start relays it, under the entry's id, and the
    // Tracker — which records what the bus carries — answers the operation to whoever holds it.
    const second = await createApplication({ databaseUrl: fresh.url });
    await second.start(0);
    const answer = await apiClient(second.address).get(`/${second.apiPrefix}/tracker/operations/${entry.id}`);
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ id: entry.id, name: 'StarterChecked', traceId: 'startup' });
    // Acknowledged once its reactions have committed: a third start has nothing left to relay.
    expect(await new PostgresOutbox(database).pending()).toEqual([]);
    await second.stop();
  });
});
