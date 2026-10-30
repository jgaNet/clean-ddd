import { acceptance } from './support';

/** Feature 13 of the extended backlog: search. */
const { client, stop } = acceptance();
afterAll(stop);

describe('search', () => {
  it('finds the readable notes that contain every word, most recent first', async () => {
    const { call, command, account, note, list } = client();
    const ada = await account('search-ada@acceptance.test');
    const bob = await account('search-bob@acceptance.test');
    const old = await note(ada.token, 'Garden plans', 'Tomatoes and basil');
    const shared = await note(bob.token, 'Basil pesto', 'Recipe for the GARDEN harvest');
    expect(await command('POST', `/notes/${shared}/share`, bob.token, { accountId: ada.id })).toBe('SUCCESS');
    await note(bob.token, 'Garden of Bob', 'basil, not shared');
    const archived = await note(ada.token, 'Old garden basil');
    expect(await command('POST', `/notes/${archived}/archive`, ada.token)).toBe('SUCCESS');
    await note(ada.token, 'Groceries', 'garden gloves');

    const found = await list('/notes/search?q=garden%20BASIL', ada.token);
    expect(found.map(each => each.id)).toEqual([shared, old]);
    expect(found[0]).toEqual({ id: shared, title: 'Basil pesto', ownerId: bob.id });
  });

  it('refuses an empty query and an anonymous caller', async () => {
    const { call, account } = client();
    const ada = await account('search-refusals@acceptance.test');
    expect((await call('GET', '/notes/search?q=', ada.token)).status).toBe(400);
    expect((await call('GET', '/notes/search?q=%20%20', ada.token)).status).toBe(400);
    expect((await call('GET', '/notes/search', ada.token)).status).toBe(400);
    expect((await call('GET', '/notes/search?q=x')).status).toBe(403);
  });
});
