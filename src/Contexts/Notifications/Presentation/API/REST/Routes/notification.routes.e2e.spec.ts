import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import superagent from 'superagent';

const login = (identifier: string, password: string) =>
  superagent.post(`${SETTINGS.apiUrl}/auth/login`).send({ identifier, password });

describe('Notifications: an inbox', () => {
  let admin: ReturnType<typeof superagent.agent>;
  let carol: ReturnType<typeof superagent.agent>;
  let carolId: string;

  beforeAll(async () => {
    admin = superagent.agent().set('authorization', `Bearer ${(await login('admin@admin.fr', 'admin')).body.token}`);

    // Carol's sign-up and validation each produce one email notification for her.
    const signUp = await superagent
      .post(`${SETTINGS.apiUrl}/auth/signup`)
      .send({ identifier: 'carol@notes.fr', password: 'carol' });
    const operation = await admin.get(`${SETTINGS.apiUrl}/tracker/operations/${signUp.body.operationId}`);
    carolId = operation.body.result;
    await admin.get(`${SETTINGS.apiUrl}/auth/accounts/${carolId}/validate`);

    carol = superagent.agent().set('authorization', `Bearer ${(await login('carol@notes.fr', 'carol')).body.token}`);
  });

  it('lists what was delivered to the recipient, unread first', async () => {
    const inbox = await carol.get(`${SETTINGS.apiUrl}/notifications/account/${carolId}`);

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
    const inbox = await carol.get(`${SETTINGS.apiUrl}/notifications/account/${carolId}`);
    const [first] = inbox.body.notifications;

    const accepted = await carol.patch(`${SETTINGS.apiUrl}/notifications/${first.id}/read`);
    expect(accepted.status).toBe(202);

    // (her own command also produced one outcome notice, undelivered without a websocket: FAILED, not unread)
    const after = await carol.get(`${SETTINGS.apiUrl}/notifications/account/${carolId}`);
    expect(after.body).toMatchObject({ unread: 1 });
    expect(after.body.notifications.find((n: { id: string }) => n.id === first.id)).toMatchObject({
      status: 'READ',
      readAt: expect.any(String),
    });

    const again = await carol.patch(`${SETTINGS.apiUrl}/notifications/${first.id}/read`);
    const operation = await admin.get(`${SETTINGS.apiUrl}/tracker/operations/${again.body.operationId}`);
    expect(operation.body).toMatchObject({ status: 'ERROR', error: { type: 'NotificationAlreadyRead' } });
  });

  it('keeps an inbox private', async () => {
    let status: number | undefined;
    await superagent
      .agent()
      .set('authorization', `Bearer ${(await login('admin@admin.fr', 'admin')).body.token}`)
      .get(`${SETTINGS.apiUrl}/notifications/account/${carolId}`)
      .then(res => (status = res.status));
    expect(status).toBe(200); // an administrator may read any inbox

    const stranger = await superagent
      .post(`${SETTINGS.apiUrl}/auth/signup`)
      .send({ identifier: 'dave@notes.fr', password: 'dave' });
    const daveId = (await admin.get(`${SETTINGS.apiUrl}/tracker/operations/${stranger.body.operationId}`)).body.result;
    await admin.get(`${SETTINGS.apiUrl}/auth/accounts/${daveId}/validate`);
    const dave = superagent.agent().set('authorization', `Bearer ${(await login('dave@notes.fr', 'dave')).body.token}`);

    let refused: number | undefined;
    await dave.get(`${SETTINGS.apiUrl}/notifications/account/${carolId}`).catch(err => (refused = err.status));
    expect(refused).toBe(403);
  });
});
