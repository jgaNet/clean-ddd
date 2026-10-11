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
