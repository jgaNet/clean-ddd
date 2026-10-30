import { acceptance, eventually, sleep } from './support';

/** Feature 5 of the benchmark backlog: notify recipients when a shared note is archived. */
const { client, stop } = acceptance();
afterAll(stop);

describe('notify on archive', () => {
  it('tells every account a note is shared with, once per archiving, and nobody else', async () => {
    const { command, account, note, list } = client();
    const [owner, bob, carl, stranger] = await Promise.all(
      ['owner@acceptance.test', 'bob@acceptance.test', 'carl@acceptance.test', 'stranger@acceptance.test'].map(email =>
        account(email),
      ),
    );
    const noteId = await note(owner.token, 'Plan', 'the plan');
    for (const recipient of [bob, carl]) {
      expect(await command('POST', `/notes/${noteId}/share`, owner.token, { accountId: recipient.id })).toBe('SUCCESS');
    }
    expect(await command('POST', `/notes/${noteId}/archive`, owner.token)).toBe('SUCCESS');

    for (const recipient of [bob, carl]) {
      const notifications = await eventually(
        () => list('/notifications', recipient.token),
        found => found.length === 1,
      );
      expect(notifications).toEqual([
        { id: expect.any(String), kind: 'note-archived', noteId, noteTitle: 'Plan', archivedAt: expect.any(String) },
      ]);
      expect(Number.isNaN(Date.parse(String(notifications[0].archivedAt)))).toBe(false);
    }
    expect(await list('/notifications', owner.token)).toEqual([]);
    expect(await list('/notifications', stranger.token)).toEqual([]);

    expect(await command('POST', `/notes/${noteId}/restore`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${noteId}/archive`, owner.token)).toBe('SUCCESS');
    const twice = await eventually(
      () => list('/notifications', bob.token),
      found => found.length === 2,
    );
    expect(twice).toHaveLength(2);
    expect(Date.parse(String(twice[0].archivedAt))).toBeGreaterThanOrEqual(Date.parse(String(twice[1].archivedAt)));
    expect(twice[0].id).not.toEqual(twice[1].id);
  });

  it('notifies nobody for a note shared with nobody', async () => {
    const { command, account, note, list } = client();
    const [owner, bob] = await Promise.all(
      ['alone@acceptance.test', 'bob2@acceptance.test'].map(email => account(email)),
    );
    const id = await note(owner.token, 'Mine');
    expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
    await sleep(200);
    expect(await list('/notifications', owner.token)).toEqual([]);
    expect(await list('/notifications', bob.token)).toEqual([]);
  });

  it('refuses an anonymous caller', async () => {
    expect((await client().call('GET', '/notifications')).status).toBe(403);
  });
});
