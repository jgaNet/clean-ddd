import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

const baseUrl = `${SETTINGS.protocol}://${SETTINGS.baseUrl}:${SETTINGS.port}`;

let agent: ReturnType<typeof superagent.agent>;
beforeEach(async () => {
  const res = await superagent.post(`${baseUrl}/auth/login`).send({ identifier: 'admin@admin.fr', password: 'admin' });
  agent = superagent.agent().set('authorization', `Bearer ${res.body.token}`);
});

describe('GET notes/', () => {
  it('should return 200', async () => {
    const res = await agent.get(`${baseUrl}/notes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST notes/', () => {
  it('should return 202', async () => {
    const res = await agent.post(`${baseUrl}/notes`).send({ title: 'title', content: 'content' });
    expect(res.status).toBe(202);

    expect(res.body.currentOperation).toEqual({
      id: expect.any(String),
    });
  });

  it('should return the created note', async () => {
    const res = await agent.get(`${baseUrl}/notes`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      _id: expect.any(String),
      ownerId: expect.any(String),
      title: 'title',
      content: 'content',
    });
  });
});
