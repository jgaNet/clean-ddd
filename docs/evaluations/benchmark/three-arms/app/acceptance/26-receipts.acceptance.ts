import {
  client,
  Client,
  database,
  JPEG,
  padded,
  PDF,
  PNG,
  ReceiptStore,
  receiptStore,
  Running,
  start,
  stop,
} from './tally';

/** Request 26: a receipt, a JPEG or a PNG of at most 2 MB, kept in the receipts store the server is started with. */
const db = database('receipts');
let store: ReceiptStore;
let server: Running;
let api: Client;
beforeAll(async () => {
  store = receiptStore();
  server = await start(db.path, await store.environment());
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await store.close();
  db.remove();
});

const LIMIT = 2_097_152;

/** Three people in a group, Ann owns it; Bob paid an expense of the three. */
async function flat(tag: string) {
  const ann = await api.person(`ann@${tag}.receipts.test`);
  const bob = await api.person(`bob@${tag}.receipts.test`);
  const cy = await api.person(`cy@${tag}.receipts.test`);
  const groupId = await api.groupOf(ann, [bob, cy]);
  const expenseId = await api.expense(bob, groupId, { amount: 8700, splitBetween: [ann.id, bob.id, cy.id] });
  return { ann, bob, cy, groupId, expenseId };
}

describe('receipts', () => {
  it('attaches a JPEG or a PNG receipt through the store, and reads its type, its size and its link', async () => {
    const { ann, bob, cy, expenseId } = await flat('attached');
    const before = await api.read(`/expenses/${expenseId}`, cy.token);
    const sent = store.files.length;
    expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, bob.token, JPEG)).accepted).toBe(true);
    expect(store.files).toHaveLength(sent + 1);
    const kept = store.files[sent];
    expect(kept.type).toMatch(/^image\/jpeg/);
    expect(kept.bytes.equals(JPEG)).toBe(true);
    expect(await api.read(`/expenses/${expenseId}/receipt`, cy.token)).toEqual({
      type: 'image/jpeg',
      size: JPEG.length,
      url: kept.url,
    });
    const fetched = await fetch(kept.url);
    expect(Buffer.from(await fetched.arrayBuffer()).equals(JPEG)).toBe(true);

    // The owner replaces it with a PNG; a receipt is no edit, and the expense keeps its version.
    expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, ann.token, PNG)).accepted).toBe(true);
    expect(await api.read(`/expenses/${expenseId}/receipt`, bob.token)).toEqual({
      type: 'image/png',
      size: PNG.length,
      url: store.files[sent + 1].url,
    });
    expect(await api.read(`/expenses/${expenseId}`, cy.token)).toEqual(before);
  }, 60000);

  it('refuses a file of another type, an empty one or one over 2 MB, and sends nothing to the store', async () => {
    const { bob, cy, expenseId } = await flat('refused');
    const sent = store.files.length;
    const files: [string, Buffer][] = [
      ['a PDF', PDF],
      ['text', Buffer.from('a receipt, honestly')],
      ['the start of a JPEG only', JPEG.subarray(0, 2)],
      ['an empty file', Buffer.alloc(0)],
      ['a PNG one byte over 2 MB', padded(PNG, LIMIT + 1)],
    ];
    const accepted: string[] = [];
    for (const [what, bytes] of files)
      if ((await api.upload('PUT', `/expenses/${expenseId}/receipt`, bob.token, bytes)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    expect(store.files).toHaveLength(sent);
    expect(await api.hidden(`/expenses/${expenseId}/receipt`, cy.token)).toBe(404);

    expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, bob.token, padded(PNG, LIMIT))).accepted).toBe(
      true,
    );
    expect(await api.read(`/expenses/${expenseId}/receipt`, cy.token)).toMatchObject({
      type: 'image/png',
      size: LIMIT,
    });
    expect(store.files[sent].bytes.equals(padded(PNG, LIMIT))).toBe(true);
  }, 60000);

  it("lets the payer or the owner attach one, and its group's members only read it", async () => {
    const { ann, bob, cy, expenseId } = await flat('who');
    const out = await api.person('out@who.receipts.test');
    const sent = store.files.length;
    expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, cy.token, JPEG)).accepted).toBe(false);
    expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, out.token, JPEG)).accepted).toBe(false);
    expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, undefined, JPEG)).status).toBe(401);
    expect(store.files).toHaveLength(sent);
    await api.upload('PUT', `/expenses/${expenseId}/receipt`, bob.token, JPEG);
    expect(await api.hidden(`/expenses/${expenseId}/receipt`, out.token)).toBe(404);
    expect(await api.hidden(`/expenses/${expenseId}/receipt`)).toBe(401);
    expect(await api.hidden('/expenses/no-such-expense/receipt', ann.token)).toBe(404);
    await api.done('DELETE', `/expenses/${expenseId}`, ann.token);
    expect(await api.hidden(`/expenses/${expenseId}/receipt`, ann.token)).toBe(404);
  }, 60000);

  it('refuses a receipt while the store fails or is not there, and keeps the one the expense had', async () => {
    const { bob, cy, expenseId } = await flat('down');
    await api.upload('PUT', `/expenses/${expenseId}/receipt`, bob.token, JPEG);
    const had = await api.read(`/expenses/${expenseId}/receipt`, cy.token);
    store.state.refusing = true;
    try {
      expect((await api.upload('PUT', `/expenses/${expenseId}/receipt`, bob.token, PNG)).accepted).toBe(false);
    } finally {
      store.state.refusing = false;
    }
    expect(await api.read(`/expenses/${expenseId}/receipt`, cy.token)).toEqual(had);
    // A server started without RECEIPTS_URL, on the same database.
    const bare = await start(db.path);
    try {
      const other = client(bare.port);
      const token = await other.login(bob.email);
      expect((await other.upload('PUT', `/expenses/${expenseId}/receipt`, token, PNG)).accepted).toBe(false);
      expect(await other.read(`/expenses/${expenseId}/receipt`, token)).toEqual(had);
    } finally {
      await stop(bare);
    }
  }, 60000);
});
