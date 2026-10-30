import { acceptance, eventually } from './support';

/** Feature 12 of the extended backlog: deleting an account. */
const { client, stop } = acceptance();
afterAll(stop);

describe('deleting an account', () => {
  it('takes the account’s notes, comments, shares, notifications and plan with it', async () => {
    const { call, command, account, note, list } = client();
    const leaving = await account('leaving@acceptance.test');
    const staying = await account('staying@acceptance.test');

    const theirs = await note(leaving.token, 'Leaving with me');
    expect(await command('POST', `/notes/${theirs}/share`, leaving.token, { accountId: staying.id })).toBe('SUCCESS');
    const mine = await note(staying.token, 'Staying');
    expect(await command('POST', `/notes/${mine}/share`, staying.token, { accountId: leaving.id, role: 'editor' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${mine}/comments`, leaving.token, { text: 'Bye' })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${mine}/comments`, staying.token, { text: 'Stay' })).toBe('SUCCESS');
    expect(await command('PUT', '/plans/me', leaving.token, { plan: 'unlimited' })).toBe('SUCCESS');

    expect(await command('DELETE', '/accounts/me', leaving.token)).toBe('SUCCESS');

    expect((await call('GET', '/accounts/me', leaving.token)).status).toBe(403);
    expect((await call('POST', '/accounts/login', undefined, { email: 'leaving@acceptance.test', password: 'secret123' })).status).toBe(401);
    const shared = await eventually(
      () => list('/notes/shared', staying.token),
      notes => !notes.some(each => each.id === theirs),
    );
    expect(shared.map(each => each.id)).not.toContain(theirs);
    const seen = await eventually(
      async () => (await call('GET', `/notes/${mine}`, staying.token)).body,
      body => Array.isArray(body.sharedWith) && !(body.sharedWith as string[]).includes(leaving.id),
    );
    expect(seen).toMatchObject({ sharedWith: [], editors: [] });
    const comments = await eventually(
      () => list(`/notes/${mine}/comments`, staying.token),
      found => found.length === 1,
    );
    expect(comments.map(each => each.text)).toEqual(['Stay']);
  });

  it('frees the email for a new account, which starts with nothing', async () => {
    const { call, command, account, note, list } = client();
    const first = await account('again@acceptance.test');
    await note(first.token, 'Old');
    expect(await command('DELETE', '/accounts/me', first.token)).toBe('SUCCESS');
    expect((await call('DELETE', '/accounts/me')).status).toBe(403);

    const second = await eventually(
      async () => {
        try {
          return await account('again@acceptance.test');
        } catch {
          return undefined;
        }
      },
      created => created !== undefined,
    );
    expect(second!.id).not.toBe(first.id);
    expect(await list('/notes', second!.token)).toEqual([]);
    expect(await list('/notifications', second!.token)).toEqual([]);
    expect((await call('GET', '/plans/me', second!.token)).body).toEqual({ plan: 'free', noteLimit: 10 });
  });
});
