import {
  bySweep,
  client,
  Client,
  database,
  day,
  JPEG,
  Json,
  kill,
  monthly,
  Outcome,
  payable,
  PaymentProvider,
  paymentProvider,
  Person,
  PNG,
  ReceiptStore,
  receiptStore,
  Running,
  sleep,
  start,
  stop,
} from './tally';

/** Request 27: an archived group, read only. */
const db = database('archive');
let provider: PaymentProvider;
let store: ReceiptStore;
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  provider = paymentProvider();
  store = receiptStore();
  environment = { ...(await provider.environment()), ...(await store.environment()) };
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  await store.close();
  db.remove();
});

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]00:?00)$/;

/** Three people in a group Ann owns and is paid in: Ann paid 900 for the three, Ann 600, Bob -300, Cy -300. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.archive.test`);
  const bob = await api.person(`bob@${tag}.archive.test`);
  const cy = await api.person(`cy@${tag}.archive.test`);
  const groupId = await api.group(ann, 'Lisbon trip');
  const invitation = await api.invite(ann, groupId);
  await api.join(bob, invitation);
  await api.join(cy, invitation);
  await api.expense(ann, groupId, { amount: 900, splitBetween: [ann.id, bob.id, cy.id] });
  await payable(api, ann, provider);
  return { ann, bob, cy, groupId, invitation };
}

/** Bob pays Ann through the provider, and the provider says it succeeded: the settlement. */
async function even(groupId: string, ann: Person, bob: Person) {
  const paid = await api.payThrough(bob, groupId, ann, 300);
  await provider.webhook(api, provider.paymentFor(paid).id, 'succeeded');
  return paid;
}

describe('archive a group', () => {
  it("archives a group once everyone is even, and refuses every change in it by one rule's name", async () => {
    const { ann, bob, cy, groupId, invitation } = await flat('archived');
    const paid = await even(groupId, ann, bob);
    await api.cash(ann, groupId, cy, 300);
    const zero = await api.expense(ann, groupId, { amount: 100, splitExactly: [{ memberId: ann.id, amount: 100 }] });
    await api.upload('PUT', `/expenses/${zero}/receipt`, ann.token, JPEG);
    const template = await api.create(`/groups/${groupId}/templates`, bob.token, {
      name: 'Bob and Cy',
      splitBetween: [bob.id, cy.id],
    });
    await api.done('PUT', `/groups/${groupId}/budgets/groceries`, ann.token, { amount: 1000 });
    const recurring = await api.create(`/groups/${groupId}/recurring`, bob.token, {
      description: 'Rent',
      amount: 1000,
      startsOn: monthly(30).startsOn,
      splitBetween: [bob.id],
    });
    const dan = await api.person('dan@archived.archive.test');

    const reads = [
      `/groups/${groupId}/members`,
      `/groups/${groupId}/balances`,
      `/groups/${groupId}/expenses`,
      `/expenses/${zero}`,
      `/expenses/${zero}/receipt`,
      `/groups/${groupId}/members/${bob.id}/statement`,
      `/groups/${groupId}/settlements`,
      `/settlements/${paid}`,
      `/groups/${groupId}/settlements/suggested`,
      `/groups/${groupId}/budgets`,
      `/groups/${groupId}/templates`,
      `/groups/${groupId}/recurring`,
      `/recurring/${recurring}`,
    ];
    const read = async (token: string) => Promise.all(reads.map(path => api.read(path, token)));
    const before = await read(cy.token);
    const group = await api.read(`/groups/${groupId}`, cy.token);

    expect(await api.refused('POST', `/groups/${groupId}/archive`, bob.token)).toBe(true);
    await api.done('POST', `/groups/${groupId}/archive`, ann.token);
    const archived = await api.read(`/groups/${groupId}`, bob.token);
    expect(archived).toEqual({ ...group, archivedAt: expect.stringMatching(TIME) });
    expect((await api.list('/groups/mine', cy.token)).find(each => each.id === groupId)).toEqual(archived);

    const refunds = provider.refunds.length;
    const files = store.files.length;
    const writes: [string, () => Promise<Outcome>][] = [
      [
        'record an expense',
        () =>
          api.act('POST', `/groups/${groupId}/expenses`, ann.token, {
            description: 'Late',
            amount: 100,
            date: day(0),
            splitExactly: [{ memberId: ann.id, amount: 100 }],
          }),
      ],
      [
        'edit an expense',
        () =>
          api.act('PUT', `/expenses/${zero}`, ann.token, {
            description: 'Edited',
            amount: 100,
            date: day(0),
            splitExactly: [{ memberId: ann.id, amount: 100 }],
            version: 1,
          }),
      ],
      ['delete an expense', () => api.act('DELETE', `/expenses/${zero}`, ann.token)],
      ['attach a receipt', () => api.upload('PUT', `/expenses/${zero}/receipt`, ann.token, PNG)],
      [
        'record a settlement in cash',
        () => api.act('POST', `/groups/${groupId}/settlements/cash`, ann.token, { from: bob.id, amount: 1 }),
      ],
      [
        'ask to pay through the provider',
        () => api.act('POST', `/groups/${groupId}/settlements/provider`, bob.token, { to: ann.id, amount: 1 }),
      ],
      ['refund a settlement', () => api.act('POST', `/settlements/${paid}/refund`, ann.token)],
      ['create an invitation', () => api.act('POST', `/groups/${groupId}/invitations`, bob.token)],
      ['join', () => api.act('POST', `/invitations/${invitation}/accept`, dan.token)],
      ['leave', () => api.act('POST', `/groups/${groupId}/leave`, cy.token)],
      [
        'set up a recurring expense',
        () =>
          api.act('POST', `/groups/${groupId}/recurring`, bob.token, {
            description: 'Water',
            amount: 100,
            startsOn: monthly(30).startsOn,
            splitBetween: [bob.id],
          }),
      ],
      ['stop a recurring expense', () => api.act('DELETE', `/recurring/${recurring}`, bob.token)],
      ['set a budget', () => api.act('PUT', `/groups/${groupId}/budgets/rent`, ann.token, { amount: 100 })],
      ['remove a budget', () => api.act('DELETE', `/groups/${groupId}/budgets/groceries`, ann.token)],
      [
        'save a template',
        () => api.act('POST', `/groups/${groupId}/templates`, bob.token, { name: 'Bob', splitBetween: [bob.id] }),
      ],
      [
        'replace a template',
        () => api.act('PUT', `/templates/${template}`, bob.token, { name: 'Bob', splitBetween: [bob.id] }),
      ],
      ['remove a template', () => api.act('DELETE', `/templates/${template}`, bob.token)],
      ['archive it again', () => api.act('POST', `/groups/${groupId}/archive`, ann.token)],
    ];
    const outcomes: [string, Outcome][] = [];
    for (const [what, write] of writes) outcomes.push([what, await write()]);
    expect(outcomes.filter(([, outcome]) => outcome.accepted).map(([what]) => what)).toEqual([]);
    // Refused later, every one is refused by the same rule, under one name.
    const names = new Set(outcomes.filter(([, outcome]) => outcome.later).map(([, outcome]) => outcome.error?.type));
    expect(names.size).toBeLessThanOrEqual(1);
    expect(provider.refunds).toHaveLength(refunds);
    expect(store.files).toHaveLength(files);
    expect(await read(bob.token)).toEqual(before);
    expect(await api.read(`/groups/${groupId}`, ann.token)).toEqual(archived);
    expect((await api.list(`/groups/${groupId}/members`, ann.token)).map(each => each.memberId)).toEqual([
      ann.id,
      bob.id,
      cy.id,
    ]);

    // An archived group stays archived, across a restart.
    await kill(server);
    server = await start(db.path, environment);
    api = client(server.port);
    const token = await api.login(cy.email);
    expect(await api.refused('POST', `/groups/${groupId}/leave`, token)).toBe(true);
    expect(await api.read(`/groups/${groupId}`, token)).toEqual(archived);
  }, 90000);

  it('refuses to archive a group while a balance is not 0 or a payment waits at the provider, and to anyone but its owner', async () => {
    const { ann, bob, cy, groupId } = await flat('refused');
    const archive = (token: string) => api.refused('POST', `/groups/${groupId}/archive`, token);
    expect(await archive(ann.token)).toBe(true);
    const paid = await even(groupId, ann, bob);
    await api.cash(ann, groupId, cy, 300);
    // Refunding: still counted, every balance 0, and a payment that waits at the provider.
    await api.done('POST', `/settlements/${paid}/refund`, ann.token);
    expect((await api.balances(groupId, ann.token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0, [cy.id]: 0 });
    expect(await archive(ann.token)).toBe(true);
    await provider.webhook(api, provider.paymentFor(paid).id, 'refunded');
    expect(await archive(ann.token)).toBe(true);
    await api.cash(ann, groupId, bob, 300);
    expect(await archive(bob.token)).toBe(true);
    expect(await archive(cy.token)).toBe(true);
    expect((await api.read(`/groups/${groupId}`, ann.token)).archivedAt).toBeUndefined();
    await api.done('POST', `/groups/${groupId}/archive`, ann.token);
    expect((await api.read(`/groups/${groupId}`, ann.token)).archivedAt).toMatch(TIME);
    const out = await api.person('out@refused.archive.test');
    expect(await api.refused('POST', `/groups/${groupId}/archive`, out.token)).toBe(true);
  }, 60000);

  it('records no expense of a recurring expense in an archived group', async () => {
    // Set up and archived on a server whose job runs once an hour, then left to a server whose job runs every second.
    const idle = database('archive-idle');
    const hourly = await start(idle.path, { JOBS_INTERVAL_SECONDS: '3600' });
    let running: Running | undefined;
    try {
      const through = client(hourly.port);
      const ann = await through.person('ann@recurring.archive.test');
      const bob = await through.person('bob@recurring.archive.test');
      const groupId = await through.groupOf(ann, [bob]);
      const id = await through.create(`/groups/${groupId}/recurring`, ann.token, {
        description: 'Rent',
        amount: 1000,
        startsOn: monthly(-40).startsOn,
        splitBetween: [ann.id, bob.id],
      });
      await through.done('POST', `/groups/${groupId}/archive`, ann.token);
      await stop(hourly);
      running = await start(idle.path);
      const after = client(running.port);
      const token = await after.login(bob.email);
      await sleep(bySweep(0));
      expect(await after.list(`/groups/${groupId}/expenses`, token)).toEqual([]);
      expect((await after.balances(groupId, token)).of).toEqual({ [ann.id]: 0, [bob.id]: 0 });
      expect((await after.read(`/recurring/${id}`, token)).id).toBe(id);
      const notices: Json[] = await after.notices(token);
      expect(notices).toEqual([]);
    } finally {
      if (running) await stop(running);
      else await stop(hourly);
      idle.remove();
    }
  }, 60000);
});
