import {
  client,
  Client,
  database,
  day,
  Outcome,
  RatesService,
  ratesService,
  reached,
  Running,
  start,
  stop,
} from './tally';

/** Request 22: the rate a rates service offers, which an expense in another currency takes or corrects within 2 %. */
const db = database('rates');
let rates: RatesService;
let server: Running;
let api: Client;
beforeAll(async () => {
  rates = ratesService();
  server = await start(db.path, await rates.environment());
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await rates.close();
  db.remove();
});

/** Three people in a group that counts in euros: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.rates.test`);
  const bob = await api.person(`bob@${tag}.rates.test`);
  const cy = await api.person(`cy@${tag}.rates.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

describe('rates offered by a rates service', () => {
  it('offers the rate the rates service gives for a currency and a day, and records an expense at it when its rate is left out', async () => {
    const { ann, bob, cy, groupId } = await flat('offered');
    rates.set('USD', 'EUR', '0.92', day(-2));
    rates.set('USD', 'EUR', '0.9');
    expect(await api.read(`/groups/${groupId}/rates/USD?date=${day(-2)}`, cy.token)).toEqual({
      currency: 'USD',
      date: day(-2),
      rate: '0.92',
    });
    expect(rates.asked).toContainEqual({ from: 'USD', to: 'EUR', date: day(-2) });
    // Today, when the day is left out.
    expect(await api.read(`/groups/${groupId}/rates/USD`, cy.token)).toEqual({
      currency: 'USD',
      date: day(0),
      rate: '0.9',
    });

    const id = await api.expense(bob, groupId, {
      date: day(-2),
      original: { currency: 'USD', amount: 1000 },
      splitBetween: [ann.id, bob.id],
    });
    expect(await api.read(`/expenses/${id}`, ann.token)).toMatchObject({
      amount: 920,
      original: { currency: 'USD', amount: 1000, rate: '0.92' },
    });
    await api.done('PUT', `/expenses/${id}`, bob.token, {
      description: 'Groceries',
      date: day(-2),
      original: { currency: 'USD', amount: 2000 },
      splitBetween: [ann.id, bob.id],
      version: 1,
    });
    expect(await api.read(`/expenses/${id}`, cy.token)).toMatchObject({
      amount: 1840,
      version: 2,
      original: { currency: 'USD', amount: 2000, rate: '0.92' },
    });
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: -920, [bob.id]: 920, [cy.id]: 0 });
  }, 60000);

  it("takes a rate within 2 % of the one offered, and refuses one further from it by its rule's name", async () => {
    const { ann, bob, groupId } = await flat('band');
    rates.set('CHF', 'EUR', '0.95');
    const at = (rate: string) => ({
      description: 'Fondue',
      date: day(0),
      original: { currency: 'CHF', amount: 1000, rate },
      splitBetween: [ann.id, bob.id],
    });
    const path = `/groups/${groupId}/expenses`;
    const taken: number[] = [];
    for (const rate of ['0.969', '0.931', '0.95'])
      taken.push(
        Number((await api.read(`/expenses/${await api.create(path, bob.token, at(rate))}`, ann.token)).amount),
      );
    expect(taken).toEqual([969, 931, 950]);

    const outside: Outcome[] = [];
    for (const rate of ['0.97', '0.93', '1.2', '0.5']) outside.push(await api.act('POST', path, bob.token, at(rate)));
    expect(outside.map(each => each.accepted)).toEqual([false, false, false, false]);
    const id = await api.create(path, bob.token, at('0.95'));
    const edit = await api.act('PUT', `/expenses/${id}`, bob.token, { ...at('0.97'), version: 1 });
    expect(edit.accepted).toBe(false);
    expect((await api.read(`/expenses/${id}`, ann.token)).version).toBe(1);
    // Refused later, the rule has one name, which is not the name of a rate that is no number.
    const later = [...outside, edit].filter(each => each.later);
    expect(new Set(later.map(each => each.error?.type)).size).toBeLessThanOrEqual(1);
    const notANumber = await api.act('POST', path, bob.token, at('abc'));
    expect(notANumber.accepted).toBe(false);
    if (later.length && notANumber.later) expect(later[0].error?.type).not.toBe(notANumber.error?.type);
    expect((await api.balances(groupId, ann.token)).sum).toBe(0);
    expect(await api.list(path, ann.token)).toHaveLength(4);
  }, 60000);

  it('refuses an expense in another currency when no rate is offered, and offers none', async () => {
    const { ann, bob, cy, groupId } = await flat('none');
    const path = `/groups/${groupId}/expenses`;
    const paid = (currency: string, rate?: string) => ({
      description: 'Taxi',
      date: day(0),
      original: { currency, amount: 1000, ...(rate !== undefined && { rate }) },
      splitBetween: [ann.id, bob.id],
    });
    // The service has no rate from pounds.
    expect(await api.hidden(`/groups/${groupId}/rates/GBP`, cy.token)).toBe(404);
    expect(await api.refused('POST', path, bob.token, paid('GBP'))).toBe(true);
    expect(await api.refused('POST', path, bob.token, paid('GBP', '1.2'))).toBe(true);

    // The service is down.
    rates.set('CAD', 'EUR', '0.7');
    rates.state.refusing = true;
    try {
      expect(await api.hidden(`/groups/${groupId}/rates/CAD`, cy.token)).toBe(404);
      expect(await api.refused('POST', path, bob.token, paid('CAD'))).toBe(true);
      expect(await api.refused('POST', path, bob.token, paid('CAD', '0.7'))).toBe(true);
    } finally {
      rates.state.refusing = false;
    }
    expect(await api.list(path, cy.token)).toEqual([]);
    const cad = await api.expense(bob, groupId, paid('CAD'));
    expect((await api.read(`/expenses/${cad}`, cy.token)).amount).toBe(700);

    // A server started without RATES_URL, on the same database, offers no rate and takes the payer's.
    const bare = await start(db.path);
    try {
      const other = client(bare.port);
      const token = await other.login(bob.email);
      expect(await other.hidden(`/groups/${groupId}/rates/CAD`, token)).toBe(404);
      expect(await other.refused('POST', path, token, paid('CAD'))).toBe(true);
      const stated = await other.create(path, token, paid('CAD', '5'));
      expect((await other.read(`/expenses/${stated}`, token)).amount).toBe(5000);
    } finally {
      await stop(bare);
    }
  }, 60000);

  it("offers no rate for the group's own currency or one Tally does not count in, and to its members only", async () => {
    const { ann, groupId } = await flat('who');
    rates.set('EUR', 'EUR', '1');
    // A currency Tally does not count in: JPY until request 40 makes it one of Tally's (the README's superseded cases).
    const foreign = reached(40) ? 'SEK' : 'JPY';
    rates.set(foreign, 'EUR', '0.006');
    rates.set('AUD', 'EUR', '0.6');
    const out = await api.person('out@who.rates.test');
    expect(await api.hidden(`/groups/${groupId}/rates/EUR`, ann.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/rates/${foreign}`, ann.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/rates/AUD`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/rates/AUD`)).toBe(401);
    expect(await api.hidden(`/groups/no-such-group/rates/AUD`, ann.token)).toBe(404);
    expect((await api.read(`/groups/${groupId}/rates/AUD`, ann.token)).rate).toBe('0.6');
  }, 60000);
});
