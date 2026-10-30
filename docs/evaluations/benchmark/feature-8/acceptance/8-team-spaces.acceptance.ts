import { Json, acceptance, eventually } from './support';

/** Feature 8 of the benchmark: team spaces — members and roles, seats, notes, search, activity, telling. */
const { client, stop } = acceptance();
afterAll(stop);
const SLOW = 60_000;

type Account = { id: string; token: string };
const kinds = (list: Json[], kind: string) => list.filter(each => each.kind === kind);

/** A space created by `admin`, with each other account invited at its role and accepted. */
async function space(admin: Account, name: string, members: [Account, string][] = []): Promise<string> {
  const { call, command, outcome } = client();
  const created = await outcome(await call('POST', '/spaces', admin.token, { name }), admin.token);
  expect(created.status).toBe('SUCCESS');
  const id = String(created.result);
  for (const [member, role] of members) {
    expect(await command('POST', `/spaces/${id}/invitations`, admin.token, { accountId: member.id, role })).toBe(
      'SUCCESS',
    );
    expect(await command('POST', `/spaces/${id}/accept`, member.token)).toBe('SUCCESS');
  }
  return id;
}
const spaceNote = async (author: Account, spaceId: string, title: string, text = '') => {
  const { call, outcome } = client();
  const written = await outcome(await call('POST', '/notes', author.token, { title, text, spaceId }), author.token);
  return written;
};

describe('team spaces', () => {
  it(
    'creates a space, invites by account id, and lists members and roles',
    async () => {
      const { call, command, account, list } = client();
      const [ada, bob, carl, stranger] = await Promise.all(
        ['ada@spaces.test', 'bob@spaces.test', 'carl@spaces.test', 'x@spaces.test'].map(email => account(email)),
      );
      const id = await space(ada, 'Design');
      expect(await list('/spaces', ada.token)).toEqual([
        expect.objectContaining({ id, name: 'Design', role: 'admin' }),
      ]);
      expect(await command('POST', '/spaces', ada.token, { name: '' })).toBe('ERROR');

      expect(await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: bob.id, role: 'editor' })).toBe(
        'SUCCESS',
      );
      expect(await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: bob.id, role: 'reader' })).toBe(
        'ERROR',
      );
      expect(
        await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: 'no-such-account', role: 'reader' }),
      ).toBe('ERROR');
      const pending = (await call('GET', `/spaces/${id}`, ada.token)).body;
      expect(pending.invitations).toEqual([
        expect.objectContaining({ accountId: bob.id, role: 'editor', invitedAt: expect.any(String) }),
      ]);

      expect(await command('POST', `/spaces/${id}/accept`, bob.token)).toBe('SUCCESS');
      expect(await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: bob.id, role: 'reader' })).toBe(
        'ERROR',
      );
      expect(
        await command('POST', `/spaces/${id}/invitations`, bob.token, { accountId: carl.id, role: 'reader' }),
      ).toBe('ERROR');
      expect(
        await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: carl.id, role: 'reader' }),
      ).toBe('SUCCESS');
      expect(await command('POST', `/spaces/${id}/decline`, carl.token)).toBe('SUCCESS');
      expect(await command('POST', `/spaces/${id}/accept`, carl.token)).toBe('ERROR');

      const details = (await call('GET', `/spaces/${id}`, bob.token)).body;
      expect(details).toEqual(expect.objectContaining({ id, name: 'Design', invitations: [] }));
      expect([...(details.members as Json[])].map(m => `${m.accountId}:${m.role}`).sort()).toEqual(
        [`${ada.id}:admin`, `${bob.id}:editor`].sort(),
      );
      expect(await list('/spaces', bob.token)).toEqual([expect.objectContaining({ id, role: 'editor' })]);
      expect((await call('GET', `/spaces/${id}`, stranger.token)).status).toBe(404);
      expect((await call('GET', '/spaces')).status).toBe(403);
    },
    SLOW,
  );

  it(
    'lets editors write the space’s notes and readers only read them, outside anyone’s personal notes',
    async () => {
      const { call, command, account, list } = client();
      const [ada, bob, carl, stranger] = await Promise.all(
        ['ada2@spaces.test', 'bob2@spaces.test', 'carl2@spaces.test', 'x2@spaces.test'].map(email => account(email)),
      );
      const id = await space(ada, 'Writers', [
        [bob, 'editor'],
        [carl, 'reader'],
      ]);
      const written = await spaceNote(bob, id, 'Roadmap', 'q3');
      expect(written.status).toBe('SUCCESS');
      const noteId = String(written.result);
      expect((await spaceNote(carl, id, 'Not mine to write')).status).toBe('ERROR');
      expect((await spaceNote(stranger, id, 'Not a member')).status).toBe('ERROR');

      expect((await call('GET', `/notes/${noteId}`, carl.token)).body).toEqual(
        expect.objectContaining({ id: noteId, spaceId: id }),
      );
      expect((await list(`/notes?space=${id}`, carl.token)).map(each => each.id)).toEqual([noteId]);
      expect((await call('GET', `/notes?space=${id}`, stranger.token)).status).toBe(404);
      expect((await call('GET', `/notes/${noteId}`, stranger.token)).status).toBe(404);
      expect(await list('/notes', bob.token)).toEqual([]);

      expect(await command('PUT', `/notes/${noteId}`, carl.token, { title: 'Reader edit', text: '' })).toBe('ERROR');
      expect(await command('POST', `/notes/${noteId}/archive`, carl.token)).toBe('ERROR');
      expect(await command('PUT', `/notes/${noteId}`, ada.token, { title: 'Roadmap, edited', text: 'q4' })).toBe(
        'SUCCESS',
      );
      expect(await command('POST', `/notes/${noteId}/archive`, bob.token)).toBe('SUCCESS');
      expect(await command('POST', `/notes/${noteId}/restore`, ada.token)).toBe('SUCCESS');

      expect(await command('POST', `/notes/${noteId}/share`, ada.token, { accountId: stranger.id })).toBe('ERROR');
      expect(await command('POST', `/notes/${noteId}/pin`, ada.token)).toBe('ERROR');
      expect(await command('POST', `/notes/${noteId}/tags`, ada.token, { tag: 'team' })).toBe('ERROR');
    },
    SLOW,
  );

  it(
    'counts seats by members, not invitations, and lets an admin buy more',
    async () => {
      const { call, command, account } = client();
      const [ada, bob, carl, dave, erin] = await Promise.all(
        ['ada3@spaces.test', 'bob3@spaces.test', 'carl3@spaces.test', 'dave3@spaces.test', 'erin3@spaces.test'].map(
          email => account(email),
        ),
      );
      const id = await space(ada, 'Seats', [
        [bob, 'editor'],
        [carl, 'reader'],
      ]);
      expect((await call('GET', `/plans/spaces/${id}`, carl.token)).body).toEqual({
        plan: 'free',
        seats: 3,
        noteLimit: 50,
      });
      expect((await call('GET', `/plans/spaces/${id}`, dave.token)).status).toBe(404);

      expect(
        await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: dave.id, role: 'reader' }),
      ).toBe('SUCCESS');
      expect(await command('POST', `/spaces/${id}/accept`, dave.token)).toBe('ERROR');

      expect(await command('PUT', `/plans/spaces/${id}`, bob.token, { plan: 'team', seats: 5 })).toBe('ERROR');
      expect(await command('PUT', `/plans/spaces/${id}`, ada.token, { plan: 'team', seats: 2 })).toBe('ERROR');
      expect(await command('PUT', `/plans/spaces/${id}`, ada.token, { plan: 'team', seats: 4 })).toBe('SUCCESS');
      expect((await call('GET', `/plans/spaces/${id}`, ada.token)).body).toEqual({
        plan: 'team',
        seats: 4,
        noteLimit: null,
      });
      expect(await command('POST', `/spaces/${id}/accept`, dave.token)).toBe('SUCCESS');

      expect(
        await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: erin.id, role: 'reader' }),
      ).toBe('SUCCESS');
      expect(await command('POST', `/spaces/${id}/accept`, erin.token)).toBe('ERROR');
      expect(await command('PUT', `/plans/spaces/${id}`, ada.token, { plan: 'free' })).toBe('ERROR');
    },
    SLOW,
  );

  it('keeps a space’s notes to the space’s limit, never to a personal quota', async () => {
    const { command, account, note } = client();
    const ada = await account('ada4@spaces.test');
    for (let index = 1; index <= 10; index++) await note(ada.token, `Personal ${index}`);
    expect(await command('POST', '/notes', ada.token, { title: 'Eleventh', text: '' })).toBe('ERROR');

    const id = await space(ada, 'Big');
    for (let index = 1; index <= 50; index++)
      expect((await spaceNote(ada, id, `Team ${index}`)).status).toBe('SUCCESS');
    expect((await spaceNote(ada, id, 'Fifty-first')).status).toBe('ERROR');
    expect(await command('PUT', `/plans/spaces/${id}`, ada.token, { plan: 'team', seats: 3 })).toBe('SUCCESS');
    expect((await spaceNote(ada, id, 'Fifty-first')).status).toBe('SUCCESS');
  }, 120_000);

  it(
    'removes members, changes roles, keeps one admin, and tells the people concerned',
    async () => {
      const { call, command, account, list } = client();
      const [ada, bob, carl] = await Promise.all(
        ['ada5@spaces.test', 'bob5@spaces.test', 'carl5@spaces.test'].map(email => account(email)),
      );
      const id = await space(ada, 'Crew', [
        [bob, 'editor'],
        [carl, 'editor'],
      ]);
      const written = await spaceNote(carl, id, 'Carl wrote this');
      const noteId = String(written.result);

      expect(await command('POST', `/spaces/${id}/leave`, ada.token)).toBe('ERROR');
      expect(await command('POST', `/spaces/${id}/members/${ada.id}/role`, ada.token, { role: 'reader' })).toBe(
        'ERROR',
      );
      expect(await command('POST', `/spaces/${id}/members/${ada.id}/remove`, bob.token)).toBe('ERROR');

      expect(await command('POST', `/spaces/${id}/members/${carl.id}/remove`, ada.token)).toBe('SUCCESS');
      expect((await call('GET', `/spaces/${id}`, carl.token)).status).toBe(404);
      expect((await call('GET', `/notes/${noteId}`, carl.token)).status).toBe(404);
      expect((await call('GET', `/notes/${noteId}`, ada.token)).status).toBe(200);

      expect(await command('POST', `/spaces/${id}/members/${bob.id}/role`, ada.token, { role: 'reader' })).toBe(
        'SUCCESS',
      );
      expect((await spaceNote(bob, id, 'Now a reader')).status).toBe('ERROR');
      expect(await command('POST', `/spaces/${id}/leave`, bob.token)).toBe('SUCCESS');
      expect(await list('/spaces', bob.token)).toEqual([]);

      const removal = await eventually(
        async () => kinds(await list('/notifications', carl.token), 'space-removal'),
        found => found.length === 1,
      );
      expect(removal).toEqual([
        {
          id: expect.any(String),
          kind: 'space-removal',
          spaceId: id,
          spaceName: 'Crew',
          removedAt: expect.any(String),
        },
      ]);
      const roleChanged = await eventually(
        async () => kinds(await list('/notifications', bob.token), 'space-role-changed'),
        found => found.length === 1,
      );
      expect(roleChanged).toEqual([
        {
          id: expect.any(String),
          kind: 'space-role-changed',
          spaceId: id,
          spaceName: 'Crew',
          role: 'reader',
          changedAt: expect.any(String),
        },
      ]);
    },
    SLOW,
  );

  it(
    'tells the invited account of its invitation',
    async () => {
      const { command, account, list, outcome, call } = client();
      const [ada, bob] = await Promise.all(['ada6@spaces.test', 'bob6@spaces.test'].map(email => account(email)));
      const id = String(
        (await outcome(await call('POST', '/spaces', ada.token, { name: 'Invites' }), ada.token)).result,
      );
      expect(await command('POST', `/spaces/${id}/invitations`, ada.token, { accountId: bob.id, role: 'editor' })).toBe(
        'SUCCESS',
      );
      const told = await eventually(
        async () => kinds(await list('/notifications', bob.token), 'space-invitation'),
        found => found.length === 1,
      );
      expect(told).toEqual([
        {
          id: expect.any(String),
          kind: 'space-invitation',
          spaceId: id,
          spaceName: 'Invites',
          role: 'editor',
          invitedAt: expect.any(String),
        },
      ]);
    },
    SLOW,
  );

  it(
    'finds the notes a person can read, by every word, newest first, and forgets a space one leaves',
    async () => {
      const { call, command, account, note, list } = client();
      const [ada, bob, carl] = await Promise.all(
        ['ada7@spaces.test', 'bob7@spaces.test', 'carl7@spaces.test'].map(email => account(email)),
      );
      const id = await space(ada, 'Search', [[bob, 'reader']]);
      const personal = await note(bob.token, 'Alpha plan', 'my own');
      const shared = await note(carl.token, 'Shared ALPHA', 'from carl, plan inside');
      expect(await command('POST', `/notes/${shared}/share`, carl.token, { accountId: bob.id })).toBe('SUCCESS');
      const team = String((await spaceNote(ada, id, 'alpha budget', 'the plan for the team')).result);
      const archived = await note(bob.token, 'Alpha archived plan');
      expect(await command('POST', `/notes/${archived}/archive`, bob.token)).toBe('SUCCESS');
      await note(carl.token, 'Alpha plan of carl only');

      const found = await eventually(
        () => list('/search?q=alpha%20plan', bob.token),
        results => results.length === 3,
      );
      expect(found.map(each => each.noteId)).toEqual([team, shared, personal]);
      expect(found[0]).toEqual({ noteId: team, title: 'alpha budget', spaceId: id });
      expect(found[2]).toEqual({ noteId: personal, title: 'Alpha plan', spaceId: null });
      expect(await list('/search?q=budget%20nothing', bob.token)).toEqual([]);

      expect(await command('POST', `/spaces/${id}/members/${bob.id}/remove`, ada.token)).toBe('SUCCESS');
      const after = await eventually(
        () => list('/search?q=alpha', bob.token),
        results => !results.some(each => each.noteId === team),
      );
      expect(after.map(each => each.noteId)).toEqual([shared, personal]);
      expect((await call('GET', '/search?q=alpha')).status).toBe(403);
    },
    SLOW,
  );

  it(
    'records a space’s activity for its admins',
    async () => {
      const { call, command, account, list } = client();
      const [ada, bob] = await Promise.all(['ada8@spaces.test', 'bob8@spaces.test'].map(email => account(email)));
      const id = await space(ada, 'Audited', [[bob, 'editor']]);
      const noteId = String((await spaceNote(bob, id, 'Logged')).result);
      expect(await command('PUT', `/notes/${noteId}`, ada.token, { title: 'Logged, edited', text: '' })).toBe(
        'SUCCESS',
      );
      expect(await command('POST', `/notes/${noteId}/archive`, ada.token)).toBe('SUCCESS');
      expect(await command('POST', `/spaces/${id}/members/${bob.id}/role`, ada.token, { role: 'reader' })).toBe(
        'SUCCESS',
      );

      const activity = await eventually(
        () => list(`/audit/spaces/${id}`, ada.token),
        found => found.length >= 6,
      );
      expect(activity.map(each => `${each.action}:${each.actorId}:${each.subject}`)).toEqual([
        `role-changed:${ada.id}:${bob.id}`,
        `note-archived:${ada.id}:${noteId}`,
        `note-edited:${ada.id}:${noteId}`,
        `note-written:${bob.id}:${noteId}`,
        `member-joined:${bob.id}:${bob.id}`,
        `member-invited:${ada.id}:${bob.id}`,
      ]);
      expect(activity.every(each => !Number.isNaN(Date.parse(String(each.at))))).toBe(true);
      expect((await call('GET', `/audit/spaces/${id}`, bob.token)).status).toBe(403);
    },
    SLOW,
  );
});
