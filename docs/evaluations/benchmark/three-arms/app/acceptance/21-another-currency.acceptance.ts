import { client, Client, database, day, Json, pairs, Running, Share, start, stop } from './tally';

/** Request 21: an expense in another currency, at the rate its payer states; the rate and both amounts are kept. */
const db = database('currency');
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

/** Three people in a group that counts in euros: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.currency.test`);
  const bob = await api.person(`bob@${tag}.currency.test`);
  const cy = await api.person(`cy@${tag}.currency.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

describe('an expense in another currency', () => {
  it('records an expense in another currency at the rate its payer states, and keeps the rate and both amounts', async () => {
    const { ann, bob, cy, groupId } = await flat('stated');
    // 1234 at 1.0625 is 1311.125: 1311, split equally between three, 437 each.
    const fondue = await api.expense(bob, groupId, {
      description: 'Fondue',
      original: { currency: 'CHF', amount: 1234, rate: '1.0625' },
      splitBetween: [ann.id, bob.id, cy.id],
    });
    const read = await api.read(`/expenses/${fondue}`, cy.token);
    expect(read).toMatchObject({
      id: fondue,
      groupId,
      description: 'Fondue',
      amount: 1311,
      paidBy: bob.id,
      original: { currency: 'CHF', amount: 1234, rate: '1.0625' },
    });
    expect(pairs(read.shares as Share[])).toEqual([
      [ann.id, 437],
      [bob.id, 437],
      [cy.id, 437],
    ]);
    expect(await api.read(`/expenses/${fondue}`, ann.token)).toEqual(read);

    // 1000 at 0.9545 is 954.5: a half is rounded up, 955.
    const half = await api.expense(ann, groupId, {
      original: { currency: 'USD', amount: 1000, rate: '0.9545' },
      splitBetween: [ann.id, cy.id],
    });
    expect(await api.read(`/expenses/${half}`, bob.token)).toMatchObject({
      amount: 955,
      original: { currency: 'USD', amount: 1000, rate: '0.9545' },
    });
    // The rate is read back as it was given, the same string.
    const pounds = await api.expense(cy, groupId, {
      original: { currency: 'GBP', amount: 250, rate: '12.50' },
      splitBetween: [cy.id],
    });
    expect(await api.read(`/expenses/${pounds}`, ann.token)).toMatchObject({
      amount: 3125,
      original: { currency: 'GBP', amount: 250, rate: '12.50' },
    });
    const euros = await api.expense(ann, groupId, { amount: 300, splitBetween: [ann.id, bob.id, cy.id] });
    expect((await api.read(`/expenses/${euros}`, bob.token)).original).toBeUndefined();

    // The balances, the lists and the statements count the amount in the group's currency.
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, bob.id, cy.id],
      of: { [ann.id]: 1255 - 437 - 478 - 100, [bob.id]: 1311 - 437 - 100, [cy.id]: 3125 - 437 - 477 - 3125 - 100 },
      sum: 0,
    });
    const listed = await api.list(`/groups/${groupId}/expenses`, bob.token);
    for (const each of listed) expect(each).toEqual(await api.read(`/expenses/${String(each.id)}`, cy.token));
    const statement = await api.read(`/groups/${groupId}/members/${bob.id}/statement`, ann.token);
    expect((statement.entries as Json[]).find(each => each.expenseId === fondue)).toMatchObject({
      paid: 1311,
      share: 437,
    });
  }, 60000);

  it('refuses a currency, an amount or a rate that is not allowed, and a body of the wrong shape', async () => {
    const { ann, bob, cy, groupId } = await flat('refused');
    const path = `/groups/${groupId}/expenses`;
    const base = { description: 'Fondue', date: day(0), splitBetween: [ann.id, bob.id] };
    const refusals: [string, Json][] = [
      ["the group's own currency", { currency: 'EUR', amount: 1000, rate: '1' }],
      ['a currency Tally does not count in', { currency: 'JPY', amount: 1000, rate: '1' }],
      ['an amount of 0', { currency: 'CHF', amount: 0, rate: '1' }],
      ['an amount over 100 000 000', { currency: 'CHF', amount: 100_000_001, rate: '1' }],
      ['an amount that is not whole', { currency: 'CHF', amount: 10.5, rate: '1' }],
      ['a rate of 0', { currency: 'CHF', amount: 1000, rate: '0' }],
      ['a rate of 0.000000', { currency: 'CHF', amount: 1000, rate: '0.000000' }],
      ['a negative rate', { currency: 'CHF', amount: 1000, rate: '-1.05' }],
      ['a rate that is no number', { currency: 'CHF', amount: 1000, rate: 'abc' }],
      ['a rate with a comma', { currency: 'CHF', amount: 1000, rate: '1,05' }],
      ['a rate with seven digits after the point', { currency: 'CHF', amount: 1000, rate: '1.1234567' }],
      ['an empty rate', { currency: 'CHF', amount: 1000, rate: '' }],
      ['an amount that comes to 0 in the group', { currency: 'CHF', amount: 1, rate: '0.4' }],
      ['an amount that comes to over 100 000 000', { currency: 'CHF', amount: 100_000_000, rate: '1.5' }],
    ];
    const accepted: string[] = [];
    for (const [what, original] of refusals)
      if ((await api.act('POST', path, bob.token, { ...base, original })).accepted) accepted.push(what);
    expect(accepted).toEqual([]);

    // A field missing or of the wrong type: the body's shape, 400.
    const shapes: Json[] = [
      { ...base, original: { currency: 'CHF', amount: 1000, rate: 1.05 } },
      { ...base, original: { amount: 1000, rate: '1' } },
      { ...base, original: { currency: 'CHF', amount: '1000', rate: '1' } },
      { ...base, original: 'CHF 10' },
      { ...base, amount: 1000, original: { currency: 'CHF', amount: 1000, rate: '1' } },
      { ...base },
    ];
    const answered: string[] = [];
    for (const body of shapes)
      answered.push(`${JSON.stringify(body)}: ${(await api.call('POST', path, bob.token, body)).status}`);
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);

    expect(await api.list(path, cy.token)).toEqual([]);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0, [cy.id]: 0 });
  }, 60000);

  it('splits the amount in the group currency, exactly or by shares, and an edit may change its currency', async () => {
    const { ann, bob, cy, groupId } = await flat('split');
    // 1000 at 1.1 is 1100: exact amounts add up to 1100, not to 1000.
    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, ann.token, {
        description: 'Dinner',
        date: day(-1),
        original: { currency: 'USD', amount: 1000, rate: '1.1' },
        splitExactly: [
          { memberId: ann.id, amount: 600 },
          { memberId: bob.id, amount: 400 },
        ],
      }),
    ).toBe(true);
    const exact = await api.expense(ann, groupId, {
      date: day(-1),
      original: { currency: 'USD', amount: 1000, rate: '1.1' },
      splitExactly: [
        { memberId: ann.id, amount: 600 },
        { memberId: bob.id, amount: 500 },
      ],
    });
    expect(await api.read(`/expenses/${exact}`, cy.token)).toMatchObject({ amount: 1100, splitKind: 'exact' });

    // 1001 at 1 by shares of 2 and 1, Bob listed first: 668 and 333.
    const byShares = await api.expense(ann, groupId, {
      original: { currency: 'CAD', amount: 1001, rate: '1' },
      splitByShares: [
        { memberId: bob.id, shares: 2 },
        { memberId: ann.id, shares: 1 },
      ],
    });
    expect(pairs((await api.read(`/expenses/${byShares}`, bob.token)).shares as Share[])).toEqual([
      [bob.id, 668],
      [ann.id, 333],
    ]);

    // Edited in another currency at another rate, then in the group's currency.
    await api.done('PUT', `/expenses/${exact}`, ann.token, {
      description: 'Dinner',
      date: day(-1),
      original: { currency: 'GBP', amount: 400, rate: '1.250' },
      splitBetween: [ann.id, bob.id],
      version: 1,
    });
    expect(await api.read(`/expenses/${exact}`, cy.token)).toMatchObject({
      amount: 500,
      version: 2,
      original: { currency: 'GBP', amount: 400, rate: '1.250' },
    });
    await api.done('PUT', `/expenses/${exact}`, ann.token, {
      description: 'Dinner',
      date: day(-1),
      amount: 800,
      splitBetween: [ann.id, bob.id],
      version: 2,
    });
    const edited = await api.read(`/expenses/${exact}`, bob.token);
    expect(edited).toMatchObject({ amount: 800, version: 3 });
    expect(edited.original).toBeUndefined();
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, bob.id, cy.id],
      of: { [ann.id]: 800 + 1001 - 400 - 333, [bob.id]: -400 - 668, [cy.id]: 0 },
      sum: 0,
    });
  }, 60000);

  it('reads an expense in another currency to the members of its group only', async () => {
    const { bob, cy, groupId } = await flat('who');
    const out = await api.person('out@who.currency.test');
    const id = await api.expense(bob, groupId, {
      original: { currency: 'AUD', amount: 500, rate: '0.6' },
      splitBetween: [bob.id, cy.id],
    });
    expect(await api.hidden(`/expenses/${id}`, out.token)).toBe(404);
    expect(await api.hidden(`/expenses/${id}`)).toBe(401);
    expect(
      await api.refused('POST', `/groups/${groupId}/expenses`, out.token, {
        description: 'Not theirs',
        date: day(0),
        original: { currency: 'AUD', amount: 500, rate: '0.6' },
        splitBetween: [out.id],
      }),
    ).toBe(true);
    expect((await api.read(`/expenses/${id}`, cy.token)).amount).toBe(300);
  }, 60000);
});
