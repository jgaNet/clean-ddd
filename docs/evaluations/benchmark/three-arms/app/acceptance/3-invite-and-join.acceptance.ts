import { client, Client, database, Running, sleep, start, stop } from './tally';

/** Request 3: an invitation by a link, joining, and the members in the order they joined. */
const db = database('members');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const at = (time: unknown) => Date.parse(String(time));

describe('invite and join', () => {
  it('lets anyone signed in with the link read the invitation and join, and lists the members in the order they joined', async () => {
    const ann = await api.person('ann@members.test', 'Ann');
    const bob = await api.person('bob@members.test', 'Bob');
    const cy = await api.person('cy@members.test', 'Cy');
    const groupId = await api.group(ann, 'The flat');
    const invitation = await api.invite(ann, groupId);
    expect(invitation.length).toBeGreaterThanOrEqual(16);

    expect(await api.read(`/invitations/${invitation}`, bob.token)).toEqual({
      id: invitation,
      groupId,
      groupName: 'The flat',
      invitedBy: ann.id,
    });
    await sleep(1100);
    await api.join(bob, invitation);
    await sleep(1100);
    await api.join(cy, invitation);

    const members = await api.list(`/groups/${groupId}/members`, cy.token);
    expect(members.map(each => [each.memberId, each.name, each.role])).toEqual([
      [ann.id, 'Ann', 'owner'],
      [bob.id, 'Bob', 'member'],
      [cy.id, 'Cy', 'member'],
    ]);
    expect(at(members[0].joinedAt)).toBeLessThan(at(members[1].joinedAt));
    expect(at(members[1].joinedAt)).toBeLessThan(at(members[2].joinedAt));
    expect(await api.read(`/groups/${groupId}`, bob.token)).toMatchObject({ id: groupId, ownerId: ann.id });
    expect((await api.list('/groups/mine', bob.token)).map(each => each.id)).toEqual([groupId]);
  }, 60000);

  it('lets any member invite, and one link serve many people', async () => {
    const ann = await api.person('ann2@members.test');
    const bob = await api.person('bob2@members.test');
    const dan = await api.person('dan2@members.test');
    const eve = await api.person('eve2@members.test');
    const groupId = await api.groupOf(ann, [bob]);

    const bobs = await api.invite(bob, groupId);
    expect(bobs).not.toBe(await api.invite(ann, groupId));
    expect((await api.read(`/invitations/${bobs}`, dan.token)).invitedBy).toBe(bob.id);
    await api.join(dan, bobs);
    await api.join(eve, bobs);
    expect((await api.list(`/groups/${groupId}/members`, ann.token)).map(each => each.memberId)).toEqual([
      ann.id,
      bob.id,
      dan.id,
      eve.id,
    ]);
  }, 60000);

  it('refuses joining twice, and keeps the group from anyone who is not a member', async () => {
    const ann = await api.person('ann3@members.test');
    const bob = await api.person('bob3@members.test');
    const out = await api.person('out3@members.test');
    const groupId = await api.group(ann);
    const invitation = await api.invite(ann, groupId);
    await api.join(bob, invitation);

    expect(await api.refused('POST', `/invitations/${invitation}/accept`, bob.token)).toBe(true);
    expect(await api.refused('POST', `/invitations/${invitation}/accept`, ann.token)).toBe(true);
    expect((await api.list(`/groups/${groupId}/members`, ann.token)).map(each => each.memberId)).toEqual([
      ann.id,
      bob.id,
    ]);

    expect(await api.hidden(`/groups/${groupId}`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/members`, out.token)).toBe(404);
    expect(await api.hidden(`/groups/${groupId}/members`)).toBe(401);
    expect(await api.refused('POST', `/groups/${groupId}/invitations`, out.token)).toBe(true);
    expect(await api.hidden(`/invitations/${invitation}`)).toBe(401);
    expect(await api.hidden('/invitations/no-such-invitation', out.token)).toBe(404);
    expect(await api.refused('POST', '/invitations/no-such-invitation/accept', out.token)).toBe(true);
    expect((await api.call('POST', `/invitations/${invitation}/accept`)).status).toBe(401);
  }, 60000);

  it('places a group someone joined among their groups by when it was created', async () => {
    const ann = await api.person('ann4@members.test');
    const bob = await api.person('bob4@members.test');
    const bobs = await api.group(bob, 'Bob first');
    await sleep(1100);
    const anns = await api.group(ann, 'Ann second');
    await sleep(1100);
    const later = await api.group(bob, 'Bob third');
    await api.join(bob, await api.invite(ann, anns));
    await api.group(ann, 'Ann alone');

    expect((await api.list('/groups/mine', bob.token)).map(each => each.id)).toEqual([later, anns, bobs]);
  }, 60000);
});
