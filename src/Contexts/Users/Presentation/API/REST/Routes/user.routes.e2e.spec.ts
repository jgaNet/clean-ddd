import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

const baseUrl = `${SETTINGS.protocol}://${SETTINGS.baseUrl}:${SETTINGS.port}`;

let agent: ReturnType<typeof superagent.agent>;
beforeEach(async () => {
  const res = await superagent.post(`${baseUrl}/auth/login`).send({ identifier: 'admin', password: 'admin' });
  agent = superagent.agent().set('authorization', `Bearer ${res.body.token}`);
});

describe('GET users/', () => {
  it('should return 200', async () => {
    const res = await agent.get(`${baseUrl}/users`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST users/', () => {
  it('should return 202', async () => {
    const res = await agent.post(`${baseUrl}/users`).send({ email: 'test@test.fr', nickname: 'manual-nickname' });
    expect(res.status).toBe(202);

    expect(res.body.currentOperation).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
      status: 'PENDING',
    });
  });

  it('should return the created user', async () => {
    const res = await agent.get(`${baseUrl}/users`);
    expect(res.status).toBe(200);
    expect(res.body[0].profile).toEqual({
      email: 'test@test.fr',
      nickname: 'manual-nickname',
    });
  });
});
