import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent, { ResponseError } from 'superagent';

const baseUrl = `${SETTINGS.protocol}://${SETTINGS.baseUrl}:${SETTINGS.port}`;

describe('Login', () => {
  it('should return 200', async () => {
    const res = await superagent
      .post(`${baseUrl}/auth/login`)
      .send({ identifier: 'admin@admin.fr', password: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('should return 401', async () => {
    try {
      await superagent.post(`${baseUrl}/auth/login`).send({ identifier: 'error@admin.fr', password: 'admin' });
    } catch (e) {
      expect((e as ResponseError).status).toBe(401);
    }
  });
});

describe('SignUp', () => {
  let adminAgent: ReturnType<typeof superagent.agent>;
  beforeEach(async () => {
    const res = await superagent
      .post(`${baseUrl}/auth/login`)
      .send({ identifier: 'admin@admin.fr', password: 'admin' });
    adminAgent = superagent.agent().set('authorization', `Bearer ${res.body.token}`);
  });

  it('should return 200 with a failed operation', async () => {
    const res = await superagent
      .post(`${baseUrl}/auth/account/signup`)
      .send({ identifier: 'admin@admin.fr', password: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.operationId).toEqual(expect.any(String));

    const adminCheckRes = await adminAgent.get(`${baseUrl}/tracker/operations/${res.body.operationId}`);
    expect(adminCheckRes.body.status).toBe('ERROR');
  });

  it('should return 200 with a successful operation', async () => {
    const res = await superagent
      .post(`${baseUrl}/auth/account/signup`)
      .send({ identifier: 'user@user.fr', password: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.operationId).toEqual(expect.any(String));

    const adminCheckRes = await adminAgent.get(`${baseUrl}/tracker/operations/${res.body.operationId}`);
    expect(adminCheckRes.body.status).toBe('SUCCESS');
  });
});
