import { client, Client, database, reached, Running, sleep, start, stop } from './tally';

/** Request 2: a group, its currency, its owner, and who sees it. */
const db = database('groups');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

describe('create a group', () => {
  it('creates a group its creator owns, seen by its members only', async () => {
    const ann = await api.person('ann@groups.test');
    const bob = await api.person('bob@groups.test');

    const id = await api.create('/groups', ann.token, { name: 'Lisbon trip', currency: 'EUR' });
    expect(await api.read(`/groups/${id}`, ann.token)).toEqual({
      id,
      name: 'Lisbon trip',
      currency: 'EUR',
      ownerId: ann.id,
    });
    expect((await api.list('/groups/mine', ann.token)).map(each => each.id)).toEqual([id]);

    expect(await api.hidden(`/groups/${id}`, bob.token)).toBe(404);
    expect(await api.hidden(`/groups/${id}`)).toBe(401);
    expect(await api.hidden('/groups/mine')).toBe(401);
    expect(await api.list('/groups/mine', bob.token)).toEqual([]);
    expect(await api.hidden('/groups/no-such-group', ann.token)).toBe(404);
  }, 60000);

  it('refuses a group to a caller who is not signed in, at once with 401', async () => {
    expect((await api.call('POST', '/groups', undefined, { name: 'Nobody', currency: 'EUR' })).status).toBe(401);
    expect((await api.call('POST', '/groups', 'not-a-token', { name: 'Nobody', currency: 'EUR' })).status).toBe(401);
  }, 60000);

  it('refuses a name or a currency that is not allowed, and keeps the currency it was created with', async () => {
    const cy = await api.person('cy@groups.test');
    const refusedWith = (name: string, currency: string) =>
      api.refused('POST', '/groups', cy.token, { name, currency });

    expect(await refusedWith('   ', 'EUR')).toBe(true);
    expect(await refusedWith('', 'EUR')).toBe(true);
    expect(await refusedWith('x'.repeat(61), 'EUR')).toBe(true);
    expect(await refusedWith('The flat', 'XYZ')).toBe(true);
    // A currency Tally does not count in: JPY until request 40 makes it one of Tally's (the README's superseded cases).
    expect(await refusedWith('The flat', reached(40) ? 'SEK' : 'JPY')).toBe(true);
    expect(await refusedWith('The flat', '')).toBe(true);

    for (const currency of ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD']) {
      const id = await api.create('/groups', cy.token, { name: 'x'.repeat(60), currency });
      expect((await api.read(`/groups/${id}`, cy.token)).currency).toBe(currency);
    }
  }, 60000);

  it('refuses a body of the wrong shape at once with 400', async () => {
    const dee = await api.person('dee@groups.test');
    const bodies: unknown[] = [{ name: 'The flat' }, { currency: 'EUR' }, { name: 42, currency: 'EUR' }, {}];
    const answered: string[] = [];
    for (const body of bodies)
      answered.push(`${JSON.stringify(body)}: ${(await api.call('POST', '/groups', dee.token, body)).status}`);
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
  }, 60000);

  it("reads a member's operation with the member's token only: 401 without a token, 404 with another's", async () => {
    // Request 1: an operation is read with the token of the request that started it. Creating a group is the
    // first request a signed-in caller makes; an application that answers it at once has no operation to read
    // here, and the test checks the answer only.
    const eve = await api.person('eve@groups.test');
    const fay = await api.person('fay@groups.test');
    const answer = await api.call('POST', '/groups', eve.token, { name: 'Climbing club', currency: 'CHF' });
    if (answer.status === 202 && typeof answer.body?.operationId === 'string') {
      const operation = `/operations/${answer.body.operationId}`;
      expect(await api.hidden(operation)).toBe(401);
      expect(await api.hidden(operation, fay.token)).toBe(404);
      expect((await api.read(operation, eve.token)).status).toMatch(/^(PENDING|SUCCESS)$/);
    } else expect(answer.status >= 200 && answer.status < 300).toBe(true);
  }, 60000);

  it("lists a person's groups, the most recently created first", async () => {
    const gus = await api.person('gus@groups.test');
    const hue = await api.person('hue@groups.test');
    const first = await api.group(gus, 'First', 'EUR');
    await sleep(1100);
    const second = await api.group(gus, 'Second', 'GBP');
    await sleep(1100);
    const third = await api.group(gus, 'Third', 'USD');
    await api.group(hue, 'Not Gus', 'EUR');

    const mine = await api.list('/groups/mine', gus.token);
    expect(mine.map(each => each.id)).toEqual([third, second, first]);
    expect(mine.map(each => [each.name, each.currency, each.ownerId])).toEqual([
      ['Third', 'USD', gus.id],
      ['Second', 'GBP', gus.id],
      ['First', 'EUR', gus.id],
    ]);
  }, 60000);
});
