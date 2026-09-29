import superagent from 'superagent';

import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

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
      pinned: false,
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
      pinned: false,
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

describe('Pinning a note', () => {
  const titlesOf = (list: { title: string }[]) => list.map(note => note.title);

  it('puts the pinned note first in my notes, and unpinning sends it back', async () => {
    await agent.post(`${api}/notes`).send({ title: 'Later', content: '...' });
    const before = await agent.get(`${api}/notes`);
    const noteId: string = before.body.find((note: { title: string }) => note.title === 'Later').id;
    expect(titlesOf(before.body).at(-1)).toBe('Later');

    const pin = await agent.post(`${api}/notes/${noteId}/pin`);
    expect(pin.status).toBe(202);

    const pinned = await agent.get(`${api}/notes`);
    expect(pinned.body[0]).toEqual({ id: noteId, title: 'Later', status: 'ACTIVE', pinned: true });
    expect(titlesOf(pinned.body).slice(1)).toEqual(titlesOf(before.body).slice(0, -1));

    const unpin = await agent.post(`${api}/notes/${noteId}/unpin`);
    expect(unpin.status).toBe(202);

    const after = await agent.get(`${api}/notes`);
    expect(titlesOf(after.body)).toEqual(titlesOf(before.body));
    expect(after.body.at(-1).pinned).toBe(false);
  });

  it('is refused on an archived note', async () => {
    const mine = await agent.get(`${api}/notes`);
    const archived = mine.body.find((note: { status: string }) => note.status === 'ARCHIVED');

    const pin = await agent.post(`${api}/notes/${archived.id}/pin`);
    expect(pin.status).toBe(202);

    const operation = await agent.get(`${api}/tracker/operations/${pin.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NoteArchived' } });

    const note = await agent.get(`${api}/notes/${archived.id}`);
    expect(note.body.pinned).toBe(false);
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
