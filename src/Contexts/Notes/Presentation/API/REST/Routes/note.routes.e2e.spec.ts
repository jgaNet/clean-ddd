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

describe('Sharing a note (Notes -> Notifications)', () => {
  it('notifies the recipient and lets them read the note', async () => {
    // A second, validated account: bob
    const signUp = await superagent
      .post(`${SETTINGS.apiUrl}/auth/signup`)
      .send({ identifier: 'bob@notes.fr', password: 'bob' });
    const signUpOperation = await agent.get(`${SETTINGS.apiUrl}/tracker/operations/${signUp.body.operationId}`);
    const bobId: string = signUpOperation.body.result.data;
    await agent.get(`${SETTINGS.apiUrl}/auth/accounts/${bobId}/validate`);

    // The admin writes a note and shares it with bob
    await agent.post(`${SETTINGS.apiUrl}/notes`).send({ title: 'Roadmap', content: 'Q4 plans' });
    const mine = await agent.get(`${SETTINGS.apiUrl}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Roadmap').id;

    const share = await agent.post(`${SETTINGS.apiUrl}/notes/${noteId}/share`).send({ recipientId: bobId });
    expect(share.status).toBe(202);

    // Bob sees it among the notes shared with him, and was notified
    const bobLogin = await superagent
      .post(`${SETTINGS.apiUrl}/auth/login`)
      .send({ identifier: 'bob@notes.fr', password: 'bob' });
    const bob = superagent.agent().set('authorization', `Bearer ${bobLogin.body.token}`);

    const shared = await bob.get(`${SETTINGS.apiUrl}/notes/shared`);
    expect(shared.body).toEqual([{ id: noteId, title: 'Roadmap', content: 'Q4 plans', ownerId: expect.any(String) }]);

    // (next to the welcome notifications his account creation and validation produced)
    const notifications = await bob.get(`${SETTINGS.apiUrl}/notifications/account/${bobId}`);
    expect(notifications.body.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: bobId,
          title: 'A note was shared with you: Roadmap',
          metadata: expect.objectContaining({ noteId, source: 'Notes.NoteShared' }),
        }),
      ]),
    );
  });
});
