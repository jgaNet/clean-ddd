import {
  bySweep,
  client,
  Client,
  database,
  day,
  eventually,
  idOf,
  Json,
  pairs,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  previous,
  RatesService,
  ratesService,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/**
 * Request 40, the change not announced in advance: currencies with no minor unit (JPY, KRW) or with three decimals
 * (KWD, BHD), every amount in its currency's own minor unit, and every amount kept before it read as it was.
 */
const PERIOD = 3;
const db = database('precision');
let provider: PaymentProvider;
let rates: RatesService;
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  rates = ratesService();
  environment = {
    ...(await provider.environment()),
    ...(await rates.environment()),
    REMINDER_PERIOD_SECONDS: String(PERIOD),
  };
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  await rates.close();
  db.remove();
});

/** Ann, Bob and Cy, in a group Ann creates in `currency`, Bob and Cy joining in that order. */
async function three(tag: string, currency: string, through = api) {
  const [ann, bob, cy] = [
    await through.person(`ann@${tag}.precision.test`),
    await through.person(`bob@${tag}.precision.test`),
    await through.person(`cy@${tag}.precision.test`),
  ];
  const groupId = await inGroup(ann, [bob, cy], currency, through);
  return { ann, bob, cy, groupId };
}

async function inGroup(owner: Person, others: Person[], currency: string, through = api) {
  const groupId = await through.create('/groups', owner.token, { name: `In ${currency}`, currency });
  const invitation = await through.invite(owner, groupId);
  for (const other of others) await through.join(other, invitation);
  return groupId;
}

describe('currencies with no minor unit, or with three decimals', () => {
  it('allows currencies with no minor unit or with three decimals, and keeps each amount in its own minor unit', async () => {
    const ann = await api.person('ann@units.precision.test');
    for (const currency of ['JPY', 'KRW', 'KWD', 'BHD']) {
      const id = await api.create('/groups', ann.token, { name: `In ${currency}`, currency });
      expect(await api.read(`/groups/${id}`, ann.token)).toEqual({
        id,
        name: `In ${currency}`,
        currency,
        ownerId: ann.id,
      });
    }
    expect(await api.refused('POST', '/groups', ann.token, { name: 'Stockholm', currency: 'SEK' })).toBe(true);

    // 1001 yen between three: 333 each, the remainder of 2 yen to the first.
    const { bob, cy, groupId: yen } = await three('yen', 'JPY');
    const yenAnn = (await api.read(`/groups/${yen}`, bob.token)).ownerId as string;
    const dinner = await api.expense(bob, yen, { amount: 1001, splitBetween: [yenAnn, bob.id, cy.id] });
    expect(await api.read(`/expenses/${dinner}`, cy.token)).toMatchObject({ amount: 1001 });
    expect(pairs(await api.shares(dinner, cy.token))).toEqual([
      [yenAnn, 335],
      [bob.id, 333],
      [cy.id, 333],
    ]);
    expect((await api.balances(yen, cy.token)).of).toEqual({ [yenAnn]: -335, [bob.id]: 668, [cy.id]: -333 });

    // 12.345 dinars, and a budget of 50 dinars, in thousandths.
    const dinars = await three('dinars', 'KWD');
    await api.done('PUT', `/groups/${dinars.groupId}/budgets/groceries`, dinars.ann.token, { amount: 50000 });
    await api.expense(dinars.bob, dinars.groupId, {
      amount: 12345,
      category: 'groceries',
      splitBetween: [dinars.bob.id, dinars.cy.id],
    });
    expect(await api.list(`/groups/${dinars.groupId}/budgets`, dinars.cy.token)).toEqual([
      { category: 'groceries', amount: 50000, spent: 12345 },
    ]);
    expect((await api.balances(dinars.groupId, dinars.ann.token)).of).toEqual({
      [dinars.ann.id]: 0,
      [dinars.bob.id]: 6172,
      [dinars.cy.id]: -6172,
    });

    // A rate offered between them, read whole.
    rates.set('KWD', 'JPY', '485.25');
    rates.set('JPY', 'KWD', '0.002061');
    expect(await api.read(`/groups/${yen}/rates/KWD`, bob.token)).toEqual({
      currency: 'KWD',
      date: day(0),
      rate: '485.25',
    });
    expect(await api.read(`/groups/${dinars.groupId}/rates/JPY`, dinars.bob.token)).toEqual({
      currency: 'JPY',
      date: day(0),
      rate: '0.002061',
    });
  }, 60000);

  it('converts between currencies of different precision by what one unit of each is worth', async () => {
    const { ann, bob, cy, groupId: yen } = await three('converted', 'JPY');
    const dinars = await inGroup(ann, [bob], 'KWD');
    const euros = await inGroup(ann, [bob], 'EUR');
    rates.set('EUR', 'JPY', '161.5');
    rates.set('KWD', 'JPY', '485.25');
    rates.set('USD', 'KWD', '0.3075');
    rates.set('JPY', 'EUR', '0.0062');
    rates.set('USD', 'EUR', '1.0625');
    const original = async (group: string, currency: string, amount: number, rate?: string) => {
      const id = await api.expense(bob, group, {
        original: { currency, amount, ...(rate !== undefined && { rate }) },
        splitBetween: [ann.id, bob.id],
      });
      return api.read(`/expenses/${id}`, ann.token);
    };
    // 12.50 euros at 161.5 are 2018.75 yen: 2019.
    expect(await original(yen, 'EUR', 1250)).toMatchObject({
      amount: 2019,
      original: { currency: 'EUR', amount: 1250 },
    });
    // 1.500 dinars at 485.25 are 727.875 yen: 728.
    expect(await original(yen, 'KWD', 1500, '485.25')).toMatchObject({ amount: 728 });
    // 10 dollars at 0.3075 are 3.075 dinars: 3075.
    expect(await original(dinars, 'USD', 1000)).toMatchObject({ amount: 3075 });
    // 10 000 yen at 0.0062 are 62 euros: 6200, read whole.
    const fromYen = await original(euros, 'JPY', 10000);
    expect(fromYen).toMatchObject({ amount: 6200, original: { currency: 'JPY', amount: 10000, rate: '0.0062' } });
    // Between two currencies that count in hundredths, nothing changes: 12.34 dollars at 1.0625 are 13.11 euros.
    expect(await original(euros, 'USD', 1234, '1.0625')).toMatchObject({ amount: 1311 });
    expect((await api.balances(euros, ann.token)).of).toEqual({ [ann.id]: -3756, [bob.id]: 3756 });

    // A settlement in yen in the euro group: 5000 yen at 0.0062 are 31 euros, read whole.
    const settled = await api.act('POST', `/groups/${euros}/settlements/cash`, bob.token, {
      from: ann.id,
      original: { currency: 'JPY', amount: 5000 },
    });
    expect(settled.accepted).toBe(true);
    expect(await api.settlement(idOf(settled.result), ann.token)).toMatchObject({
      amount: 3100,
      original: { currency: 'JPY', amount: 5000, rate: '0.0062' },
    });
    expect((await api.balances(euros, ann.token)).of).toEqual({ [ann.id]: -656, [bob.id]: 656 });
    expect((await api.balances(yen, cy.token)).sum).toBe(0);
  }, 60000);

  it("reminds a member who still owes more than 20 of the group's currency, in its own minor unit", async () => {
    const owing = async (tag: string, currency: string, bobs: number, cys: number) => {
      const group = await three(tag, currency);
      await api.expense(group.ann, group.groupId, {
        amount: bobs + cys,
        splitExactly: [
          { memberId: group.ann.id, amount: 0 },
          { memberId: group.bob.id, amount: bobs },
          { memberId: group.cy.id, amount: cys },
        ],
      });
      return group;
    };
    const reminders = async (who: Person, groupId: string) =>
      (await api.notices(who.token)).filter(each => each.kind === 'reminder' && each.groupId === groupId);
    // 500 yen, 25 dinars and 25 euros are more than 20 of their currency; 15 yen, 15 dinars and 15 euros are not.
    const yen = await owing('yen-owed', 'JPY', 500, 15);
    const dinars = await owing('dinars-owed', 'KWD', 15000, 25000);
    const euros = await owing('euros-owed', 'EUR', 2500, 1500);
    const reminded: [Person, string, number][] = [
      [yen.bob, yen.groupId, 500],
      [dinars.cy, dinars.groupId, 25000],
      [euros.bob, euros.groupId, 2500],
    ];
    for (const [who, groupId, amount] of reminded) {
      const each: Json[] = await eventually(
        () => reminders(who, groupId),
        list => list.length >= 1,
        bySweep(PERIOD),
      );
      expect(each[0]).toMatchObject({ kind: 'reminder', groupId, amount });
    }
    await sleep(2000);
    for (const [who, groupId] of [
      [yen.cy, yen.groupId],
      [dinars.bob, dinars.groupId],
      [euros.cy, euros.groupId],
    ] as const)
      expect(await reminders(who, groupId)).toEqual([]);
  }, 90000);

  it('reads every amount kept before the change as it was, and keeps each new one in its own minor unit, on the same database', async () => {
    // Recorded through the tree as it stood before request 40 (`previous`), every amount in hundredths, then read
    // through this one on the same database.
    const moved = database('precision-moved');
    let running = await start(moved.path, environment, previous('currency-precision'));
    try {
      // The tree before the change answers as the requests before it did: its answers are not held to the API now.
      let through = client(running.port, false);
      const { ann, bob, cy, groupId } = await three('kept', 'EUR', through);
      rates.set('USD', 'EUR', '1.0625');
      rates.set('CHF', 'EUR', '0.9542');
      // Ann paid 30 euros for the three; Cy 12.34 dollars for Ann and himself; Bob paid Ann 3 francs in cash; Bob pays
      // Ann 1 euro through the provider, which waits; Ann paid 6 euros of groceries for Bob and herself.
      await through.expense(ann, groupId, { amount: 3000, splitBetween: [ann.id, bob.id, cy.id] });
      const dollars = await through.expense(cy, groupId, {
        original: { currency: 'USD', amount: 1234, rate: '1.0625' },
        splitBetween: [ann.id, cy.id],
      });
      const francs = await through.act('POST', `/groups/${groupId}/settlements/cash`, ann.token, {
        from: bob.id,
        original: { currency: 'CHF', amount: 300 },
      });
      expect(francs.accepted).toBe(true);
      await payable(through, ann, provider);
      provider.state.fee = 7;
      const waiting = await through.payThrough(bob, groupId, ann, 100);
      provider.state.fee = 0;
      await through.done('PUT', `/groups/${groupId}/budgets/groceries`, ann.token, { amount: 5000 });
      await through.expense(ann, groupId, { amount: 600, category: 'groceries', splitBetween: [ann.id, bob.id] });
      await eventually(
        () => through.notices(bob.token),
        each => each.length >= 2,
      );

      const reads = [
        `/groups/${groupId}`,
        `/groups/${groupId}/members`,
        `/groups/${groupId}/balances`,
        `/groups/${groupId}/expenses`,
        `/expenses/${dollars}`,
        `/groups/${groupId}/members/${ann.id}/statement`,
        `/groups/${groupId}/members/${bob.id}/statement`,
        `/groups/${groupId}/members/${cy.id}/statement`,
        `/groups/${groupId}/settlements`,
        `/settlements/${idOf(francs.result)}`,
        `/settlements/${waiting}`,
        `/groups/${groupId}/settlements/suggested`,
        `/groups/${groupId}/budgets`,
        `/groups/${groupId}/audit`,
        '/notices',
        '/accounts/me/insights',
      ];
      const read = (as: Client, token: string) => Promise.all(reads.map(path => as.read(path, token)));
      const before = await read(through, bob.token);
      const csv = (await through.raw(`/groups/${groupId}/members/${bob.id}/statement.csv`, bob.token)).text;
      expect((await through.read(`/expenses/${dollars}`, bob.token)).amount).toBe(1311);
      await stop(running);

      running = await start(moved.path, environment);
      through = client(running.port);
      const token = await through.login(bob.email);
      expect(await read(through, token)).toEqual(before);
      expect((await through.raw(`/groups/${groupId}/members/${bob.id}/statement.csv`, token)).text).toBe(csv);

      // The payment that waited lands now, for what it was asked.
      const balances = (before[2] as unknown as Json[]).map(each => each.balance as number);
      await provider.webhook(through, provider.paymentFor(waiting).id, 'succeeded');
      expect((await through.balances(groupId, token)).of).toEqual({
        [ann.id]: balances[0] - 100,
        [bob.id]: balances[1] + 100,
        [cy.id]: balances[2],
      });
      // And from now on, each amount in its own minor unit: 100 yen at 0.0062 are 0.62 euros, 62.
      rates.set('JPY', 'EUR', '0.0062');
      const yenHere = await through.expense(bob, groupId, {
        original: { currency: 'JPY', amount: 100 },
        splitBetween: [bob.id, cy.id],
      });
      expect((await through.read(`/expenses/${yenHere}`, token)).amount).toBe(62);
      const tokyo = await inGroup(bob, [cy], 'JPY', through);
      rates.set('EUR', 'JPY', '161.5');
      const eurosThere = await through.expense(bob, tokyo, {
        original: { currency: 'EUR', amount: 1250 },
        splitBetween: [bob.id, cy.id],
      });
      expect((await through.read(`/expenses/${eurosThere}`, token)).amount).toBe(2019);
      expect((await through.read(`/expenses/${dollars}`, token)).amount).toBe(1311);
    } finally {
      provider.state.fee = 0;
      await stop(running);
      moved.remove();
    }
  }, 120000);
});
