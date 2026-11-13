import {
  client,
  Client,
  database,
  kill,
  Outcome,
  payable,
  PaymentProvider,
  paymentProvider,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 14: webhooks that come twice, late or out of order; a payment changes a balance once. */
const db = database('webhooks');
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

/** Three people in a group, Ann owns it and is payable; Ann paid 900: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.webhooks.test`);
  const bob = await api.person(`bob@${tag}.webhooks.test`);
  const cy = await api.person(`cy@${tag}.webhooks.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  await payable(api, ann, provider);
  return { ann, bob, cy, groupId };
}

describe('webhooks late, twice or out of order', () => {
  it('counts a payment once, however many times and under however many ids the provider says it succeeded', async () => {
    const { ann, bob, cy, groupId } = await flat('twice');
    const id = await api.payThrough(bob, groupId, ann, 300);
    const { id: paymentId } = provider.paymentFor(id);
    const outcomes: Outcome[] = [];
    for (let time = 0; time < 3; time++) outcomes.push(await provider.webhook(api, paymentId, 'succeeded', 'wh-same'));
    for (let time = 0; time < 3; time++) outcomes.push(await provider.webhook(api, paymentId, 'succeeded'));
    expect(outcomes.filter(outcome => !outcome.accepted)).toEqual([]);
    expect((await api.settlement(id, cy.token)).status).toBe('paid');
    expect(await api.balances(groupId, cy.token)).toMatchObject({
      of: { [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 },
      sum: 0,
    });
    // Cy pays too, and the earlier payment, said once more, still counts once.
    const cys = await api.payThrough(cy, groupId, ann, 300);
    await provider.webhook(api, provider.paymentFor(cys).id, 'succeeded');
    await provider.webhook(api, paymentId, 'succeeded', 'wh-same');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0, [cy.id]: 0 });
  }, 60000);

  it('moves a payment only forward: a pending after its success leaves it paid, and a failed payment never becomes paid', async () => {
    const { ann, bob, cy, groupId } = await flat('order');
    const bobs = await api.payThrough(bob, groupId, ann, 300);
    const cys = await api.payThrough(cy, groupId, ann, 300);
    const bobPayment = provider.paymentFor(bobs).id;
    const cyPayment = provider.paymentFor(cys).id;

    expect((await provider.webhook(api, bobPayment, 'succeeded')).accepted).toBe(true);
    expect((await provider.webhook(api, bobPayment, 'pending')).accepted).toBe(true);
    expect((await provider.webhook(api, bobPayment, 'failed')).accepted).toBe(true);
    expect((await api.settlement(bobs, ann.token)).status).toBe('paid');

    expect((await provider.webhook(api, cyPayment, 'failed')).accepted).toBe(true);
    expect((await provider.webhook(api, cyPayment, 'succeeded')).accepted).toBe(true);
    expect((await provider.webhook(api, cyPayment, 'pending')).accepted).toBe(true);
    expect((await api.settlement(cys, ann.token)).status).toBe('failed');

    expect(await api.balances(groupId, bob.token)).toMatchObject({
      of: { [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 },
      sum: 0,
    });
  }, 60000);

  it('changes, late and after a restart, what a webhook would have changed on time', async () => {
    const { ann, bob, groupId } = await flat('late');
    const id = await api.payThrough(bob, groupId, ann, 300);
    const { id: paymentId } = provider.paymentFor(id);
    await kill(server);
    // The provider sends it while Tally is stopped, and again until it is acknowledged.
    const webhook = { id: 'wh-late', paymentId, status: 'succeeded', at: new Date().toISOString() };
    const text = JSON.stringify(webhook);
    let delivered = false;
    try {
      const answer = await fetch(`http://127.0.0.1:${server.port}/v1/provider/webhooks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'provider-signature': provider.sign(text) },
        body: text,
      });
      delivered = answer.ok;
    } catch {
      // nobody is listening
    }
    expect(delivered).toBe(false);
    await sleep(2000);
    server = await start(db.path, await provider.environment());
    api = client(server.port);
    const outcome = await api.act('POST', '/provider/webhooks', undefined, webhook, {
      'provider-signature': provider.sign(text),
    });
    expect(outcome.accepted).toBe(true);
    const token = await api.login(ann.email);
    expect((await api.settlement(id, token)).status).toBe('paid');
    expect((await api.balances(groupId, token)).of[bob.id]).toBe(0);
  }, 120000);

  it('counts once the same webhook sent at once to two servers on one database', async () => {
    const { ann, bob, cy, groupId } = await flat('race');
    const dan = await api.person('dan@race.webhooks.test');
    await api.join(dan, await api.invite(ann, groupId));
    await api.expense(ann, groupId, {
      amount: 600,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: dan.id, amount: 600 },
      ],
    });
    const second = await start(db.path, await provider.environment());
    try {
      const other = client(second.port);
      const payers = [bob, cy, dan];
      const amounts = [300, 300, 600];
      const ids: string[] = [];
      for (const [n, payer] of payers.entries()) ids.push(await api.payThrough(payer, groupId, ann, amounts[n]));
      for (const id of ids) {
        const paymentId = provider.paymentFor(id).id;
        const outcomes = await Promise.all(
          [api, other, api, other, api, other].map((through, n) =>
            provider.webhook(through, paymentId, 'succeeded', n % 2 === 0 ? 'wh-once' : undefined),
          ),
        );
        expect(outcomes.filter(outcome => !outcome.accepted)).toEqual([]);
      }
      expect(await api.balances(groupId, ann.token)).toEqual({
        order: [ann.id, bob.id, cy.id, dan.id],
        of: { [ann.id]: 0, [bob.id]: 0, [cy.id]: 0, [dan.id]: 0 },
        sum: 0,
      });
    } finally {
      await stop(second);
    }
  }, 120000);
});
