import { acceptance, eventually, sleep } from './support';

/** Feature 7 of the benchmark backlog: remind a note at a time. */
const { client, stop } = acceptance();
afterAll(stop);
/** A reminder is waited for in real time: each test may take a few seconds. */
const SLOW = 30_000;

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
const reminders = (list: Record<string, unknown>[]) => list.filter(each => each.kind === 'reminder');

describe('remind a note at a time', () => {
  it(
    'tells the owner once the moment has come, and nobody else',
    async () => {
      const { call, command, account, note, list } = client();
      const owner = await account('remind@acceptance.test');
      const bob = await account('bob@acceptance.test');
      const id = await note(owner.token, 'Call back');
      expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: bob.id })).toBe('SUCCESS');

      const remindAt = inMs(1500);
      expect(await command('POST', `/notes/${id}/reminders`, owner.token, { remindAt })).toBe('SUCCESS');
      expect(Date.parse(String((await call('GET', `/notes/${id}`, owner.token)).body.remindAt))).toBe(
        Date.parse(remindAt),
      );
      expect(reminders(await list('/notifications', owner.token))).toEqual([]);

      await sleep(1700);
      const told = await eventually(
        async () => reminders(await list('/notifications', owner.token)),
        found => found.length === 1,
      );
      expect(told).toEqual([
        { id: expect.any(String), kind: 'reminder', noteId: id, noteTitle: 'Call back', remindAt: expect.any(String) },
      ]);
      expect(Date.parse(String(told[0].remindAt))).toBe(Date.parse(remindAt));
      expect(reminders(await list('/notifications', bob.token))).toEqual([]);

      // Archived after its moment: it was told, and stays.
      expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
      await sleep(200);
      expect(reminders(await list('/notifications', owner.token))).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'replaces a reminder scheduled again, and cancels it when the note is archived',
    async () => {
      const { call, command, account, note, list } = client();
      const owner = await account('replace@acceptance.test');
      const replaced = await note(owner.token, 'Replaced');
      expect(await command('POST', `/notes/${replaced}/reminders`, owner.token, { remindAt: inMs(1000) })).toBe(
        'SUCCESS',
      );
      const later = inMs(60_000);
      expect(await command('POST', `/notes/${replaced}/reminders`, owner.token, { remindAt: later })).toBe('SUCCESS');
      expect(Date.parse(String((await call('GET', `/notes/${replaced}`, owner.token)).body.remindAt))).toBe(
        Date.parse(later),
      );

      const cancelled = await note(owner.token, 'Cancelled');
      expect(await command('POST', `/notes/${cancelled}/reminders`, owner.token, { remindAt: inMs(1000) })).toBe(
        'SUCCESS',
      );
      expect(await command('POST', `/notes/${cancelled}/archive`, owner.token)).toBe('SUCCESS');

      await sleep(1500);
      expect(reminders(await list('/notifications', owner.token))).toEqual([]);
      expect((await call('GET', `/notes/${replaced}`, owner.token)).body).toEqual(
        expect.objectContaining({ remindAt: expect.any(String) }),
      );
      const plain = await note(owner.token, 'No reminder');
      expect((await call('GET', `/notes/${plain}`, owner.token)).body).toEqual(
        expect.objectContaining({ remindAt: null }),
      );
    },
    SLOW,
  );

  it(
    'refuses a moment in the past, an archived note, and another account',
    async () => {
      const { command, account, note } = client();
      const owner = await account('refuse@acceptance.test');
      const stranger = await account('stranger@acceptance.test');
      const id = await note(owner.token, 'Rules');
      expect(await command('POST', `/notes/${id}/reminders`, owner.token, { remindAt: inMs(-60_000) })).toBe('ERROR');
      expect(await command('POST', `/notes/${id}/reminders`, stranger.token, { remindAt: inMs(60_000) })).toBe('ERROR');
      expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
      expect(await command('POST', `/notes/${id}/reminders`, owner.token, { remindAt: inMs(60_000) })).toBe('ERROR');
    },
    SLOW,
  );

  it(
    'keeps one list, most recent first: an archiving by when it happened, a reminder by its moment',
    async () => {
      const { command, account, note, list } = client();
      const alice = await account('alice@acceptance.test');
      const bob = await account('bob-mixed@acceptance.test');
      const own = await note(bob.token, 'Own');
      expect(await command('POST', `/notes/${own}/reminders`, bob.token, { remindAt: inMs(800) })).toBe('SUCCESS');
      await sleep(1000);
      const given = await note(alice.token, 'Given');
      expect(await command('POST', `/notes/${given}/share`, alice.token, { accountId: bob.id })).toBe('SUCCESS');
      expect(await command('POST', `/notes/${given}/archive`, alice.token)).toBe('SUCCESS');

      const both = await eventually(
        () => list('/notifications', bob.token),
        found => found.length === 2,
      );
      expect(both.map(each => each.kind)).toEqual(['note-archived', 'reminder']);
    },
    SLOW,
  );
});
