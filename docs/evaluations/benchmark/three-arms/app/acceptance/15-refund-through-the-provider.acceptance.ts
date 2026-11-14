import { client, Client, database, payable, PaymentProvider, paymentProvider, Running, start, stop } from './tally';

/** Request 15: a refund of a settlement paid through the provider; the balances go back once the provider says so. */
const db = database('refund');
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

/** Three people in a group, Ann owns it and is payable; Ann paid 900: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.refund.test`);
  const bob = await api.person(`bob@${tag}.refund.test`);
  const cy = await api.person(`cy@${tag}.refund.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  await payable(api, ann, provider);
  return { ann, bob, cy, groupId };
}

/** Bob pays Ann `amount` through the provider, and the provider says it succeeded. */
async function paid(people: Awaited<ReturnType<typeof flat>>, amount = 300) {
  const id = await api.payThrough(people.bob, people.groupId, people.ann, amount);
  const paymentId = provider.paymentFor(id).id;
  await provider.webhook(api, paymentId, 'succeeded');
  return { id, paymentId };
}

describe('refund through the payment provider', () => {
  it('refunds a paid settlement through the provider, and the balances go back once the provider says it is refunded', async () => {
    const people = await flat('whole');
    const { ann, bob, cy, groupId } = people;
    const { id, paymentId } = await paid(people);
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(0);

    await api.done('POST', `/settlements/${id}/refund`, ann.token);
    expect(provider.refunds.filter(each => each.paymentId === paymentId)).toEqual([
      { paymentId, body: expect.objectContaining({ reference: id }) },
    ]);
    const refunding = await api.settlement(id, cy.token);
    expect(refunding).toMatchObject({
      id,
      groupId,
      from: bob.id,
      to: ann.id,
      amount: 300,
      method: 'provider',
      status: 'refunding',
      payUrl: provider.paymentFor(id).payUrl,
    });
    expect(refunding.at).toMatch(TIME);
    // Not back yet: the balances still count it as paid.
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 });

    expect((await provider.webhook(api, paymentId, 'refunded')).accepted).toBe(true);
    const refunded = await api.settlement(id, bob.token);
    expect(refunded).toMatchObject({
      id,
      groupId,
      from: bob.id,
      to: ann.id,
      amount: 300,
      method: 'provider',
      status: 'refunded',
    });
    expect(refunded.payUrl).toBe(refunding.payUrl);
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, bob.id, cy.id],
      of: { [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 },
      sum: 0,
    });
    // Owed again, so payable again.
    await api.payThrough(bob, groupId, ann, 300);
  }, 60000);

  it('refuses a refund by anyone but the payee, of a settlement not paid through the provider, or when the provider refuses', async () => {
    const people = await flat('rules');
    const { ann, bob, cy, groupId } = people;
    const out = await api.person('out@rules.refund.test');
    const { id } = await paid(people, 200);
    const cash = await api.cash(ann, groupId, cy, 100);
    const pending = await api.payThrough(bob, groupId, ann, 100);

    const refusals: [string, string, string][] = [
      ['by its payer', id, bob.token],
      ['by another member', id, cy.token],
      ['by someone outside the group', id, out.token],
      ['of a settlement in cash', cash, ann.token],
      ['of a payment still pending', pending, ann.token],
    ];
    const accepted: string[] = [];
    for (const [what, settlement, token] of refusals)
      if ((await api.act('POST', `/settlements/${settlement}/refund`, token)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    expect((await api.call('POST', `/settlements/${id}/refund`)).status).toBe(401);

    provider.state.refusing = true;
    try {
      expect(await api.refused('POST', `/settlements/${id}/refund`, ann.token)).toBe(true);
    } finally {
      provider.state.refusing = false;
    }
    expect((await api.settlement(id, ann.token)).status).toBe('paid');
    await api.done('POST', `/settlements/${id}/refund`, ann.token);
    expect(await api.refused('POST', `/settlements/${id}/refund`, ann.token)).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('refunding');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: -100, [cy.id]: -200 });
  }, 60000);

  it('refuses to refund a settlement whose payer or payee has left the group', async () => {
    const people = await flat('left');
    const { ann, bob, cy, groupId } = people;
    const { id } = await paid(people);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect(await api.refused('POST', `/settlements/${id}/refund`, ann.token)).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('paid');
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, cy.id],
      of: { [ann.id]: 300, [cy.id]: -300 },
      sum: 0,
    });
  }, 60000);

  it('keeps a refund in order: said twice it counts once, and a success that comes after it changes nothing', async () => {
    const people = await flat('order');
    const { ann, bob, cy, groupId } = people;
    const { id, paymentId } = await paid(people);
    await api.done('POST', `/settlements/${id}/refund`, ann.token);
    for (const status of ['refunded', 'refunded', 'succeeded', 'pending'])
      expect((await provider.webhook(api, paymentId, status)).accepted).toBe(true);
    expect((await api.settlement(id, ann.token)).status).toBe('refunded');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });

    // A refund that overtakes the success of the same payment: refunded, never counted.
    const cys = await api.payThrough(cy, groupId, ann, 300);
    const cyPayment = provider.paymentFor(cys).id;
    await provider.webhook(api, cyPayment, 'refunded');
    await provider.webhook(api, cyPayment, 'succeeded');
    expect((await api.settlement(cys, ann.token)).status).toBe('refunded');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 600, [bob.id]: -300, [cy.id]: -300 });
  }, 60000);
});
