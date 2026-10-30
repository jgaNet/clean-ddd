import { acceptance } from './support';

/** Feature 3 of the benchmark backlog: tags on a note. */
const { client, stop } = acceptance();
afterAll(stop);

describe('tags on a note', () => {
  it('adds and removes tags, in the order they were added, and lists the notes carrying one', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('tags@acceptance.test');
    const plain = await note(owner.token, 'Plain');
    const work = await note(owner.token, 'Work');
    const both = await note(owner.token, 'Both');

    expect(await command('POST', `/notes/${work}/tags`, owner.token, { tag: 'work' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${both}/tags`, owner.token, { tag: 'urgent' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${both}/tags`, owner.token, { tag: 'work' })).toBe('SUCCESS');

    expect((await call('GET', `/notes/${both}`, owner.token)).body).toEqual(
      expect.objectContaining({ tags: ['urgent', 'work'] }),
    );
    const all = await list('/notes', owner.token);
    expect(all.find(each => each.id === plain)).toEqual(expect.objectContaining({ tags: [] }));
    expect((await list('/notes?tag=work', owner.token)).map(each => each.id)).toEqual([both, work]);
    expect(await list('/notes?tag=nothing', owner.token)).toEqual([]);

    expect(await command('DELETE', `/notes/${both}/tags/work`, owner.token)).toBe('SUCCESS');
    expect((await call('GET', `/notes/${both}`, owner.token)).body).toEqual(
      expect.objectContaining({ tags: ['urgent'] }),
    );
    expect((await list('/notes?tag=work', owner.token)).map(each => each.id)).toEqual([work]);
  });

  it('refuses what is not a tag, a tag twice, an eleventh tag, removing a tag the note lacks, and another account', async () => {
    const { command, account, note } = client();
    const owner = await account('tag-rules@acceptance.test');
    const stranger = await account('tag-stranger@acceptance.test');
    const id = await note(owner.token, 'Rules');

    for (const tag of ['Work', 'two words', '', 'x'.repeat(31), 'café']) {
      expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag })).toBe('ERROR');
    }
    expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag: 'x'.repeat(30) })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag: 'x'.repeat(30) })).toBe('ERROR');
    for (let index = 1; index < 10; index++) {
      expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag: `tag-${index}` })).toBe('SUCCESS');
    }
    expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag: 'eleventh' })).toBe('ERROR');
    expect(await command('DELETE', `/notes/${id}/tags/absent`, owner.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/tags`, stranger.token, { tag: 'mine' })).toBe('ERROR');
    expect(await command('DELETE', `/notes/${id}/tags/tag-1`, stranger.token)).toBe('ERROR');
  });

  it('refuses to tag or untag an archived note until it is restored', async () => {
    const { command, account, note } = client();
    const owner = await account('tag-archived@acceptance.test');
    const id = await note(owner.token, 'Archived');
    expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag: 'kept' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/tags`, owner.token, { tag: 'more' })).toBe('ERROR');
    expect(await command('DELETE', `/notes/${id}/tags/kept`, owner.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/restore`, owner.token)).toBe('SUCCESS');
    expect(await command('DELETE', `/notes/${id}/tags/kept`, owner.token)).toBe('SUCCESS');
  });
});
