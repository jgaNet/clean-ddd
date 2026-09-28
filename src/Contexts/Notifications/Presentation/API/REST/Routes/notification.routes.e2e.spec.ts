import superagent from 'superagent';

import { startTestApplication, TestApplication } from '@Bootstrap/Fastify/application.spec-helper';

let app: TestApplication;
let api: string;
beforeAll(async () => {
  app = await startTestApplication();
  api = app.api;
});
afterAll(() => app.stop());

const login = (identifier: string, password: string) =>
  superagent.post(`${api}/auth/login`).send({ identifier, password });

describe('Notifications: an inbox', () => {
  let admin: ReturnType<typeof superagent.agent>;
  let carol: ReturnType<typeof superagent.agent>;
  let carolId: string;

  beforeAll(async () => {
    admin = superagent.agent().set('authorization', `Bearer ${(await login('admin@admin.fr', 'admin')).body.token}`);

    // Carol's sign-up and validation each produce one email notification for her.
    const signUp = await superagent
      .post(`${api}/auth/signup`)
      .send({ identifier: 'carol@notes.fr', password: 'carol' });
    const operation = await admin.get(`${api}/tracker/operations/${signUp.body.operationId}`);
    carolId = operation.body.result;
    await admin.get(`${api}/auth/accounts/${carolId}/validate`);

    carol = superagent.agent().set('authorization', `Bearer ${(await login('carol@notes.fr', 'carol')).body.token}`);
  });

  it('lists what was delivered to the recipient, unread first', async () => {
    const inbox = await carol.get(`${api}/notifications/account/${carolId}`);

    expect(inbox.status).toBe(200);
    expect(inbox.body).toMatchObject({ total: 2, unread: 2 });
    expect(
      inbox.body.notifications.map((n: { status: string; deliveredVia: string }) => [n.status, n.deliveredVia]),
    ).toEqual([
      ['SENT', 'EMAIL'],
      ['SENT', 'EMAIL'],
    ]);
    expect(inbox.body.notifications[0]).not.toHaveProperty('attempts');
  });

  it('lets the recipient mark a notification read, once', async () => {
    const inbox = await carol.get(`${api}/notifications/account/${carolId}`);
    const [first] = inbox.body.notifications;

    const accepted = await carol.patch(`${api}/notifications/${first.id}/read`);
    expect(accepted.status).toBe(202);

    // (her own command also produced one outcome notice, undelivered without a websocket: FAILED, not unread)
    const after = await carol.get(`${api}/notifications/account/${carolId}`);
    expect(after.body).toMatchObject({ unread: 1 });
    expect(after.body.notifications.find((n: { id: string }) => n.id === first.id)).toMatchObject({
      status: 'READ',
      readAt: expect.any(String),
    });

    const again = await carol.patch(`${api}/notifications/${first.id}/read`);
    const operation = await admin.get(`${api}/tracker/operations/${again.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NotificationAlreadyRead' } });
  });

  it('keeps an inbox private', async () => {
    let status: number | undefined;
    await superagent
      .agent()
      .set('authorization', `Bearer ${(await login('admin@admin.fr', 'admin')).body.token}`)
      .get(`${api}/notifications/account/${carolId}`)
      .then(res => (status = res.status));
    expect(status).toBe(200); // an administrator may read any inbox

    const stranger = await superagent
      .post(`${api}/auth/signup`)
      .send({ identifier: 'dave@notes.fr', password: 'dave' });
    const daveId = (await admin.get(`${api}/tracker/operations/${stranger.body.operationId}`)).body.result;
    await admin.get(`${api}/auth/accounts/${daveId}/validate`);
    const dave = superagent.agent().set('authorization', `Bearer ${(await login('dave@notes.fr', 'dave')).body.token}`);

    let refused: number | undefined;
    await dave.get(`${api}/notifications/account/${carolId}`).catch(err => (refused = err.status));
    expect(refused).toBe(403);
  });
});
