import { acceptance } from './support';

/** Feature 4 of the benchmark backlog: share a note. */
const { client, stop } = acceptance();
afterAll(stop);

describe('share a note', () => {
  it('lets an account a note is shared with read it and list it, with its owner', async () => {
    const { call, command, account, note, list } = client();
    const owner = await account('sharer@acceptance.test');
    const bob = await account('bob@acceptance.test');
    const carl = await account('carl@acceptance.test');
    const stranger = await account('nobody@acceptance.test');
    const older = await note(owner.token, 'Older', 'a');
    const newer = await note(owner.token, 'Newer', 'b');

    expect(await command('POST', `/notes/${older}/share`, owner.token, { accountId: bob.id })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${newer}/share`, owner.token, { accountId: bob.id })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${newer}/share`, owner.token, { accountId: carl.id })).toBe('SUCCESS');

    const shared = await list('/notes/shared', bob.token);
    expect(shared.map(each => each.id)).toEqual([newer, older]);
    expect(shared[0]).toEqual(expect.objectContaining({ id: newer, title: 'Newer', text: 'b', ownerId: owner.id }));
    expect(await list('/notes/shared', stranger.token)).toEqual([]);
    expect(await list('/notes', bob.token)).toEqual([]);

    const read = await call('GET', `/notes/${newer}`, bob.token);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(expect.objectContaining({ id: newer, ownerId: owner.id }));
    expect((await call('GET', `/notes/${newer}`, stranger.token)).status).toBe(404);

    const details = await call('GET', `/notes/${newer}`, owner.token);
    expect(details.body).toEqual(expect.objectContaining({ ownerId: owner.id }));
    expect([...(details.body.sharedWith as string[])].sort()).toEqual([bob.id, carl.id].sort());
  });

  it('leaves the note to its owner: a recipient cannot change it or share it', async () => {
    const { command, account, note } = client();
    const owner = await account('owner2@acceptance.test');
    const bob = await account('bob2@acceptance.test');
    const carl = await account('carl2@acceptance.test');
    const id = await note(owner.token, 'Read only');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: bob.id })).toBe('SUCCESS');

    expect(await command('PUT', `/notes/${id}`, bob.token, { title: 'Changed', text: '' })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/archive`, bob.token)).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/share`, bob.token, { accountId: carl.id })).toBe('ERROR');
  });

  it('refuses sharing twice, with oneself, with an unknown account, and an archived note', async () => {
    const { command, account, note } = client();
    const owner = await account('owner3@acceptance.test');
    const bob = await account('bob3@acceptance.test');
    const id = await note(owner.token, 'Once');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: bob.id })).toBe('SUCCESS');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: bob.id })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: owner.id })).toBe('ERROR');
    expect(await command('POST', `/notes/${id}/share`, owner.token, { accountId: 'no-such-account' })).toBe('ERROR');

    const archived = await note(owner.token, 'Put away');
    expect(await command('POST', `/notes/${archived}/archive`, owner.token)).toBe('SUCCESS');
    expect(await command('POST', `/notes/${archived}/share`, owner.token, { accountId: bob.id })).toBe('ERROR');
  });
});
