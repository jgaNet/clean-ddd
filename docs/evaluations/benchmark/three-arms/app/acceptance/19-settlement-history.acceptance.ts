import {
  client,
  Client,
  database,
  Json,
  ms,
  payable,
  PaymentProvider,
  paymentProvider,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 19: a group's settlements, the most recent first, each with every status it has had. */
const db = database('settlements');
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

/** Four people in a group, Ann owns it and is payable; Ann paid 4000: Bob, Cy and Dan owe her 1000 each. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.settlements.test`);
  const bob = await api.person(`bob@${tag}.settlements.test`);
  const cy = await api.person(`cy@${tag}.settlements.test`);
  const dan = await api.person(`dan@${tag}.settlements.test`);
  const groupId = await api.groupOf(ann, [bob, cy, dan]);
  await api.expense(ann, groupId, { amount: 4000, splitBetween: [ann.id, bob.id, cy.id, dan.id] });
  await payable(api, ann, provider);
  return { ann, bob, cy, dan, groupId };
}

/** The statuses of a settlement's history, checking each is a time, the earliest first. */
function statuses(settlement: Json) {
  const history = settlement.history as { status: string; at: string }[];
  for (const each of history) expect(each.at).toMatch(TIME);
  const times = history.map(each => ms(each.at));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  return history.map(each => each.status);
}

describe("a group's settlements", () => {
  it("lists the group's settlements, the most recent first, each with every status it has had", async () => {
    const { ann, bob, cy, dan, groupId } = await flat('listed');
    const cash = await api.cash(ann, groupId, bob, 300);
    await sleep(1100);
    const refunded = await api.payThrough(bob, groupId, ann, 400);
    const refundedPayment = provider.paymentFor(refunded).id;
    await provider.webhook(api, refundedPayment, 'succeeded');
    await api.done('POST', `/settlements/${refunded}/refund`, ann.token);
    await provider.webhook(api, refundedPayment, 'refunded');
    await sleep(1100);
    const failed = await api.payThrough(cy, groupId, ann, 500);
    await provider.webhook(api, provider.paymentFor(failed).id, 'failed');
    await sleep(1100);
    const pending = await api.payThrough(dan, groupId, ann, 600);

    const listed = await api.list(`/groups/${groupId}/settlements`, cy.token);
    expect(listed.map(each => each.id)).toEqual([pending, failed, refunded, cash]);
    for (const each of listed) expect(await api.settlement(String(each.id), dan.token)).toEqual(each);
    expect(listed.map(statuses)).toEqual([
      ['pending'],
      ['pending', 'failed'],
      ['pending', 'paid', 'refunding', 'refunded'],
      ['paid'],
    ]);
    expect(listed.map(each => each.status)).toEqual(['pending', 'failed', 'refunded', 'paid']);
    expect(listed[3]).toMatchObject({ from: bob.id, to: ann.id, amount: 300, method: 'cash' });
  }, 60000);

  it('adds nothing to a history for a webhook that changes nothing, and only the status a jump reaches', async () => {
    const { ann, bob, cy, groupId } = await flat('quiet');
    const id = await api.payThrough(bob, groupId, ann, 1000);
    const paymentId = provider.paymentFor(id).id;
    for (const status of ['pending', 'succeeded', 'succeeded', 'pending', 'failed'])
      await provider.webhook(api, paymentId, status);
    expect(statuses(await api.settlement(id, ann.token))).toEqual(['pending', 'paid']);

    const jumped = await api.payThrough(cy, groupId, ann, 1000);
    const jumpedPayment = provider.paymentFor(jumped).id;
    await provider.webhook(api, jumpedPayment, 'refunded');
    await provider.webhook(api, jumpedPayment, 'succeeded');
    expect(statuses(await api.settlement(jumped, ann.token))).toEqual(['pending', 'refunded']);
  }, 60000);

  it('lists the settlements to the members only, those of a member who left included', async () => {
    const { ann, bob, cy, groupId } = await flat('members');
    const out = await api.person('out@members.settlements.test');
    expect(await api.list(`/groups/${groupId}/settlements`, ann.token)).toEqual([]);
    const id = await api.cash(ann, groupId, bob, 1000);
    await api.done('POST', `/groups/${groupId}/leave`, bob.token);
    expect((await api.list(`/groups/${groupId}/settlements`, cy.token)).map(each => each.id)).toEqual([id]);
    expect(await api.hidden(`/groups/${groupId}/settlements`, bob.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/settlements`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/settlements`)).toBe(401);
    expect(await api.hidden('/groups/no-such-group/settlements', ann.token)).toBe(404);
  }, 60000);
});
