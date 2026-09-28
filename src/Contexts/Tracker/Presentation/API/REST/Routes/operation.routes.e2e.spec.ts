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
      payload: { noteId: '00000000-0000-4000-8000-000000000000', recipientId: 'bob' },
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
