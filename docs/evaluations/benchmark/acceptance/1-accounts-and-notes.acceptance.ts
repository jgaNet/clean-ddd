import { acceptance } from './support';

/** Feature 1 of the benchmark backlog: accounts, and a signed-in account's own notes. */
const { client, stop } = acceptance();
afterAll(stop);

describe('accounts', () => {
  it('signs up, logs in and says who is calling', async () => {
    const { call, outcome, account } = client();
    const ada = await account('ada@acceptance.test');
    const me = await call('GET', '/accounts/me', ada.token);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(expect.objectContaining({ id: ada.id, email: 'ada@acceptance.test' }));
    expect(JSON.stringify(me.body)).not.toContain('secret123');

    expect((await call('GET', '/accounts/me')).status).toBe(403);
    const taken = await outcome(
      await call('POST', '/accounts', undefined, { email: 'ada@acceptance.test', password: 'another123' }),
    );
    expect(taken.status).toBe('ERROR');
    const short = await outcome(
      await call('POST', '/accounts', undefined, { email: 'b@acceptance.test', password: 'short' }),
    );
    expect(short.status).toBe('ERROR');
    const notAnEmail = await outcome(
      await call('POST', '/accounts', undefined, { email: 'nobody', password: 'secret123' }),
    );
    expect(notAnEmail.status).toBe('ERROR');
  });

  it('refuses a wrong password and an unknown email alike', async () => {
    const { call, account } = client();
    await account('grace@acceptance.test');
    const wrong = await call('POST', '/accounts/login', undefined, {
      email: 'grace@acceptance.test',
      password: 'wrong-one',
    });
    const unknown = await call('POST', '/accounts/login', undefined, {
      email: 'who@acceptance.test',
      password: 'secret123',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe('notes', () => {
  it('writes, edits, archives and restores one of its notes, and lists its own most recent first', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('owner@acceptance.test');
    const first = await note(owner.token, 'First', 'one');
    const second = await note(owner.token, 'Second');

    const mine = await list('/notes', owner.token);
    expect(mine.map(each => each.id)).toEqual([second, first]);
    expect(mine[1]).toEqual(
      expect.objectContaining({
        id: first,
        title: 'First',
        text: 'one',
        archived: false,
        createdAt: expect.any(String),
      }),
    );
    expect(Number.isNaN(Date.parse(String(mine[1].createdAt)))).toBe(false);

    expect(await command('PUT', `/notes/${first}`, owner.token, { title: 'First, edited', text: 'two' })).toBe(
      'SUCCESS',
    );
    expect((await call('GET', `/notes/${first}`, owner.token)).body).toEqual(
      expect.objectContaining({ id: first, title: 'First, edited', text: 'two', archived: false }),
    );

    expect(await command('POST', `/notes/${first}/archive`, owner.token)).toBe('SUCCESS');
    expect((await call('GET', `/notes/${first}`, owner.token)).body).toEqual(
      expect.objectContaining({ archived: true }),
    );
    expect(await command('PUT', `/notes/${first}`, owner.token, { title: 'No', text: '' })).toBe('ERROR');
    expect(await command('POST', `/notes/${first}/restore`, owner.token)).toBe('SUCCESS');
    expect(await command('PUT', `/notes/${first}`, owner.token, { title: 'Yes', text: '' })).toBe('SUCCESS');
  });

  it('refuses a note without a title, or with a title over 100 characters', async () => {
    const { command, account } = client();
    const owner = await account('titles@acceptance.test');
    expect(await command('POST', '/notes', owner.token, { title: '', text: 'x' })).toBe('ERROR');
    expect(await command('POST', '/notes', owner.token, { title: 'x'.repeat(101), text: '' })).toBe('ERROR');
    expect(await command('POST', '/notes', owner.token, { title: 'x'.repeat(100), text: '' })).toBe('SUCCESS');
  });

  it('keeps a note from everybody but its owner', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('keeper@acceptance.test');
    const stranger = await account('stranger@acceptance.test');
    const id = await note(owner.token, 'Private');

    expect((await call('GET', `/notes/${id}`, stranger.token)).status).toBe(404);
    expect((await call('GET', '/notes/does-not-exist', owner.token)).status).toBe(404);
    expect(await list('/notes', stranger.token)).toEqual([]);
    expect(await command('PUT', `/notes/${id}`, stranger.token, { title: 'Mine now', text: '' })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/archive`, stranger.token)).toBe('ERROR');

    expect((await call('GET', '/notes')).status).toBe(403);
    expect((await call('GET', `/notes/${id}`)).status).toBe(403);
    expect((await call('POST', '/notes', undefined, { title: 'Anonymous', text: '' })).status).toBe(403);
  });
});
