import {
  client,
  Client,
  database,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  Running,
  start,
  stop,
} from './tally';

/** Request 13: a settlement through the payment provider: a payment link, then the provider's signed webhook. */
const db = database('provider');
let provider: PaymentProvider;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  server = await start(db.path, await provider.environment());
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

/** Three people in a group of `currency`, Ann owns it and is payable; Ann paid 900: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string, currency = 'EUR') {
  const ann = await api.person(`ann@${tag}.provider.test`);
  const bob = await api.person(`bob@${tag}.provider.test`);
  const cy = await api.person(`cy@${tag}.provider.test`);
  const groupId = await api.group(ann, 'The flat', currency);
  const invitation = await api.invite(ann, groupId);
  await api.join(bob, invitation);
  await api.join(cy, invitation);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  await payable(api, ann, provider);
  return { ann, bob, cy, groupId };
}

const suggested = async (groupId: string, who: Person) =>
  (await api.list(`/groups/${groupId}/settlements/suggested`, who.token)).map(each => [
    each.from,
    each.to,
    each.amount,
  ]);

describe('pay through the payment provider', () => {
  it('asks the provider for a payment link, and keeps the settlement pending, not counted, until the provider says it succeeded', async () => {
    const { ann, bob, cy, groupId } = await flat('link', 'GBP');
    const id = await api.payThrough(bob, groupId, ann, 300);

    const payment = provider.paymentFor(id);
    expect(payment.body).toMatchObject({ reference: id, amount: 300, currency: 'GBP' });
    expect(provider.payments.filter(each => each.body.reference === id)).toHaveLength(1);
    const pending = await api.settlement(id, cy.token);
    expect(pending).toMatchObject({
      id,
      groupId,
      from: bob.id,
      to: ann.id,
      amount: 300,
      method: 'provider',
      status: 'pending',
      payUrl: payment.payUrl,
    });
    expect(pending.at).toMatch(TIME);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });

    expect((await provider.webhook(api, payment.id, 'pending')).accepted).toBe(true);
    expect((await api.settlement(id, bob.token)).status).toBe('pending');
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-300);

    expect((await provider.webhook(api, payment.id, 'succeeded')).accepted).toBe(true);
    const paid = await api.settlement(id, ann.token);
    expect(paid).toMatchObject({ id, method: 'provider', status: 'paid', payUrl: payment.payUrl, amount: 300 });
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, bob.id, cy.id],
      of: { [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 },
      sum: 0,
    });

    const out = await api.person('out@link.provider.test');
    expect(await api.hidden(`/settlements/${id}`, out.token)).toBe(404);
  }, 60000);

  it('counts a payment waiting at the provider as paid, for what is still owed and for the suggestions', async () => {
    const { ann, bob, cy, groupId } = await flat('waiting');
    const waiting = await api.payThrough(bob, groupId, ann, 200);
    expect(await suggested(groupId, cy)).toEqual([
      [cy.id, ann.id, 300],
      [bob.id, ann.id, 100],
    ]);
    expect(
      await api.refused('POST', `/groups/${groupId}/settlements/provider`, bob.token, { to: ann.id, amount: 101 }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/groups/${groupId}/settlements/cash`, ann.token, { from: bob.id, amount: 101 }),
    ).toBe(true);
    await api.cash(ann, groupId, bob, 100);
    expect(await suggested(groupId, cy)).toEqual([[cy.id, ann.id, 300]]);
    // The balances count a payment once it is paid, and not before.
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 500, [bob.id]: -200, [cy.id]: -300 });
    await provider.webhook(api, provider.paymentFor(waiting).id, 'succeeded');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 });
  }, 60000);

  it('never counts a payment the provider says failed, and frees what it held', async () => {
    const { ann, bob, cy, groupId } = await flat('failed');
    const id = await api.payThrough(bob, groupId, ann, 300);
    const payment = provider.paymentFor(id);
    expect((await provider.webhook(api, payment.id, 'failed')).accepted).toBe(true);
    const failed = await api.settlement(id, cy.token);
    expect(failed).toMatchObject({
      id,
      groupId,
      from: bob.id,
      to: ann.id,
      amount: 300,
      method: 'provider',
      status: 'failed',
      payUrl: payment.payUrl,
    });
    expect(failed.at).toMatch(TIME);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });
    expect(await suggested(groupId, bob)).toEqual([
      [bob.id, ann.id, 300],
      [cy.id, ann.id, 300],
    ]);
    // No longer waiting: what it held is owed again, and may be paid.
    const again = await api.payThrough(bob, groupId, ann, 300);
    await provider.webhook(api, provider.paymentFor(again).id, 'succeeded');
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(0);
  }, 60000);

  it('refuses to pay more than is still owed, or someone outside the group, and keeps nothing', async () => {
    const { ann, bob, cy, groupId } = await flat('rules');
    const out = await api.person('out@rules.provider.test');
    const path = `/groups/${groupId}/settlements/provider`;
    const refusals: [string, string, unknown][] = [
      ['more than is owed', bob.token, { to: ann.id, amount: 301 }],
      ['to someone owed nothing', bob.token, { to: cy.id, amount: 100 }],
      ['to oneself', bob.token, { to: bob.id, amount: 100 }],
      ['to someone outside the group', bob.token, { to: out.id, amount: 100 }],
      ['by someone outside the group', out.token, { to: ann.id, amount: 100 }],
      ['an amount of 0', bob.token, { to: ann.id, amount: 0 }],
    ];
    const accepted: string[] = [];
    for (const [what, token, body] of refusals)
      if ((await api.act('POST', path, token, body)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    expect((await api.call('POST', path, undefined, { to: ann.id, amount: 100 })).status).toBe(401);
    const shapes = [{ amount: 100 }, { to: ann.id }, { to: 7, amount: 100 }, { to: ann.id, amount: '100' }];
    const answered: string[] = [];
    for (const body of shapes)
      answered.push(`${JSON.stringify(body)}: ${(await api.call('POST', path, bob.token, body)).status}`);
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });
    // Nothing is waiting either: the whole debt can still be paid.
    expect(await suggested(groupId, bob)).toEqual([
      [bob.id, ann.id, 300],
      [cy.id, ann.id, 300],
    ]);
  }, 60000);

  it('refuses to pay when the provider fails or is not there, and keeps nothing', async () => {
    const { ann, bob, groupId } = await flat('down');
    provider.state.refusing = true;
    try {
      expect(
        await api.refused('POST', `/groups/${groupId}/settlements/provider`, bob.token, { to: ann.id, amount: 300 }),
      ).toBe(true);
    } finally {
      provider.state.refusing = false;
    }
    expect((await suggested(groupId, bob))[0]).toEqual([bob.id, ann.id, 300]);
    // A server started without PROVIDER_URL, on the same database.
    const bare = await start(db.path);
    try {
      const other = client(bare.port);
      const token = await other.login(bob.email);
      expect(
        await other.refused('POST', `/groups/${groupId}/settlements/provider`, token, { to: ann.id, amount: 300 }),
      ).toBe(true);
    } finally {
      await stop(bare);
    }
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-300);
    await api.payThrough(bob, groupId, ann, 300);
  }, 60000);

  it('refuses an unsigned or wrongly signed webhook with 401, and acknowledges a signed one about an unknown payment', async () => {
    const { ann, bob, groupId } = await flat('signed');
    const id = await api.payThrough(bob, groupId, ann, 300);
    const payment = provider.paymentFor(id);
    const body = { id: 'wh-forged', paymentId: payment.id, status: 'succeeded', at: new Date().toISOString() };
    const text = JSON.stringify(body);
    const forged: [string, Record<string, string>][] = [
      ['no signature', {}],
      ['a wrong signature', { 'provider-signature': '0'.repeat(64) }],
      ['signed with another secret', { 'provider-signature': provider.sign(text, 'another-secret') }],
      ['signed for another body', { 'provider-signature': provider.sign(`${text} `) }],
    ];
    const answered: string[] = [];
    for (const [what, headers] of forged)
      answered.push(`${what}: ${(await api.call('POST', '/provider/webhooks', undefined, body, headers)).status}`);
    expect(answered.filter(line => !/: 401$/.test(line))).toEqual([]);
    expect((await api.settlement(id, ann.token)).status).toBe('pending');
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-300);

    expect((await provider.webhook(api, 'pay_nobody_knows', 'succeeded')).accepted).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('pending');
    expect((await provider.webhook(api, payment.id, 'succeeded')).accepted).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('paid');
  }, 60000);
});
