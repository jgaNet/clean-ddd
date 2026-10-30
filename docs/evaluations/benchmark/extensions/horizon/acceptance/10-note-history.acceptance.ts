import { acceptance } from './support';

/** Feature 10 of the extended backlog: a note's history. */
const { client, stop } = acceptance();
afterAll(stop);

describe('a note’s history', () => {
  it('keeps every replaced content, most recent first, and restores one as an edit', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('history@acceptance.test');
    const id = await note(owner.token, 'One', 'first');
    expect(await command('PUT', `/notes/${id}`, owner.token, { title: 'Two', text: 'second' })).toBe('SUCCESS');
    expect(await command('PUT', `/notes/${id}`, owner.token, { title: 'Three', text: 'third' })).toBe('SUCCESS');

    const versions = await list(`/notes/${id}/versions`, owner.token);
    expect(versions.map(each => [each.version, each.title, each.text])).toEqual([
      [2, 'Two', 'second'],
      [1, 'One', 'first'],
    ]);
    expect(typeof versions[0].replacedAt).toBe('string');

    expect(await command('POST', `/notes/${id}/versions/1/restore`, owner.token)).toBe('SUCCESS');
    expect((await call('GET', `/notes/${id}`, owner.token)).body).toMatchObject({ title: 'One', text: 'first' });
    const after = await list(`/notes/${id}/versions`, owner.token);
    expect(after.map(each => [each.version, each.title])).toEqual([
      [3, 'Three'],
      [2, 'Two'],
      [1, 'One'],
    ]);
  });

  it('refuses an unknown version, an archived note, and anyone but the owner', async () => {
    const { call, command, account, note } = client();
    const owner = await account('history-refusals@acceptance.test');
    const reader = await account('history-reader@acceptance.test');
    const id = await note(owner.token, 'Kept');
    expect(await command('PUT', `/notes/${id}`, owner.token, { title: 'Changed', text: '' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: reader.id })).toBe('SUCCESS');

    expect(await command('POST', `/notes/${id}/versions/9/restore`, owner.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/versions/1/restore`, reader.token)).toBe('ERROR');
    expect((await call('GET', `/notes/${id}/versions`, reader.token)).status).toBe(404);
    expect((await call('GET', `/notes/${id}/versions`)).status).toBe(403);

    expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/versions/1/restore`, owner.token)).toBe('ERROR');
  });
});
