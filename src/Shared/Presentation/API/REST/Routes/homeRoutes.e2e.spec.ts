import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

const baseUrl = `${SETTINGS.protocol}://${SETTINGS.baseUrl}:${SETTINGS.port}`;

describe('GET /', () => {
  it('should return 200', async () => {
    const res = await superagent.get(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      version: SETTINGS.version,
    });
  });
});
