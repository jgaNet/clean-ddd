import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { client, freePort, Running, start, stop } from './robustness';

/**
 * Feature 16 of the robustness campaign: changes that arrive at the same moment, in one process and
 * across two processes on one database file. Every change the application reports as done is kept;
 * a change it refuses changes nothing and says so. How many it refuses is recorded beside the
 * verdict, not graded.
 */
const directory = mkdtempSync(join(tmpdir(), 'concurrent-changes-'));
let server: Running | undefined;
let second: Running | undefined;
afterAll(async () => {
  if (server) await stop(server);
  if (second) await stop(second);
  rmSync(directory, { recursive: true, force: true });
});

const sorted = (values: unknown[]) => values.map(String).sort();

describe('changes at the same moment', () => {
  it('keeps every share it reports as done when twenty arrive at once', async () => {
    const port = await freePort();
    server = await start(port, join(directory, 'shares.sqlite'));
    const { call, command, account, note } = client(port);
    const owner = await account('owner@concurrent.test');
    const recipients = [];
    for (let index = 0; index < 20; index++) recipients.push(await account(`reader${index}@concurrent.test`));
    const noteId = await note(owner.token, 'Busy');

    const outcomes = await Promise.all(
      recipients.map(recipient => command('POST', `/notes/${noteId}/share`, owner.token, { accountId: recipient.id })),
    );
    expect(outcomes.every(outcome => outcome.status === 'SUCCESS' || outcome.status === 'ERROR')).toBe(true);
    const done = recipients.filter((_, index) => outcomes[index].status === 'SUCCESS').map(recipient => recipient.id);

    const { body } = await call('GET', `/notes/${noteId}`, owner.token);
    expect(sorted(body.sharedWith as unknown[])).toEqual(sorted(done));
    process.stdout.write(`robustness: ${20 - done.length} of 20 simultaneous shares refused\n`);
  }, 180000);

  it('keeps every share when two processes on one database receive them at once', async () => {
    const database = join(directory, 'two-processes.sqlite');
    const [firstPort, secondPort] = [await freePort(), await freePort()];
    if (server) await stop(server);
    server = await start(firstPort, database);
    second = await start(secondPort, database);
    const [first, other] = [client(firstPort), client(secondPort)];
    const owner = await first.account('owner@two.test');
    const recipients = [];
    for (let index = 0; index < 20; index++) recipients.push(await first.account(`reader${index}@two.test`));
    const noteId = await first.note(owner.token, 'Two processes');
    // What one process recorded, the other answers at once.
    const otherToken = await other.login(owner.email);
    expect((await other.call('GET', `/notes/${noteId}`, otherToken)).status).toBe(200);

    const outcomes = await Promise.all(
      recipients.map((recipient, index) =>
        index % 2 === 0
          ? first.command('POST', `/notes/${noteId}/share`, owner.token, { accountId: recipient.id })
          : other.command('POST', `/notes/${noteId}/share`, otherToken, { accountId: recipient.id }),
      ),
    );
    expect(outcomes.every(outcome => outcome.status === 'SUCCESS' || outcome.status === 'ERROR')).toBe(true);
    const done = recipients.filter((_, index) => outcomes[index].status === 'SUCCESS').map(recipient => recipient.id);
    for (const [each, token] of [
      [first, owner.token],
      [other, otherToken],
    ] as const) {
      const { body } = await each.call('GET', `/notes/${noteId}`, token);
      expect(sorted(body.sharedWith as unknown[])).toEqual(sorted(done));
    }
    process.stdout.write(`robustness: ${20 - done.length} of 20 shares across two processes refused\n`);
  }, 240000);

  it('keeps an edit and a share that arrive at the same moment', async () => {
    const port = await freePort();
    if (server) await stop(server);
    if (second) await stop(second);
    second = undefined;
    server = await start(port, join(directory, 'edits.sqlite'));
    const { call, command, account, note } = client(port);
    const owner = await account('editor@concurrent.test');
    const noteId = await note(owner.token, 'Draft', 'v0');
    const shared: string[] = [];
    let refused = 0;
    for (let round = 1; round <= 10; round++) {
      const reader = await account(`reader${round}@edits.test`);
      const [edit, share] = await Promise.all([
        command('PUT', `/notes/${noteId}`, owner.token, { title: 'Draft', text: `v${round}` }),
        command('POST', `/notes/${noteId}/share`, owner.token, { accountId: reader.id }),
      ]);
      if (share.status === 'SUCCESS') shared.push(reader.id);
      refused += Number(edit.status !== 'SUCCESS') + Number(share.status !== 'SUCCESS');
      const { body } = await call('GET', `/notes/${noteId}`, owner.token);
      if (edit.status === 'SUCCESS') expect(body.text).toBe(`v${round}`);
      expect(sorted(body.sharedWith as unknown[])).toEqual(sorted(shared));
    }
    process.stdout.write(`robustness: ${refused} of 20 simultaneous edits and shares refused\n`);
  }, 180000);
});
