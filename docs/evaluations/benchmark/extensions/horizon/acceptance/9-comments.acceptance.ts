import { acceptance } from './support';

/** Feature 9 of the extended backlog: comments on a note. */
const { client, stop } = acceptance();
afterAll(stop);

describe('comments', () => {
  it('lets the owner and the people a note is shared with comment, oldest first', async () => {
    const { call, outcome, command, account, note, list } = client();
    const owner = await account('comments-owner@acceptance.test');
    const reader = await account('comments-reader@acceptance.test');
    const id = await note(owner.token, 'Discussed');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: reader.id })).toBe('SUCCESS');

    const first = await outcome(
      await call('POST', `/notes/${id}/comments`, owner.token, { text: 'First' }),
      owner.token,
    );
    expect(first.status).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/comments`, reader.token, { text: 'Second' })).toBe('SUCCESS');

    const comments = await list(`/notes/${id}/comments`, reader.token);
    expect(comments.map(each => [each.authorId, each.text])).toEqual([
      [owner.id, 'First'],
      [reader.id, 'Second'],
    ]);
    expect(comments[0].id).toBe(first.result);
    expect(Object.keys(comments[0]).sort()).toEqual(['authorId', 'createdAt', 'id', 'text']);
  });

  it('refuses a blank or too long comment, a comment on an archived note, and strangers', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('comments-refusals@acceptance.test');
    const stranger = await account('comments-stranger@acceptance.test');
    const id = await note(owner.token, 'Guarded');

    expect(await command('POST', `/notes/${id}/comments`, owner.token, { text: '' })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/comments`, owner.token, { text: 'x'.repeat(501) })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/comments`, owner.token, { text: 'x'.repeat(500) })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/comments`, stranger.token, { text: 'Hi' })).toBe('ERROR');
    expect((await call('GET', `/notes/${id}/comments`, stranger.token)).status).toBe(404);
    expect((await call('GET', `/notes/${id}/comments`)).status).toBe(403);

    expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/comments`, owner.token, { text: 'Too late' })).toBe('ERROR');
    expect(await list(`/notes/${id}/comments`, owner.token)).toHaveLength(1);
  });
});
