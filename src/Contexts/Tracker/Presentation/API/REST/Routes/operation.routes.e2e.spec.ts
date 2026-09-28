import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

let admin: ReturnType<typeof superagent.agent>;
beforeEach(async () => {
  const res = await superagent
    .post(`${SETTINGS.apiUrl}/auth/login`)
    .send({ identifier: 'admin@admin.fr', password: 'admin' });
  admin = superagent.agent().set('authorization', `Bearer ${res.body.token}`);
});

// Sharing a note that does not exist is refused by the domain: a command that leaves no trace
// in Notes, but a full one in Tracker.
const shareUnknownNote = () =>
  admin.post(`${SETTINGS.apiUrl}/notes/00000000-0000-4000-8000-000000000000/share`).send({ recipientId: 'bob' });

describe('Tracker: following an operation', () => {
  it('records a command up to its outcome, in client words, without the execution context', async () => {
    const accepted = await shareUnknownNote();
    expect(accepted.status).toBe(202);

    const operation = await admin.get(`${SETTINGS.apiUrl}/tracker/operations/${accepted.body.operationId}`);
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

    const byTrace = await admin
      .get(`${SETTINGS.apiUrl}/tracker/operations`)
      .query({ traceId: accepted.headers['x-trace-id'] });
    expect(byTrace.status).toBe(200);
    expect(byTrace.body.map((record: { name: string; status: string }) => [record.name, record.status])).toEqual([
      ['ShareNoteCommandEvent', 'ERROR'],
    ]);
  });
});
