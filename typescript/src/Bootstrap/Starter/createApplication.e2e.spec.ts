import { DomainEvent } from '@Architecture/Domain';

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
