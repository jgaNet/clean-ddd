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

describe('POST notes/:id/suggest-title (ADR 7: a suggestion enters the domain as a value)', () => {
  it('applies the suggestion the note accepts and keeps its provenance on the operation', async () => {
    await agent.post(`${api}/notes`).send({ title: 'Untitled', content: 'Groceries for Saturday\nmilk, eggs' });
    const mine = await agent.get(`${api}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Untitled').id;

    const accepted = await agent.post(`${api}/notes/${noteId}/suggest-title`);
    expect(accepted.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${accepted.body.operationId}`);
    expect(operation.body.status).toBe('SUCCESS');
    expect(operation.body.result).toEqual({
      title: 'Groceries for Saturday',
      provenance: { source: 'heuristic', version: 'first-line/1', at: expect.any(String) },
    });
    expect((await agent.get(`${api}/notes/${noteId}`)).body.title).toBe('Groceries for Saturday');
  });

  it('lets the note refuse a suggestion that breaks its rules', async () => {
    const tooLong = 'x'.repeat(120);
    await agent.post(`${api}/notes`).send({ title: 'Long first line', content: `${tooLong}\nsecond line` });
    const mine = await agent.get(`${api}/notes`);
    const noteId: string = mine.body.find((note: { title: string }) => note.title === 'Long first line').id;

    const accepted = await agent.post(`${api}/notes/${noteId}/suggest-title`);
    const operation = await agent.get(`${api}/tracker/operations/${accepted.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NoteTitleTooLong' } });
    expect((await agent.get(`${api}/notes/${noteId}`)).body.title).toBe('Long first line');
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

describe('Bookmarks', () => {
  // A fresh account, so the suite's earlier state does not matter: dave owns one note and was shared another.
  let dave: ReturnType<typeof superagent.agent>;
  let ownNoteId: string;
  let sharedNoteId: string;
  let hiddenNoteId: string;

  beforeAll(async () => {
    const daveId = await app.signUpValidated('dave@notes.fr', 'dave');
    dave = await app.agentAs('dave@notes.fr', 'dave');

    await dave.post(`${api}/notes`).send({ title: 'Todo', content: 'Call mum' });
    ownNoteId = (await dave.get(`${api}/notes`)).body[0].id;

    const admin = await app.admin();
    await admin.post(`${api}/notes`).send({ title: 'Recipes', content: 'Pancakes' });
    await admin.post(`${api}/notes`).send({ title: 'Hidden', content: 'Not for dave' });
    const admins = await admin.get(`${api}/notes`);
    sharedNoteId = admins.body.find((note: { title: string }) => note.title === 'Recipes').id;
    hiddenNoteId = admins.body.find((note: { title: string }) => note.title === 'Hidden').id;
    await admin.post(`${api}/notes/${sharedNoteId}/share`).send({ recipientId: daveId });
  });

  it('starts empty', async () => {
    const res = await dave.get(`${api}/notes/bookmarks`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('bookmarks an own note and a shared one, and lists them most recent first', async () => {
    const own = await dave.post(`${api}/notes/${ownNoteId}/bookmark`);
    expect(own.status).toBe(202);
    const shared = await dave.post(`${api}/notes/${sharedNoteId}/bookmark`);
    expect(shared.status).toBe(202);
    expect((await dave.get(`${api}/tracker/operations/${shared.body.operationId}`)).body.status).toBe('SUCCESS');

    const list = await dave.get(`${api}/notes/bookmarks`);
    expect(list.body).toEqual([
      { id: expect.any(String), noteId: sharedNoteId, title: 'Recipes', bookmarkedAt: expect.any(String) },
      { id: expect.any(String), noteId: ownNoteId, title: 'Todo', bookmarkedAt: expect.any(String) },
    ]);
  });

  it('refuses the same note twice, on the operation', async () => {
    const again = await dave.post(`${api}/notes/${sharedNoteId}/bookmark`);
    expect(again.status).toBe(202);

    const operation = await dave.get(`${api}/tracker/operations/${again.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NoteAlreadyBookmarked' } });
    expect((await dave.get(`${api}/notes/bookmarks`)).body).toHaveLength(2);
  });

  it('refuses a note the caller cannot see, as not found', async () => {
    const hidden = await dave.post(`${api}/notes/${hiddenNoteId}/bookmark`);

    const operation = await dave.get(`${api}/tracker/operations/${hidden.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NoteNotFound' } });
  });

  it('removes a bookmark, and only that one', async () => {
    const removed = await dave.delete(`${api}/notes/${sharedNoteId}/bookmark`);
    expect(removed.status).toBe(202);
    expect((await dave.get(`${api}/tracker/operations/${removed.body.operationId}`)).body.status).toBe('SUCCESS');

    const list = await dave.get(`${api}/notes/bookmarks`);
    expect(list.body.map((item: { noteId: string }) => item.noteId)).toEqual([ownNoteId]);

    const twice = await dave.delete(`${api}/notes/${sharedNoteId}/bookmark`);
    const operation = await dave.get(`${api}/tracker/operations/${twice.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'BookmarkNotFound' } });
  });

  it('keeps bookmarks per account: the admin sees none of dave’s', async () => {
    expect((await agent.get(`${api}/notes/bookmarks`)).body).toEqual([]);
  });

  it('requires a signed-in caller', async () => {
    let status: number | undefined;
    await superagent.get(`${api}/notes/bookmarks`).catch(err => (status = err.status));
    expect(status).toBe(403);
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
