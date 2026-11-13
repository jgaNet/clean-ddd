import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { apiClient } from '@Bootstrap/Fastify/api.spec-helper';

import { createApplication } from './createApplication';

/**
 * How an end-to-end suite boots an application created Lite: in this process, on a free port, spoken to
 * over HTTP as a client would, through the client that holds every answer to the API `api/` gives; one
 * application per suite. A context's suite sits beside its routes, as `<things>.routes.e2e.spec.ts`, and
 * asserts what each route answers at once.
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

describe('the application a Lite project starts from', () => {
  it('serves under the prefix, with the trace of the request, and no context yet', async () => {
    const traceId = '11111111-1111-4111-8111-111111111111';
    const answer = await http.get(`${api}/no-such-route`, { headers: { 'x-trace-id': traceId } });

    // No context is registered: the transport answers, and nothing is routed.
    expect(answer.status).toBe(404);
    expect(answer.headers.get('x-trace-id')).toBe(traceId);
  });

  it('follows no operation: a Lite application has no Tracker', async () => {
    expect((await http.get(`${api}/tracker/operations`)).status).toBe(404);
  });
});
