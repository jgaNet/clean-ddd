import { client, Client, database, PaymentProvider, paymentProvider, Running, start, stop } from './tally';

/** Request 16: a member's payout account at the provider, required to be paid through it. */
const db = database('payout');
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

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;

/** Three people in a group, Ann owns it; Ann paid 900: Ann 600, Bob -300, Cy -300. Nobody has a payout account. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.payout.test`);
  const bob = await api.person(`bob@${tag}.payout.test`);
  const cy = await api.person(`cy@${tag}.payout.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  return { ann, bob, cy, groupId };
}

describe('payout accounts', () => {
  it('sets a payout account the provider knows, and reads it to its owner only', async () => {
    const { ann, bob } = await flat('set');
    expect(await api.hidden('/accounts/me/payout-account', ann.token)).toBe(404);
    expect(await api.refused('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_unknown_ann' })).toBe(
      true,
    );
    expect(provider.accountsAsked).toContain('acct_unknown_ann');
    expect(await api.hidden('/accounts/me/payout-account', ann.token)).toBe(404);

    provider.accounts.add('acct_ann_1');
    provider.accounts.add('acct_ann_2');
    await api.done('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_ann_1' });
    expect(await api.read('/accounts/me/payout-account', ann.token)).toEqual({ accountId: 'acct_ann_1' });
    await api.done('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_ann_2' });
    expect(await api.read('/accounts/me/payout-account', ann.token)).toEqual({ accountId: 'acct_ann_2' });

    expect(await api.hidden('/accounts/me/payout-account', bob.token)).toBe(404);
    expect(await api.hidden('/accounts/me/payout-account')).toBe(401);
    expect((await api.call('PUT', '/accounts/me/payout-account', undefined, { accountId: 'acct_ann_1' })).status).toBe(
      401,
    );
    const shapes = [{}, { accountId: 42 }];
    const answered: string[] = [];
    for (const body of shapes)
      answered.push(
        `${JSON.stringify(body)}: ${(await api.call('PUT', '/accounts/me/payout-account', bob.token, body)).status}`,
      );
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
  }, 60000);

  it('refuses by name to pay through the provider someone with no payout account, and asks nothing of the provider', async () => {
    const { ann, bob, cy, groupId } = await flat('required');
    const asked = provider.payments.length;
    const none = await api.act('POST', `/groups/${groupId}/settlements/provider`, bob.token, {
      to: ann.id,
      amount: 300,
    });
    expect(none.accepted).toBe(false);
    expect(provider.payments.length).toBe(asked);
    const tooMuch = await api.act('POST', `/groups/${groupId}/settlements/provider`, bob.token, {
      to: ann.id,
      amount: 301,
    });
    expect(tooMuch.accepted).toBe(false);
    if (none.later) expect(none.error?.type).toMatch(PASCAL);
    if (none.later && tooMuch.later) expect(none.error?.type).not.toBe(tooMuch.error?.type);
    expect((await api.balances(groupId, ann.token)).of[bob.id]).toBe(-300);

    // A settlement in cash needs none.
    await api.cash(ann, groupId, cy, 300);

    provider.accounts.add('acct_ann_required');
    await api.done('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_ann_required' });
    const id = await api.payThrough(bob, groupId, ann, 300);
    expect(provider.paymentFor(id).body).toMatchObject({
      reference: id,
      amount: 300,
      currency: 'EUR',
      payee: 'acct_ann_required',
    });
  }, 60000);

  it("tells the provider the payee's payout account as it is when Tally asks, and a payment asked for goes on", async () => {
    const { ann, bob, cy, groupId } = await flat('changed');
    provider.accounts.add('acct_ann_first');
    provider.accounts.add('acct_ann_second');
    await api.done('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_ann_first' });
    const bobs = await api.payThrough(bob, groupId, ann, 300);
    await api.done('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_ann_second' });
    const cys = await api.payThrough(cy, groupId, ann, 300);
    expect(provider.paymentFor(bobs).body.payee).toBe('acct_ann_first');
    expect(provider.paymentFor(cys).body.payee).toBe('acct_ann_second');
    await provider.webhook(api, provider.paymentFor(bobs).id, 'succeeded');
    expect((await api.settlement(bobs, ann.token)).status).toBe('paid');
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 300, [bob.id]: 0, [cy.id]: -300 });
  }, 60000);

  it('refuses a payout account when the provider does not answer', async () => {
    const { ann } = await flat('down');
    provider.accounts.add('acct_ann_down');
    provider.state.refusing = true;
    try {
      expect(await api.refused('PUT', '/accounts/me/payout-account', ann.token, { accountId: 'acct_ann_down' })).toBe(
        true,
      );
    } finally {
      provider.state.refusing = false;
    }
    expect(await api.hidden('/accounts/me/payout-account', ann.token)).toBe(404);
  }, 60000);
});
