import superagent from 'superagent';

import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

// One application for the whole suite, shared by its tests in order: each case starts from what
// the earlier ones left (the admin's notes accumulate). Write a case relative to that state, or
// with a fresh account; never assume an empty store.
let app: TestApplication;
let api: string;
beforeAll(async () => {
  app = await startTestApplication();
  api = app.api;
});
afterAll(() => app.stop());

let agent: ReturnType<typeof superagent.agent>;
beforeEach(async () => {
  agent = await app.admin();
});

describe('GET notes/', () => {
  it('should return 200', async () => {
    const res = await agent.get(`${api}/notes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST notes/', () => {
  it('should return 202', async () => {
    const res = await agent.post(`${api}/notes`).send({ title: 'title', content: 'content' });
    expect(res.status).toBe(202);

    expect(res.body.operationId).toEqual(expect.any(String));
  });

  it('should list the created note', async () => {
    const res = await agent.get(`${api}/notes`);
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      title: 'title',
      status: 'ACTIVE',
    });
  });

  it('should return the created note in full', async () => {
    const list = await agent.get(`${api}/notes`);
    const res = await agent.get(`${api}/notes/${list.body[0].id}`);
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
    const list = await agent.get(`${api}/notes`);
    const res = await agent.post(`${api}/notes/${list.body[0].id}/archive`);
    expect(res.status).toBe(202);

    const after = await agent.get(`${api}/notes/${list.body[0].id}`);
    expect(after.body.status).toBe('ARCHIVED');
  });
});

describe('GET notes/:id', () => {
  it('should return 404 for an unknown note', async () => {
    let status: number | undefined;
    await agent.get(`${api}/notes/does-not-exist`).catch(err => (status = err.status));
    expect(status).toBe(404);
  });
});

describe('Sharing a note (Notes -> Notifications)', () => {
  it('notifies the recipient and lets them read the note', async () => {
    // A second, validated account: bob
    const signUp = await superagent.post(`${api}/auth/signup`).send({ identifier: 'bob@notes.fr', password: 'bob' });
    const signUpOperation = await agent.get(`${api}/tracker/operations/${signUp.body.operationId}`);
    const bobId: string = signUpOperation.body.result;
    await agent.get(`${api}/auth/accounts/${bobId}/validate`);

    // The admin writes a note and shares it with bob
    await agent.post(`${api}/notes`).send({ title: 'Roadmap', content: 'Q4 plans' });
    const mine = await agent.get(`${api}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Roadmap').id;

    const share = await agent.post(`${api}/notes/${noteId}/share`).send({ recipientId: bobId });
    expect(share.status).toBe(202);

    // Bob sees it among the notes shared with him, and was notified
    const bobLogin = await superagent.post(`${api}/auth/login`).send({ identifier: 'bob@notes.fr', password: 'bob' });
    const bob = superagent.agent().set('authorization', `Bearer ${bobLogin.body.token}`);

    const shared = await bob.get(`${api}/notes/shared`);
    expect(shared.body).toEqual([{ id: noteId, title: 'Roadmap', content: 'Q4 plans', ownerId: expect.any(String) }]);

    // (next to the welcome notifications his account creation and validation produced)
    const notifications = await bob.get(`${api}/notifications/account/${bobId}`);
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

describe('Archiving a shared note (Notes -> Notifications)', () => {
  it('tells the recipient the note is no longer available', async () => {
    // A fresh, validated account: carol
    const signUp = await superagent
      .post(`${api}/auth/signup`)
      .send({ identifier: 'carol@notes.fr', password: 'carol' });
    const signUpOperation = await agent.get(`${api}/tracker/operations/${signUp.body.operationId}`);
    const carolId: string = signUpOperation.body.result;
    await agent.get(`${api}/auth/accounts/${carolId}/validate`);

    // The admin writes a note, shares it with carol, then archives it
    await agent.post(`${api}/notes`).send({ title: 'Budget', content: 'Draft' });
    const mine = await agent.get(`${api}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Budget').id;
    await agent.post(`${api}/notes/${noteId}/share`).send({ recipientId: carolId });

    const archive = await agent.post(`${api}/notes/${noteId}/archive`);
    expect(archive.status).toBe(202);

    // Carol was told, next to the notifications her account creation, validation and the share produced
    const carolLogin = await superagent
      .post(`${api}/auth/login`)
      .send({ identifier: 'carol@notes.fr', password: 'carol' });
    const carol = superagent.agent().set('authorization', `Bearer ${carolLogin.body.token}`);

    const notifications = await carol.get(`${api}/notifications/account/${carolId}`);
    expect(notifications.body.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: carolId,
          title: 'A note shared with you is no longer available: Budget',
          metadata: expect.objectContaining({ noteId, source: 'Notes.NoteArchived' }),
        }),
      ]),
    );
  });

  it('tells nobody when the archived note was shared with nobody', async () => {
    await agent.post(`${api}/notes`).send({ title: 'Private', content: '...' });
    const mine = await agent.get(`${api}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Private').id;

    const archive = await agent.post(`${api}/notes/${noteId}/archive`);
    expect(archive.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${archive.body.operationId}`);
    expect(operation.body.status).toBe('SUCCESS');
  });
});

describe('Sharing a note with an unknown account', () => {
  it('is refused by the domain, through the port to Security', async () => {
    await agent.post(`${api}/notes`).send({ title: 'Secret', content: '...' });
    const mine = await agent.get(`${api}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Secret').id;

    const share = await agent
      .post(`${api}/notes/${noteId}/share`)
      .send({ recipientId: '00000000-0000-4000-8000-000000000000' });
    expect(share.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${share.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'RecipientNotFound' } });

    const note = await agent.get(`${api}/notes/${noteId}`);
    expect(note.body.sharedWith).toEqual([]);
  });
});
