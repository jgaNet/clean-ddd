import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

const baseUrl = `${SETTINGS.protocol}://${SETTINGS.baseUrl}:${SETTINGS.port}`;

describe('POST /login', () => {
  it('should return 200', async () => {
    const res = await superagent
      .post(`${baseUrl}/auth/login`)
      .send({ identifier: 'admin@admin.fr', password: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
});
