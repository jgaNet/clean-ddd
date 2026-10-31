import { Json, server } from './security';

/**
 * Probe S3 of the security audit: every route that names a note, called on someone else's note by
 * a stranger, by nobody, and (for what only an owner does) by an account the note is shared with.
 * Each must be refused, and the note must read afterwards exactly as before.
 */
let audited: Awaited<ReturnType<typeof server>>;
beforeAll(async () => {
  audited = await server('object-access');
}, 120000);
afterAll(() => audited?.close());

const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();

/** Every route of features 1–7 that acts on one note, with a body that would change it. */
const routes = (id: string, stranger: string): [string, string, Json | undefined][] => [
  ['GET', `/notes/${id}`, undefined],
  ['PUT', `/notes/${id}`, { title: 'Changed by someone else', text: 'changed' }],
  ['POST', `/notes/${id}/pin`, undefined],
  ['POST', `/notes/${id}/tags`, { tag: 'intruder' }],
  ['DELETE', `/notes/${id}/tags/kept`, undefined],
  ['POST', `/notes/${id}/share`, { accountId: stranger }],
  ['POST', `/notes/${id}/reminders`, { remindAt: inAnHour() }],
  ['POST', `/notes/${id}/archive`, undefined],
];

/** The note as its owner reads it, without the fields that change by themselves. */
const state = (note: Json) => ({
  title: note.title,
  text: note.text,
  archived: note.archived,
  pinned: note.pinned,
  tags: note.tags,
  sharedWith: note.sharedWith,
  remindAt: note.remindAt,
});

describe('access to a note by its identifier', () => {
  it("refuses a stranger and nobody on every route of another account's note, and changes nothing", async () => {
    const { command, account, note, read, ids, refused } = audited;
    const ada = await account('ada@security.test');
    const bob = await account('bob@security.test');
    const id = await note(ada.token, 'Ada only', 'private');
    expect((await command('POST', `/notes/${id}/tags`, ada.token, { tag: 'kept' })).status).toBe('SUCCESS');
    const before = state(await read(ada.token, id));

    const granted: string[] = [];
    for (const [method, path, body] of routes(id, bob.id)) {
      if (!(await refused(method, path, bob.token, body))) granted.push(`stranger: ${method} ${path}`);
      if (!(await refused(method, path, undefined, body))) granted.push(`nobody: ${method} ${path}`);
    }
    expect(granted).toEqual([]);
    expect(state(await read(ada.token, id))).toEqual(before);
    expect(await ids('/notes', bob.token)).not.toContain(id);
    expect(await ids('/notes/shared', bob.token)).not.toContain(id);
    expect(await ids('/notifications', bob.token)).not.toContain(id);
  }, 180000);

  it('lets an account a note is shared with read it, and refuses it what only the owner does', async () => {
    const { command, account, note, read, refused } = audited;
    const owner = await account('owner@security.test');
    const reader = await account('reader@security.test');
    const outsider = await account('outsider@security.test');
    const id = await note(owner.token, 'Shared to read', 'read only');
    expect((await command('POST', `/notes/${id}/tags`, owner.token, { tag: 'kept' })).status).toBe('SUCCESS');
    expect((await command('POST', `/notes/${id}/share`, owner.token, { accountId: reader.id })).status).toBe('SUCCESS');
    const before = state(await read(owner.token, id));
    expect((await read(reader.token, id)).title).toBe('Shared to read');

    const granted: string[] = [];
    // What feature 4 says a recipient cannot do: edit, archive, pin, tag or share. Reminders it does not say.
    const ownersOnly = routes(id, outsider.id).filter(
      ([method, path]) => method !== 'GET' && !path.endsWith('/reminders'),
    );
    for (const [method, path, body] of ownersOnly)
      if (!(await refused(method, path, reader.token, body))) granted.push(`reader: ${method} ${path}`);
    expect(granted).toEqual([]);
    expect(state(await read(owner.token, id))).toEqual(before);
  }, 180000);
});
