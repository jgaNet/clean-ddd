import {
  client,
  Client,
  database,
  day,
  Outcome,
  payable,
  PaymentProvider,
  paymentProvider,
  Running,
  start,
  stop,
} from './tally';

/** Request 20: a member leaves whatever their balance, which passes to the group's owner in the same step. */
const db = database('leave-balance');
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

/** Three people in a group: Ann owns it, Bob and Cy joined; Ann paid 900 for the three: Ann 600, Bob -300, Cy -300. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.leave-balance.test`);
  const bob = await api.person(`bob@${tag}.leave-balance.test`);
  const cy = await api.person(`cy@${tag}.leave-balance.test`);
  const groupId = await api.group(ann);
  const invitation = await api.invite(ann, groupId);
  await api.join(bob, invitation);
  await api.join(cy, invitation);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  return { ann, bob, cy, groupId, invitation };
}

describe('leave with a balance', () => {
  it('lets a member leave with a balance, which passes to the owner in the same step', async () => {
    // The request's example: Ann 600, Bob -300, Cy -300; Bob leaves: Ann 300, Cy -300.
    const { ann, bob, cy, groupId } = await flat('owes');
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect(await api.balances(groupId, cy.token)).toEqual({
      order: [ann.id, cy.id],
      of: { [ann.id]: 300, [cy.id]: -300 },
      sum: 0,
    });
    expect((await api.list(`/groups/${groupId}/members`, ann.token)).map(each => each.memberId)).toEqual([
      ann.id,
      cy.id,
    ]);
    expect(await api.hidden(`/groups/${groupId}`, bob.token)).toBe(404);
    expect(
      (await api.list(`/groups/${groupId}/settlements/suggested`, cy.token)).map(each => [
        each.from,
        each.to,
        each.amount,
      ]),
    ).toEqual([[cy.id, ann.id, 300]]);

    // Someone who is owed leaves too: what they are owed passes to the owner.
    const owed = await flat('owed');
    await api.expense(owed.cy, owed.groupId, {
      amount: 1000,
      splitExactly: [
        { memberId: owed.cy.id, amount: 0 },
        { memberId: owed.bob.id, amount: 1000 },
      ],
    });
    // Ann 600, Bob -1300, Cy 700.
    await api.done('POST', `/groups/${owed.groupId}/leave`, owed.cy.token);
    expect(await api.balances(owed.groupId, owed.bob.token)).toEqual({
      order: [owed.ann.id, owed.bob.id],
      of: { [owed.ann.id]: 1300, [owed.bob.id]: -1300 },
      sum: 0,
    });
  }, 60000);

  it('keeps the owner in the group, and lets someone who left come back at zero', async () => {
    const { ann, bob, cy, groupId, invitation } = await flat('back');
    expect(await api.refused('POST', `/groups/${groupId}/leave`, ann.token)).toBe(true);
    const statement = await api.read(`/groups/${groupId}/members/${bob.id}/statement`, ann.token);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect(await api.read(`/groups/${groupId}/members/${bob.id}/statement`, cy.token)).toEqual(statement);
    await api.join(bob, invitation);
    expect(await api.balances(groupId, bob.token)).toEqual({
      order: [ann.id, cy.id, bob.id],
      of: { [ann.id]: 300, [cy.id]: -300, [bob.id]: 0 },
      sum: 0,
    });
  }, 60000);

  it('refuses to let a member leave while a payment of theirs waits at the provider', async () => {
    const { ann, bob, cy, groupId } = await flat('waiting');
    await payable(api, ann, provider);
    // Cy pays Ann 300; Bob pays Ann 100 and waits.
    const cys = await api.payThrough(cy, groupId, ann, 300);
    await provider.webhook(api, provider.paymentFor(cys).id, 'succeeded');
    const bobs = await api.payThrough(bob, groupId, ann, 100);
    expect(await api.refused('POST', `/groups/${groupId}/leave`, bob.token)).toBe(true);
    await provider.webhook(api, provider.paymentFor(bobs).id, 'failed');
    // A refund waiting at the provider holds its payer too.
    await api.done('POST', `/settlements/${cys}/refund`, ann.token);
    expect(await api.refused('POST', `/groups/${groupId}/leave`, cy.token)).toBe(true);
    await provider.webhook(api, provider.paymentFor(cys).id, 'refunded');
    await api.done('POST', `/groups/${groupId}/leave`, cy.token);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect(await api.balances(groupId, ann.token)).toEqual({ order: [ann.id], of: { [ann.id]: 0 }, sum: 0 });
  }, 60000);

  it('keeps the zero sum when an expense or a settlement and a leave are sent at once, through one server or two', async () => {
    const second = await start(db.path, await provider.environment());
    try {
      const other = client(second.port);
      for (let round = 0; round < 9; round++) {
        const { ann, bob, cy, groupId } = await flat(`race${round}`);
        const through = round % 2 === 0 ? api : other;
        const bobToken = through === api ? bob.token : await other.login(bob.email);
        // What is sent at the moment Bob leaves: an expense Ann records with Bob, one Bob records himself, or Ann's
        // record of Bob's cash. Whichever is kept, what passes to Ann leaves Ann 300, or Cy owes more.
        const kind = round % 3;
        const body =
          kind === 0
            ? { description: 'With Bob', amount: 600, date: day(0), splitBetween: [ann.id, bob.id] }
            : kind === 1
              ? { description: 'By Bob', amount: 600, date: day(0), splitBetween: [bob.id, cy.id] }
              : { from: bob.id, amount: 300 };
        const [path, token] =
          kind === 0
            ? [`/groups/${groupId}/expenses`, ann.token]
            : kind === 1
              ? [`/groups/${groupId}/expenses`, bob.token]
              : [`/groups/${groupId}/settlements/cash`, ann.token];
        const [sent, left]: Outcome[] = await Promise.all([
          api.act('POST', path, token, body),
          through.act('POST', `/groups/${groupId}/leave`, bobToken),
        ]);
        expect(left.accepted).toBe(true);
        const balances = await api.balances(groupId, ann.token);
        expect(balances.order).toEqual([ann.id, cy.id]);
        expect(balances.sum).toBe(0);
        const cyOwes = kind === 1 && sent.accepted ? -600 : -300;
        expect(balances.of).toEqual({ [ann.id]: -cyOwes, [cy.id]: cyOwes });
      }
    } finally {
      await stop(second);
    }
  }, 240000);
});
