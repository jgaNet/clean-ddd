import { acceptance } from './support';

/** Feature 11 of the extended backlog: editors. */
const { client, stop } = acceptance();
afterAll(stop);

describe('editors', () => {
  it('lets an editor write, restore and comment, and says who edited', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('editors-owner@acceptance.test');
    const editor = await account('editors-editor@acceptance.test');
    const id = await note(owner.token, 'Shared draft', 'v1');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: editor.id, role: 'editor' })).toBe(
      'SUCCESS',
    );

    const seen = (await call('GET', `/notes/${id}`, owner.token)).body;
    expect(seen.editors).toEqual([editor.id]);
    expect(seen.sharedWith).toEqual([editor.id]);

    expect(await command('PUT', `/notes/${id}`, editor.token, { title: 'Shared draft', text: 'v2' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/comments`, editor.token, { text: 'Edited it' })).toBe('SUCCESS');
    const versions = await list(`/notes/${id}/versions`, editor.token);
    expect(versions.map(each => [each.version, each.text, each.editedBy])).toEqual([[1, 'v1', editor.id]]);
    expect(await command('POST', `/notes/${id}/versions/1/restore`, editor.token)).toBe('SUCCESS');
    expect((await call('GET', `/notes/${id}`, editor.token)).body).toMatchObject({ text: 'v1' });
  });

  it('keeps an editor from what only the owner does, and a reader from writing', async () => {
    const { command, account, note } = client();
    const owner = await account('editors-limits@acceptance.test');
    const editor = await account('editors-limited@acceptance.test');
    const reader = await account('editors-reader@acceptance.test');
    const other = await account('editors-other@acceptance.test');
    const id = await note(owner.token, 'Limits');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: editor.id, role: 'editor' })).toBe(
      'SUCCESS',
    );
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: reader.id })).toBe('SUCCESS');

    expect(await command('PUT', `/notes/${id}`, reader.token, { title: 'No', text: '' })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/archive`, editor.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/pin`, editor.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/tags`, editor.token, { tag: 'mine' })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/share`, editor.token, { accountId: other.id })).toBe('ERROR');
    const remindAt = new Date(Date.now() + 3_600_000).toISOString();
    expect(await command('POST', `/notes/${id}/reminders`, editor.token, { remindAt })).toBe('ERROR');
  });

  it('changes a role when the owner shares again', async () => {
    const { call, command, account, note } = client();
    const owner = await account('editors-again@acceptance.test');
    const friend = await account('editors-friend@acceptance.test');
    const id = await note(owner.token, 'Roles');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: friend.id })).toBe('SUCCESS');
    expect(await command('PUT', `/notes/${id}`, friend.token, { title: 'Roles', text: 'no' })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: friend.id, role: 'editor' })).toBe(
      'SUCCESS',
    );
    expect(await command('PUT', `/notes/${id}`, friend.token, { title: 'Roles', text: 'yes' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: friend.id, role: 'reader' })).toBe(
      'SUCCESS',
    );
    expect(await command('PUT', `/notes/${id}`, friend.token, { title: 'Roles', text: 'no again' })).toBe('ERROR');
    expect((await call('GET', `/notes/${id}`, owner.token)).body).toMatchObject({
      editors: [],
      sharedWith: [friend.id],
    });
  });
});
