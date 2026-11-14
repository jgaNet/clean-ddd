import { client, Client, database, day, Json, pairs, Running, Share, start, stop } from './tally';

/** Request 25: a split saved under a name, which an expense is split by in place of its own. */
const db = database('templates');
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

/** Three people in a group: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.templates.test`);
  const bob = await api.person(`bob@${tag}.templates.test`);
  const cy = await api.person(`cy@${tag}.templates.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

describe('split templates', () => {
  it('saves a split as a template, and splits an expense by it as if its split had been given', async () => {
    const { ann, bob, cy, groupId } = await flat('saved');
    const byShares = [
      { memberId: ann.id, shares: 2 },
      { memberId: bob.id, shares: 2 },
      { memberId: cy.id, shares: 1 },
    ];
    const bigRoom = await api.create(`/groups/${groupId}/templates`, bob.token, {
      name: 'Big room',
      splitByShares: byShares,
    });
    const pair = await api.create(`/groups/${groupId}/templates`, cy.token, {
      name: 'Ann and Cy',
      splitBetween: [ann.id, cy.id],
    });
    expect(await api.list(`/groups/${groupId}/templates`, ann.token)).toEqual([
      { id: bigRoom, groupId, name: 'Big room', splitByShares: byShares },
      { id: pair, groupId, name: 'Ann and Cy', splitBetween: [ann.id, cy.id] },
    ]);

    const byTemplate = await api.expense(ann, groupId, { amount: 1001, template: bigRoom });
    const given = await api.expense(ann, groupId, { amount: 1001, splitByShares: byShares });
    const read = await api.read(`/expenses/${byTemplate}`, cy.token);
    expect(read).toMatchObject({ amount: 1001, paidBy: ann.id, splitKind: 'shares' });
    expect(read.shares).toEqual((await api.read(`/expenses/${given}`, cy.token)).shares);
    expect(pairs(read.shares as Share[])).toEqual([
      [ann.id, 401],
      [bob.id, 400],
      [cy.id, 200],
    ]);

    const equal = await api.expense(cy, groupId, { amount: 999, template: pair });
    expect(await api.read(`/expenses/${equal}`, bob.token)).toMatchObject({
      splitKind: 'equal',
      shares: [
        { memberId: ann.id, amount: 500 },
        { memberId: cy.id, amount: 499 },
      ],
    });
    // An edit may give a template too.
    await api.done('PUT', `/expenses/${equal}`, cy.token, {
      description: 'Groceries',
      amount: 1000,
      date: day(0),
      template: bigRoom,
      version: 1,
    });
    expect(pairs((await api.read(`/expenses/${equal}`, ann.token)).shares as Share[])).toEqual([
      [ann.id, 400],
      [bob.id, 400],
      [cy.id, 200],
    ]);
    expect((await api.balances(groupId, bob.token)).sum).toBe(0);
  }, 60000);

  it('keeps the shares of an expense when its template is replaced or removed', async () => {
    const { ann, bob, cy, groupId } = await flat('kept');
    const flatmates = await api.create(`/groups/${groupId}/templates`, bob.token, {
      name: 'Flatmates',
      splitBetween: [ann.id, bob.id, cy.id],
    });
    const id = await api.expense(ann, groupId, { amount: 900, template: flatmates });
    const before = await api.read(`/expenses/${id}`, cy.token);
    await api.done('PUT', `/templates/${flatmates}`, bob.token, {
      name: 'Flatmates',
      splitByShares: [
        { memberId: ann.id, shares: 1 },
        { memberId: bob.id, shares: 2 },
      ],
    });
    expect(await api.read(`/expenses/${id}`, cy.token)).toEqual(before);
    expect(await api.list(`/groups/${groupId}/templates`, cy.token)).toEqual([
      {
        id: flatmates,
        groupId,
        name: 'Flatmates',
        splitByShares: [
          { memberId: ann.id, shares: 1 },
          { memberId: bob.id, shares: 2 },
        ],
      },
    ]);
    const after = await api.expense(ann, groupId, { amount: 900, template: flatmates });
    expect(pairs((await api.read(`/expenses/${after}`, bob.token)).shares as Share[])).toEqual([
      [ann.id, 300],
      [bob.id, 600],
    ]);
    await api.done('DELETE', `/templates/${flatmates}`, bob.token);
    expect(await api.read(`/expenses/${id}`, cy.token)).toEqual(before);
    expect(await api.list(`/groups/${groupId}/templates`, cy.token)).toEqual([]);
    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, ann.token, {
        description: 'Groceries',
        amount: 900,
        date: day(0),
        template: flatmates,
      }),
    ).toBe(true);
  }, 60000);

  it('refuses a template that is not allowed, and an expense its template cannot split', async () => {
    const { ann, bob, cy, groupId } = await flat('refused');
    const out = await api.person('out@refused.templates.test');
    const path = `/groups/${groupId}/templates`;
    await api.create(path, ann.token, { name: 'Big room', splitBetween: [ann.id, bob.id] });
    const refusals: [string, Json][] = [
      ['a blank name', { name: '   ', splitBetween: [ann.id] }],
      ['a name of 61 characters', { name: 'x'.repeat(61), splitBetween: [ann.id] }],
      ['a name taken, in another case', { name: 'big ROOM', splitBetween: [ann.id] }],
      ['someone outside the group', { name: 'Out', splitBetween: [ann.id, out.id] }],
      ['a member listed twice', { name: 'Twice', splitBetween: [ann.id, ann.id] }],
      ['no share', { name: 'None', splitByShares: [{ memberId: ann.id, shares: 0 }] }],
      ['half a share', { name: 'Half', splitByShares: [{ memberId: ann.id, shares: 1.5 }] }],
    ];
    const accepted: string[] = [];
    for (const [what, body] of refusals)
      if ((await api.act('POST', path, bob.token, body)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    const shapes: Json[] = [
      { name: 'No split' },
      { name: 'Exact', splitExactly: [{ memberId: ann.id, amount: 10 }] },
      { name: 'Both', splitBetween: [ann.id], splitByShares: [{ memberId: ann.id, shares: 1 }] },
      { splitBetween: [ann.id] },
      { name: 7, splitBetween: [ann.id] },
    ];
    const answered: string[] = [];
    for (const body of shapes)
      answered.push(`${JSON.stringify(body)}: ${(await api.call('POST', path, bob.token, body)).status}`);
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
    expect(await api.list(path, cy.token)).toHaveLength(1);

    // An expense that gives a template and a split is of the wrong shape.
    const withCy = await api.create(path, cy.token, { name: 'With Cy', splitBetween: [bob.id, cy.id] });
    const expense = (template: string, extra: Json = {}) => ({
      description: 'Groceries',
      amount: 900,
      date: day(0),
      template,
      ...extra,
    });
    expect(
      (await api.call('POST', `/groups/${groupId}/expenses`, bob.token, expense(withCy, { splitBetween: [bob.id] })))
        .status,
    ).toBe(400);
    // Not with the payer in it; not a template of another group; not with someone who has left.
    expect(await api.refused('POST', `/groups/${groupId}/expenses`, ann.token, expense(withCy))).toBe(true);
    const other = await api.group(out, 'Elsewhere');
    const theirs = await api.create(`/groups/${other}/templates`, out.token, { name: 'Out', splitBetween: [out.id] });
    expect(await api.refused('POST', `/groups/${groupId}/expenses`, bob.token, expense(theirs))).toBe(true);
    await api.done('POST', `/groups/${groupId}/leave`, cy.token);
    expect(await api.refused('POST', `/groups/${groupId}/expenses`, bob.token, expense(withCy))).toBe(true);
    expect(await api.list(`/groups/${groupId}/expenses`, ann.token)).toEqual([]);
  }, 60000);

  it('lets who saved a template, or the owner, change it, and the members only read them', async () => {
    const { ann, bob, cy, groupId } = await flat('who');
    const out = await api.person('out@who.templates.test');
    const id = await api.create(`/groups/${groupId}/templates`, bob.token, {
      name: 'Bob and Cy',
      splitBetween: [bob.id, cy.id],
    });
    expect(await api.refused('PUT', `/templates/${id}`, cy.token, { name: 'Mine', splitBetween: [cy.id] })).toBe(true);
    expect(await api.refused('DELETE', `/templates/${id}`, cy.token)).toBe(true);
    expect(await api.refused('DELETE', `/templates/${id}`, out.token)).toBe(true);
    await api.done('PUT', `/templates/${id}`, ann.token, { name: 'Everyone', splitBetween: [ann.id, bob.id, cy.id] });
    expect((await api.list(`/groups/${groupId}/templates`, cy.token)).map(each => each.name)).toEqual(['Everyone']);
    await api.done('DELETE', `/templates/${id}`, bob.token);
    expect(await api.list(`/groups/${groupId}/templates`, cy.token)).toEqual([]);
    expect(await api.hidden(`/groups/${groupId}/templates`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/templates`)).toBe(401);
    expect(
      await api.refused('POST', `/groups/${groupId}/templates`, out.token, { name: 'Out', splitBetween: [out.id] }),
    ).toBe(true);
  }, 60000);
});
