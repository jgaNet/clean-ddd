import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  archivedNotices,
  client,
  eventually,
  freePort,
  kill,
  notificationService,
  sleep,
  start,
  stop,
} from './robustness';

/**
 * Feature 17 of the robustness campaign: an outside notification service that refuses. Every
 * notification reaches it, sent again with the same body until it is accepted, never again once it
 * is, and still reaches it when the server was killed before it was accepted.
 */
const directory = mkdtempSync(join(tmpdir(), 'notification-service-'));
const service = notificationService(3);
afterAll(async () => {
  await service.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('the outside notification service', () => {
  it('sends every notification until the service accepts it, the same each time, and not after', async () => {
    const database = join(directory, 'service.sqlite');
    const port = await freePort();
    const url = await service.url();
    let server = await start(port, database, { NOTIFY_URL: url });
    const { command, login, account, note, list } = client(port);
    try {
      const owner = await account('owner@service.test');
      const recipients = [await account('bob@service.test'), await account('carl@service.test')];
      const noteId = await note(owner.token, 'Told outside');
      for (const recipient of recipients) {
        expect((await command('POST', `/notes/${noteId}/share`, owner.token, { accountId: recipient.id })).status).toBe(
          'SUCCESS',
        );
      }
      expect((await command('POST', `/notes/${noteId}/archive`, owner.token)).status).toBe('SUCCESS');

      for (const recipient of recipients) {
        const [notice] = await eventually(
          async () => archivedNotices(await list('/notifications', recipient.token), noteId),
          found => found.length === 1,
        );
        const id = String(notice.id);
        await eventually(
          async () => service.accepted.has(id),
          accepted => accepted,
          30000,
        );
        expect(service.accepted.get(id)).toEqual({ id, recipientId: recipient.id, kind: 'note-archived', noteId });
        const attempts = service.attemptsOf(id);
        expect(attempts.length).toBeGreaterThanOrEqual(4);
        for (const attempt of attempts) expect(attempt).toEqual(attempts[0]);
      }
      const settled = service.attempts.length;
      await sleep(6000);
      expect(service.attempts.length).toBe(settled);

      // A notification the service has not accepted yet when the server dies is sent after it starts again.
      service.state.accepting = false;
      const later = await note(owner.token, 'Told after a crash');
      expect(
        (await command('POST', `/notes/${later}/share`, owner.token, { accountId: recipients[0].id })).status,
      ).toBe('SUCCESS');
      expect((await command('POST', `/notes/${later}/archive`, owner.token)).status).toBe('SUCCESS');
      const [pending] = await eventually(
        async () => archivedNotices(await list('/notifications', recipients[0].token), later),
        found => found.length === 1,
      );
      const id = String(pending.id);
      await eventually(
        async () => service.attemptsOf(id).length,
        tried => tried >= 1,
        15000,
      );
      expect(service.accepted.has(id)).toBe(false);
      await kill(server);
      service.state.accepting = true;
      server = await start(port, database, { NOTIFY_URL: url });
      await eventually(
        async () => service.accepted.has(id),
        accepted => accepted,
        30000,
      );
      expect(service.accepted.get(id)).toEqual({
        id,
        recipientId: recipients[0].id,
        kind: 'note-archived',
        noteId: later,
      });
      expect(archivedNotices(await list('/notifications', await login(recipients[0].email)), later)).toHaveLength(1);
    } finally {
      await stop(server);
    }
  }, 240000);
});
