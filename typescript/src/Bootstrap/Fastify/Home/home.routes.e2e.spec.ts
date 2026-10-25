import superagent from 'superagent';

import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

let app: TestApplication;
beforeAll(async () => {
  app = await startTestApplication();
});
afterAll(() => app.stop());

describe('GET /', () => {
  it('should return 200', async () => {
    const res = await superagent.get(app.api);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: SETTINGS.name,
      version: SETTINGS.version,
    });
  });
});

describe('A front end on another origin', () => {
  it('finds no page in the API: an unknown path is a 404', async () => {
    const root = app.api.replace(/\/v1$/, '');
    let status: number | undefined;
    await superagent.get(`${root}/me`).catch(err => (status = err.status));
    expect(status).toBe(404);
  });

  it('may call the API from an allowed origin, with a bearer token and the HTMX headers (CORS)', async () => {
    const preflight = await superagent
      .options(`${app.api}/auth/login`)
      .set('origin', 'http://web.test')
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'authorization,content-type,hx-request');
    expect([200, 204]).toContain(preflight.status);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://web.test');
    expect(preflight.headers['access-control-allow-headers']).toMatch(/authorization/i);

    const answer = await superagent.get(`${app.api}/health`).set('origin', 'http://web.test');
    expect(answer.headers['access-control-allow-origin']).toBe('http://web.test');
    expect(answer.headers['access-control-expose-headers']).toMatch(/x-trace-id/i);

    const other = await superagent.get(`${app.api}/health`).set('origin', 'http://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
