import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';

import { createApplication } from './createApplication';

/**
 * How an end-to-end suite boots the application: in this process, on a free port, with fresh
 * in-memory stores, spoken to over HTTP as a client would; one application per suite, shared by
 * its tests in order. A context's suite sits beside its routes, as `<thing>.routes.e2e.spec.ts`.
 */
let app: FastifyApplication;
let api: string;
beforeAll(async () => {
  app = await createApplication();
  await app.start(0);
  api = `${app.address}/${app.apiPrefix}`;
});
afterAll(() => app.stop());

describe('the application a project starts from', () => {
  it('serves the Tracker under the prefix, to an anonymous caller, with the trace of the request', async () => {
    const traceId = '11111111-1111-4111-8111-111111111111';
    const response = await fetch(`${api}/tracker/operations/00000000-0000-4000-8000-000000000000`, {
      headers: { 'x-trace-id': traceId },
    });

    // An operation is followed by whoever started it; nobody started this one, and an anonymous
    // caller is told to sign in rather than whether it exists.
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(response.headers.get('x-trace-id')).toBe(traceId);
  });

  it('lists operations for an administrator only', async () => {
    expect((await fetch(`${api}/tracker/operations`)).status).toBe(403);
  });
});
