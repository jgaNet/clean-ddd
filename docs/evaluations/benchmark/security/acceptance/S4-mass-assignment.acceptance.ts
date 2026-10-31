import { Answer, Json, server } from './security';

/**
 * Probe S4 of the security audit: a body carries what its route takes, and nothing else gets in.
 * A field the client adds (an owner, an identity, a role, a state) is ignored or refused; it never
 * becomes the account's or the note's.
 */
let audited: Awaited<ReturnType<typeof server>>;
beforeAll(async () => {
  audited = await server('mass-assignment');
}, 120000);
afterAll(() => audited?.close());

/** What a request with extra fields came to: refused, or the operation's outcome. */
const attempt = async (answer: Answer, outcome: (accepted: Answer) => Promise<Json>) => {
  if (answer.status >= 500) throw new Error(`answered ${answer.status}`);
  if (answer.status !== 202) return undefined;
  const ended = await outcome(answer);
  return ended.status === 'SUCCESS' ? ended : undefined;
};

describe('fields a client adds to a body', () => {
  it('makes no administrator, chosen identity or paid plan from a sign-up', async () => {
    const { call, outcome, login } = audited;
    const email = 'eve@security.test';
    const signedUp = await attempt(
      await call('POST', '/accounts', undefined, {
        email,
        password: 'secret123',
        id: 'chosen-account-id',
        role: 'admin',
        roles: ['admin'],
        isAdmin: true,
        admin: true,
        plan: 'unlimited',
        noteLimit: null,
      }),
      answer => outcome(answer),
    );
    if (!signedUp) return; // refused for its shape: nothing got in
    expect(signedUp.result).not.toBe('chosen-account-id');
    const token = await login(email);
    const me = (await call('GET', '/accounts/me', token)).body;
    expect(me.id).not.toBe('chosen-account-id');
    expect(JSON.stringify(me)).not.toMatch(/admin/i);
    expect((await call('GET', '/plans/me', token)).body).toEqual(
      expect.objectContaining({ plan: 'free', noteLimit: 10 }),
    );
  }, 120000);

  it("makes no note someone else's, chosen, pinned, archived, tagged, shared or dated by its body", async () => {
    const { call, outcome, account, note, read, ids } = audited;
    const ada = await account('ada@security.test');
    const bob = await account('bob@security.test');
    const written = await attempt(
      await call('POST', '/notes', ada.token, {
        title: 'With extras',
        text: '',
        id: 'chosen-note-id',
        ownerId: bob.id,
        pinned: true,
        archived: true,
        tags: ['injected'],
        sharedWith: [bob.id],
        createdAt: '2000-01-01T00:00:00.000Z',
        remindAt: '2000-01-01T00:00:00.000Z',
      }),
      answer => outcome(answer, ada.token),
    );
    if (written) {
      const id = String(written.result);
      expect(id).not.toBe('chosen-note-id');
      expect(await read(ada.token, id)).toEqual(
        expect.objectContaining({ title: 'With extras', archived: false, pinned: false, tags: [], sharedWith: [] }),
      );
      expect(String((await read(ada.token, id)).createdAt)).not.toMatch(/^2000/);
      expect((await call('GET', `/notes/${id}`, bob.token)).status).toBeGreaterThanOrEqual(400);
      expect(await ids('/notes/shared', bob.token)).not.toContain(id);
    }

    const plain = await note(ada.token, 'Edited with extras');
    await attempt(
      await call('PUT', `/notes/${plain}`, ada.token, {
        title: 'Edited',
        text: '',
        ownerId: bob.id,
        archived: true,
        pinned: true,
        sharedWith: [bob.id],
      }),
      answer => outcome(answer, ada.token),
    );
    expect(await read(ada.token, plain)).toEqual(
      expect.objectContaining({ archived: false, pinned: false, sharedWith: [] }),
    );
    expect((await call('GET', `/notes/${plain}`, bob.token)).status).toBeGreaterThanOrEqual(400);
  }, 120000);

  it("keeps the free plan's limit, whatever limit the body asks for", async () => {
    const { call, outcome, account } = audited;
    const carl = await account('carl@security.test');
    await attempt(await call('PUT', '/plans/me', carl.token, { plan: 'free', noteLimit: 1000 }), answer =>
      outcome(answer, carl.token),
    );
    expect((await call('GET', '/plans/me', carl.token)).body).toEqual(
      expect.objectContaining({ plan: 'free', noteLimit: 10 }),
    );
  }, 120000);
});
