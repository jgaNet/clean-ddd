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

  it('should list the created note', async () => {
    const res = await agent.get(`${SETTINGS.apiUrl}/notes`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      title: 'title',
      status: 'ACTIVE',
    });
  });

  it('should return the created note in full', async () => {
    const list = await agent.get(`${SETTINGS.apiUrl}/notes`);
    const res = await agent.get(`${SETTINGS.apiUrl}/notes/${list.body[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: list.body[0].id,
      title: 'title',
      status: 'ACTIVE',
      ownerId: expect.any(String),
      content: 'content',
      sharedWith: [],
    });
  });
});

describe('POST notes/:id/archive', () => {
  it('should archive the note', async () => {
    const list = await agent.get(`${SETTINGS.apiUrl}/notes`);
    const res = await agent.post(`${SETTINGS.apiUrl}/notes/${list.body[0].id}/archive`);
    expect(res.status).toBe(202);

    const after = await agent.get(`${SETTINGS.apiUrl}/notes/${list.body[0].id}`);
    expect(after.body.status).toBe('ARCHIVED');
  });
});

describe('GET notes/:id', () => {
  it('should return 404 for an unknown note', async () => {
    let status: number | undefined;
    await agent.get(`${SETTINGS.apiUrl}/notes/does-not-exist`).catch(err => (status = err.status));
    expect(status).toBe(404);
  });
});
