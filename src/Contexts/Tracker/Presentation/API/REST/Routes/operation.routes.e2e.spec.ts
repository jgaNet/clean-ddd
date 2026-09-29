import superagent from 'superagent';

import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

let app: TestApplication;
let api: string;
beforeAll(async () => {
  app = await startTestApplication();
  api = app.api;
});
afterAll(() => app.stop());

let admin: ReturnType<typeof superagent.agent>;
beforeEach(async () => {
  admin = await app.admin();
});

// Sharing a note that does not exist is refused by the domain: a command that leaves no trace
// in Notes, but a full one in Tracker.
const shareUnknownNote = () =>
  admin.post(`${api}/notes/00000000-0000-4000-8000-000000000000/share`).send({ recipientId: 'bob' });

describe('Tracker: following an operation', () => {
  it('records a command up to its outcome, in client words, without the execution context', async () => {
    const accepted = await shareUnknownNote();
    expect(accepted.status).toBe(202);

    const operation = await admin.get(`${api}/tracker/operations/${accepted.body.operationId}`);
    expect(operation.status).toBe(200);
    expect(operation.body).toEqual({
      id: accepted.body.operationId,
      name: 'ShareNoteCommandEvent',
      status: 'ERROR',
      traceId: accepted.headers['x-trace-id'],
      subjectId: expect.any(String),
      error: { type: 'NoteNotFound', message: 'Note not found' },
      createdAt: expect.any(String),
      finishedAt: expect.any(String),
    });
    expect(operation.body).not.toHaveProperty('context');
  });

  it('lists operations for an administrator, by trace when asked', async () => {
    const accepted = await shareUnknownNote();

    const byTrace = await admin.get(`${api}/tracker/operations`).query({ traceId: accepted.headers['x-trace-id'] });
    expect(byTrace.status).toBe(200);

    // The trace holds the command and everything it set off: here the notifications telling
    // the caller how it went, whose own domain events are recorded too (never announced).
    const records: { name: string; status: string; traceId: string }[] = byTrace.body;
    expect(records.map(r => [r.name, r.status])).toContainEqual(['ShareNoteCommandEvent', 'ERROR']);
    expect(records.map(r => r.name)).toEqual(expect.arrayContaining(['NotificationFailedEvent']));
    expect(new Set(records.map(r => r.traceId))).toEqual(new Set([accepted.headers['x-trace-id']]));
  });
});

describe('Tracker: my operations', () => {
  type Listed = { name: string; status: string; subjectId: string; createdAt: string };

  // A fresh, validated user: bob. His sign-up was anonymous, so it is not among his operations.
  let bob: ReturnType<typeof superagent.agent>;
  let bobId: string;
  beforeAll(async () => {
    const validator = await app.admin(); // `admin` is set per test, not yet here
    const signUp = await superagent.post(`${api}/auth/signup`).send({ identifier: 'bob@tracker.fr', password: 'bob' });
    const signUpOperation = await validator.get(`${api}/tracker/operations/${signUp.body.operationId}`);
    bobId = signUpOperation.body.result;
    await validator.get(`${api}/auth/accounts/${bobId}/validate`);
    bob = await app.agentAs('bob@tracker.fr', 'bob');
  });

  it("lists a user's own operations, most recent first, and nobody else's", async () => {
    await shareUnknownNote(); // the admin's, not bob's
    const created = await bob.post(`${api}/notes`).send({ title: 'Mine', content: '...' });
    const failed = await bob.post(`${api}/notes/00000000-0000-4000-8000-000000000000/share`).send({ recipientId: 'x' });

    const mine = await bob.get(`${api}/tracker/operations/mine`);
    expect(mine.status).toBe(200);

    const records: Listed[] = mine.body;
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(new Set(records.map(r => r.subjectId))).toEqual(new Set([bobId]));
    expect(records.map(r => r.name)).toEqual(
      expect.arrayContaining(['CreateNoteCommandEvent', 'ShareNoteCommandEvent']),
    );
    expect(records.map(r => r.createdAt)).toEqual([...records.map(r => r.createdAt)].sort().reverse());
    expect(records.findIndex(r => r.name === 'ShareNoteCommandEvent')).toBeLessThan(
      records.findIndex(r => r.name === 'CreateNoteCommandEvent'),
    );
    expect(created.status).toBe(202);
    expect(failed.status).toBe(202);
  });

  it('narrows them down to the failed ones when asked', async () => {
    const failed = await bob.get(`${api}/tracker/operations/mine`).query({ status: 'ERROR' });
    expect(failed.status).toBe(200);

    const records: Listed[] = failed.body;
    expect(records.map(r => r.status)).toEqual(records.map(() => 'ERROR'));
    expect(records.map(r => r.name)).toContain('ShareNoteCommandEvent');
    expect(records.map(r => r.name)).not.toContain('CreateNoteCommandEvent');
  });

  it("gives an administrator their own list, not everyone's", async () => {
    const mine = await admin.get(`${api}/tracker/operations/mine`);
    expect(mine.status).toBe(200);

    const records: Listed[] = mine.body;
    expect(records.length).toBeGreaterThan(0);
    expect(records.map(r => r.subjectId)).not.toContain(bobId);
  });

  it('refuses an anonymous caller', async () => {
    let status: number | undefined;
    await superagent.get(`${api}/tracker/operations/mine`).catch(err => (status = err.status));
    expect(status).toBe(403);
  });
});
