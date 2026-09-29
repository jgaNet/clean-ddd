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

describe('Commenting on a shared note', () => {
  // A validated account of its own, so the case does not depend on what the earlier ones created.
  async function aValidatedAccount(identifier: string, password: string) {
    const signUp = await superagent.post(`${api}/auth/signup`).send({ identifier, password });
    const operation = await agent.get(`${api}/tracker/operations/${signUp.body.operationId}`);
    const id: string = operation.body.result;
    await agent.get(`${api}/auth/accounts/${id}/validate`);
    return { id, agent: await app.agentAs(identifier, password) };
  }

  let noteId: string;
  let carol: { id: string; agent: ReturnType<typeof superagent.agent> };
  let dave: { id: string; agent: ReturnType<typeof superagent.agent> };

  beforeAll(async () => {
    agent = await app.admin();
    carol = await aValidatedAccount('carol@notes.fr', 'carol');
    dave = await aValidatedAccount('dave@notes.fr', 'dave');

    await agent.post(`${api}/notes`).send({ title: 'Design review', content: 'Please have a look' });
    const mine = await agent.get(`${api}/notes`);
    noteId = mine.body.find((note: { title: string }) => note.title === 'Design review').id;
    await agent.post(`${api}/notes/${noteId}/share`).send({ recipientId: carol.id });
  });

  it('lets a recipient comment, and everyone with access read the comments', async () => {
    const res = await carol.agent.post(`${api}/notes/${noteId}/comments`).send({ text: 'Looks good to me' });
    expect(res.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'SUCCESS', result: expect.any(String) });

    const expected = [
      { id: operation.body.result, authorId: carol.id, text: 'Looks good to me', postedAt: expect.any(String) },
    ];
    const owner = await agent.get(`${api}/notes/${noteId}/comments`);
    expect(owner.status).toBe(200);
    expect(owner.body).toEqual(expected);

    const recipient = await carol.agent.get(`${api}/notes/${noteId}/comments`);
    expect(recipient.body).toEqual(expected);
  });

  it('refuses the owner as a commenter, on the operation', async () => {
    const res = await agent.post(`${api}/notes/${noteId}/comments`).send({ text: 'Thanks!' });
    expect(res.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NotNoteRecipient' } });
  });

  it('refuses a comment over 500 characters, on the operation', async () => {
    const res = await carol.agent.post(`${api}/notes/${noteId}/comments`).send({ text: 'x'.repeat(501) });
    expect(res.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${res.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NoteCommentTooLong' } });

    const comments = await agent.get(`${api}/notes/${noteId}/comments`);
    expect(comments.body).toHaveLength(1);
  });

  it('hides the comments from someone the note is not shared with', async () => {
    let status: number | undefined;
    await dave.agent.get(`${api}/notes/${noteId}/comments`).catch(err => (status = err.status));
    expect(status).toBe(404);
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
