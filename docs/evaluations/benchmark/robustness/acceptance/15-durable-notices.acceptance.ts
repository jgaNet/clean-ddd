import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { archivedNotices, client, eventually, freePort, Json, kill, sleep, start, stop } from './robustness';

/**
 * Feature 15 of the robustness campaign: notices survive a crash. The server is killed the way a
 * power cut would kill it, once at the moment the request names (FAULT_DRILL) and then at random
 * moments, and started again on the same file: every archiving that was recorded is told to each
 * recipient once, and one that was not is told to nobody.
 */
const directory = mkdtempSync(join(tmpdir(), 'durable-notices-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('notices survive a crash', () => {
  it('tells, after a restart, the archiving recorded just before the server died, and tells it once', async () => {
    const database = join(directory, 'drill.sqlite');
    const port = await freePort();
    const { call, command, login, account, note, list } = client(port);
    let server = await start(port, database, { FAULT_DRILL: 'after-archive' });
    let owner: { id: string; email: string; token: string };
    let recipients: { id: string; email: string; token: string }[];
    let noteId: string;
    try {
      owner = await account('owner@drill.test');
      recipients = [await account('bob@drill.test'), await account('carl@drill.test')];
      noteId = await note(owner.token, 'Drill');
      for (const recipient of recipients) {
        expect((await command('POST', `/notes/${noteId}/share`, owner.token, { accountId: recipient.id })).status).toBe(
          'SUCCESS',
        );
      }
      // The server may die before it answers: the request says it dies right after the archiving
      // is stored, and a tree that stores it inside the request has not answered yet.
      const archiving = await call('POST', `/notes/${noteId}/archive`, owner.token).then(
        answer => answer.status,
        () => 'cut off',
      );
      expect([202, 'cut off']).toContain(archiving);
      const died = await Promise.race([server.exited.then(() => true), sleep(15000).then(() => false)]);
      expect(died).toBe(true);
    } finally {
      await kill(server);
    }

    server = await start(port, database);
    try {
      const ownerToken = await login(owner.email);
      const archived = await eventually(
        async () => (await call('GET', `/notes/${noteId}`, ownerToken)).body,
        body => body?.archived === true,
      );
      expect(archived.archived).toBe(true);
      for (const recipient of recipients) {
        const token = await login(recipient.email);
        const told = await eventually(
          async () => archivedNotices(await list('/notifications', token), noteId),
          found => found.length >= 1,
        );
        expect(told).toHaveLength(1);
      }
      await sleep(1500);
      for (const recipient of recipients) {
        expect(archivedNotices(await list('/notifications', await login(recipient.email)), noteId)).toHaveLength(1);
      }
      expect(archivedNotices(await list('/notifications', ownerToken), noteId)).toHaveLength(0);

      await stop(server);
      server = await start(port, database);
      await sleep(1500);
      for (const recipient of recipients) {
        expect(archivedNotices(await list('/notifications', await login(recipient.email)), noteId)).toHaveLength(1);
      }
    } finally {
      await stop(server);
    }
  }, 180000);

  it('after kills at random moments, tells each archiving once, or never if it did not happen', async () => {
    const database = join(directory, 'chaos.sqlite');
    const port = await freePort();
    const { call, command, login, account, note, list } = client(port);
    // A fixed seed, so that two gradings kill at the same delays; the moment the server reaches
    // is still the machine's.
    let seed = 1234567;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const rounds: { owner: string; noteId: string }[] = [];
    let server = await start(port, database);
    let bob = await account('bob@chaos.test');
    try {
      for (let round = 0; round < 12; round++) {
        const owner = await account(`owner${round}@chaos.test`);
        const noteId = await note(owner.token, `Chaos ${round}`);
        expect((await command('POST', `/notes/${noteId}/share`, owner.token, { accountId: bob.id })).status).toBe(
          'SUCCESS',
        );
        rounds.push({ owner: owner.email, noteId });
        expect((await call('POST', `/notes/${noteId}/archive`, owner.token)).status).toBe(202);
        await sleep(Math.floor(random() * 40));
        await kill(server);
        server = await start(port, database);
        bob = { ...bob, token: await login(bob.email) };
      }

      const archivedOf = async (round: { owner: string; noteId: string }) =>
        (await call('GET', `/notes/${round.noteId}`, await login(round.owner))).body?.archived === true;
      const consistent = async () => {
        const notifications = await list('/notifications', bob.token);
        const seen: Json[] = [];
        for (const round of rounds) {
          seen.push({
            noteId: round.noteId,
            archived: await archivedOf(round),
            notices: archivedNotices(notifications, round.noteId).length,
          });
        }
        return seen;
      };
      const final = await eventually(consistent, seen => seen.every(each => each.notices === (each.archived ? 1 : 0)));
      expect(final.filter(each => each.notices !== (each.archived ? 1 : 0))).toEqual([]);
    } finally {
      await stop(server);
    }
  }, 300000);
});
