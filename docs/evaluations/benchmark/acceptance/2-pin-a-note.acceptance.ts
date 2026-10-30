import { acceptance } from './support';

/** Feature 2 of the benchmark backlog: pin a note. */
const { client, stop } = acceptance();
afterAll(stop);

describe('pin a note', () => {
  it('puts pinned notes first, says which are pinned, and unpins them', async () => {
    const { command, account, note, list } = client();
    const owner = await account('pins@acceptance.test');
    const oldest = await note(owner.token, 'Oldest');
    const middle = await note(owner.token, 'Middle');
    const newest = await note(owner.token, 'Newest');

    expect(await command('POST', `/notes/${oldest}/pin`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${middle}/pin`, owner.token)).toBe('SUCCESS');
    const pinned = await list('/notes', owner.token);
    expect(pinned.map(each => each.id)).toEqual([middle, oldest, newest]);
    expect(pinned.map(each => each.pinned)).toEqual([true, true, false]);

    expect(await command('POST', `/notes/${middle}/unpin`, owner.token)).toBe('SUCCESS');
    expect((await list('/notes', owner.token)).map(each => each.id)).toEqual([oldest, newest, middle]);
  });

  it('refuses a second pin, an unpin of a note that is not pinned, a pin of an archived note, and another account', async () => {
    const { command, account, note } = client();
    const owner = await account('rules@acceptance.test');
    const stranger = await account('other@acceptance.test');
    const id = await note(owner.token, 'Pin me');

    expect(await command('POST', `/notes/${id}/unpin`, owner.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/pin`, stranger.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/pin`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/pin`, owner.token)).toBe('ERROR');

    const archived = await note(owner.token, 'Put away');
    expect(await command('POST', `/notes/${archived}/archive`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${archived}/pin`, owner.token)).toBe('ERROR');
  });

  it('keeps the pin of an archived note, which can still be unpinned', async () => {
    const { call, command, account, note } = client();
    const owner = await account('archived-pin@acceptance.test');
    const id = await note(owner.token, 'Pinned, then archived');
    expect(await command('POST', `/notes/${id}/pin`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/archive`, owner.token)).toBe('SUCCESS');
    expect((await call('GET', `/notes/${id}`, owner.token)).body).toEqual(
      expect.objectContaining({ archived: true, pinned: true }),
    );
    expect(await command('POST', `/notes/${id}/unpin`, owner.token)).toBe('SUCCESS');
    expect((await call('GET', `/notes/${id}`, owner.token)).body).toEqual(expect.objectContaining({ pinned: false }));
  });
});
