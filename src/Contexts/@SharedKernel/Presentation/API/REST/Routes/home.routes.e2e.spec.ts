import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

describe('GET /', () => {
  it('should return 200', async () => {
    const res = await superagent.get(`${SETTINGS.apiUrl}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: SETTINGS.name,
      version: SETTINGS.version,
    });
  });
});
