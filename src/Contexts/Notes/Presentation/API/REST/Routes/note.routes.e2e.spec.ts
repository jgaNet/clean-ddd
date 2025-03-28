import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

let agent: ReturnType<typeof superagent.agent>;
beforeEach(async () => {
  const res = await superagent
    .post(`${SETTINGS.apiUrl}/auth/login`)
    .send({ identifier: 'admin@admin.fr', password: 'admin' });
  agent = superagent.agent().set('authorization', `Bearer ${res.body.token}`);
});

describe('GET notes/', () => {
  it('should return 200', async () => {
    const res = await agent.get(`${SETTINGS.apiUrl}/notes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST notes/', () => {
  it('should return 202', async () => {
    const res = await agent.post(`${SETTINGS.apiUrl}/notes`).send({ title: 'title', content: 'content' });
    expect(res.status).toBe(202);

    expect(res.body.operationId).toEqual(expect.any(String));
  });

  it('should return the created note', async () => {
    const res = await agent.get(`${SETTINGS.apiUrl}/notes`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      _id: expect.any(String),
      ownerId: expect.any(String),
      title: 'title',
      content: 'content',
    });
  });
});
