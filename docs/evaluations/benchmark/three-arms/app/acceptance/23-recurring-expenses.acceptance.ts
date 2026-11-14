import {
  bySweep,
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  monthly,
  monthsFrom,
  pairs,
  Person,
  Running,
  Share,
  sleep,
  start,
  stop,
} from './tally';

/** Request 23: a recurring expense, whose expenses the background job records on its day of every month. */
const db = database('recurring');
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

/** Three people in a group: Ann owns it, Bob and Cy joined, in that order. */
async function flat(tag: string, through = api) {
  const ann = await through.person(`ann@${tag}.recurring.test`);
  const bob = await through.person(`bob@${tag}.recurring.test`);
  const cy = await through.person(`cy@${tag}.recurring.test`);
  const groupId = await through.groupOf(ann, [bob, cy]);
  return { ann, bob, cy, groupId };
}

/** A recurring expense `payer` sets up in the group. */
const recurring = (through: Client, payer: Person, groupId: string, body: Json) =>
  through.create(`/groups/${groupId}/recurring`, payer.token, { description: 'Rent', ...body });

/** A 29th within the last year: a day no recurring expense starts on. */
function a29th() {
  for (let back = 1; ; back++) {
    const date = `${monthsFrom(`${day(0).slice(0, 7)}-01`, -back).slice(0, 7)}-29`;
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) return date;
  }
}

describe('recurring expenses', () => {
  it('records the expenses of every day that has come at the next run of the background job, never at a read', async () => {
    // A server whose job runs once an hour: setting it up and reading it record nothing.
    const idle = database('recurring-idle');
    const hourly = await start(idle.path, { JOBS_INTERVAL_SECONDS: '3600' });
    let running: Running | undefined;
    try {
      const through = client(hourly.port);
      const { ann, bob, cy, groupId } = await flat('due', through);
      const { startsOn, passed, next } = monthly(-70);
      const id = await recurring(through, ann, groupId, {
        amount: 90000,
        startsOn,
        splitBetween: [ann.id, bob.id, cy.id],
      });
      const set = await through.read(`/recurring/${id}`, bob.token);
      expect(set).toMatchObject({
        id,
        groupId,
        paidBy: ann.id,
        description: 'Rent',
        amount: 90000,
        startsOn,
        next: startsOn,
        splitBetween: [ann.id, bob.id, cy.id],
      });
      expect(await through.list(`/groups/${groupId}/recurring`, cy.token)).toEqual([set]);
      for (let read = 0; read < 6; read++) {
        expect(await through.list(`/groups/${groupId}/expenses`, bob.token)).toEqual([]);
        expect((await through.balances(groupId, cy.token)).of[ann.id]).toBe(0);
        expect((await through.read(`/recurring/${id}`, ann.token)).next).toBe(startsOn);
        await sleep(500);
      }
      await stop(hourly);

      // The same database, with a job every second: every day that has come is recorded at its next run.
      running = await start(idle.path);
      const after = client(running.port);
      const token = await after.login(bob.email);
      const listed = await eventually(
        () => after.list(`/groups/${groupId}/expenses`, token),
        each => each.length >= passed.length,
        bySweep(0),
      );
      expect(listed.map(each => each.date)).toEqual([...passed].reverse());
      for (const each of listed) {
        expect(each).toMatchObject({ description: 'Rent', amount: 90000, paidBy: ann.id, splitKind: 'equal' });
        expect(pairs(each.shares as Share[])).toEqual([
          [ann.id, 30000],
          [bob.id, 30000],
          [cy.id, 30000],
        ]);
      }
      expect((await after.read(`/recurring/${id}`, token)).next).toBe(next);
      expect(await after.balances(groupId, token)).toEqual({
        order: [ann.id, bob.id, cy.id],
        of: { [ann.id]: 60000 * passed.length, [bob.id]: -30000 * passed.length, [cy.id]: -30000 * passed.length },
        sum: 0,
      });
      // Each is an expense like any other: its members are told (request 17).
      const told = await eventually(
        async () => (await after.notices(token)).filter(notice => notice.kind === 'expense'),
        notices => notices.length >= passed.length,
      );
      expect(told.map(notice => notice.expenseId).sort()).toEqual(listed.map(each => each.id).sort());
    } finally {
      if (running) await stop(running);
      else await stop(hourly);
      idle.remove();
    }
  }, 90000);

  it('records each day once, however many servers run on the database, and across a restart', async () => {
    let second = await start(db.path);
    try {
      const other = client(second.port);
      const { ann, bob, groupId } = await flat('once');
      const { startsOn, passed } = monthly(-100);
      await recurring(api, bob, groupId, {
        amount: 3000,
        startsOn,
        splitByShares: [
          { memberId: bob.id, shares: 1 },
          { memberId: ann.id, shares: 2 },
        ],
      });
      const dates = async () =>
        (await other.list(`/groups/${groupId}/expenses`, await other.login(ann.email))).map(each => each.date);
      await eventually(dates, each => each.length >= passed.length, bySweep(0));
      await sleep(3000);
      expect((await dates()).sort()).toEqual([...passed].sort());
      await kill(second);
      second = await start(db.path);
      await sleep(3000);
      const again = client(second.port);
      const listed = await again.list(`/groups/${groupId}/expenses`, await again.login(bob.email));
      expect(listed.map(each => each.date).sort()).toEqual([...passed].sort());
      for (const each of listed)
        expect(pairs(each.shares as Share[])).toEqual([
          [bob.id, 1000],
          [ann.id, 2000],
        ]);
      expect((await api.balances(groupId, ann.token)).of[ann.id]).toBe(-2000 * passed.length);
    } finally {
      await stop(second);
    }
  }, 90000);

  it('refuses a recurring expense whose day, amount or split is not allowed, and waits for a day to come', async () => {
    const { ann, bob, cy, groupId } = await flat('refused');
    const out = await api.person('out@refused.recurring.test');
    const path = `/groups/${groupId}/recurring`;
    const base = { description: 'Rent', amount: 1000, startsOn: monthly(-10).startsOn, splitBetween: [ann.id, bob.id] };
    const refusals: [string, string, Json][] = [
      ['a 29th', ann.token, { ...base, startsOn: a29th() }],
      ['no real day', ann.token, { ...base, startsOn: '2026-13-01' }],
      ['more than 365 days ago', ann.token, { ...base, startsOn: monthly(-400).startsOn }],
      ['more than 365 days ahead', ann.token, { ...base, startsOn: monthly(400).startsOn }],
      ['an amount of 0', ann.token, { ...base, amount: 0 }],
      ['a blank description', ann.token, { ...base, description: '  ' }],
      ['without its payer', cy.token, base],
      ['with someone outside the group', ann.token, { ...base, splitBetween: [ann.id, out.id] }],
      ['by someone outside the group', out.token, { ...base, splitBetween: [out.id] }],
      [
        'exact amounts that do not add up',
        ann.token,
        {
          description: 'Rent',
          amount: 1000,
          startsOn: base.startsOn,
          splitExactly: [
            { memberId: ann.id, amount: 500 },
            { memberId: bob.id, amount: 400 },
          ],
        },
      ],
    ];
    const accepted: string[] = [];
    for (const [what, token, body] of refusals)
      if ((await api.act('POST', path, token, body)).accepted) accepted.push(what);
    expect(accepted).toEqual([]);
    const shapes: Json[] = [
      { description: 'Rent', amount: 1000, splitBetween: [ann.id] },
      { ...base, amount: '1000' },
      { ...base, splitByShares: [{ memberId: ann.id, shares: 1 }] },
      { description: 'Rent', amount: 1000, startsOn: base.startsOn },
    ];
    const answered: string[] = [];
    for (const body of shapes)
      answered.push(`${JSON.stringify(body)}: ${(await api.call('POST', path, ann.token, body)).status}`);
    expect(answered.filter(line => !/: 400$/.test(line))).toEqual([]);
    expect(await api.list(path, ann.token)).toEqual([]);

    // A day to come: nothing yet, at any run.
    const { startsOn } = monthly(10);
    const later = await recurring(api, ann, groupId, {
      amount: 1000,
      startsOn,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: bob.id, amount: 1000 },
      ],
    });
    await sleep(3000);
    expect(await api.read(`/recurring/${later}`, bob.token)).toMatchObject({
      startsOn,
      next: startsOn,
      splitExactly: [
        { memberId: ann.id, amount: 0 },
        { memberId: bob.id, amount: 1000 },
      ],
    });
    expect(await api.list(`/groups/${groupId}/expenses`, ann.token)).toEqual([]);
    expect(await api.hidden(`/recurring/${later}`, out.token)).toBe(404);
    expect(await api.hidden(`/recurring/${later}`)).toBe(401);
    expect(await api.hidden(`/groups/${groupId}/recurring`, out.token)).toBe(404);
  }, 60000);

  it('lets its payer or the owner stop a recurring expense, and ends one whose payer or member has left', async () => {
    const idle = database('recurring-stop');
    const hourly = await start(idle.path, { JOBS_INTERVAL_SECONDS: '3600' });
    let running: Running | undefined;
    try {
      const through = client(hourly.port);
      const { ann, bob, cy, groupId } = await flat('stop', through);
      const { startsOn, passed } = monthly(-40);
      const withCy = await recurring(through, bob, groupId, { amount: 600, startsOn, splitBetween: [bob.id, cy.id] });
      const stopped = await recurring(through, cy, groupId, { amount: 600, startsOn, splitBetween: [ann.id, cy.id] });
      const kept = await recurring(through, ann, groupId, { amount: 600, startsOn, splitBetween: [ann.id, bob.id] });
      expect(await through.refused('DELETE', `/recurring/${withCy}`, cy.token)).toBe(true);
      await through.done('DELETE', `/recurring/${stopped}`, ann.token);
      expect(await through.hidden(`/recurring/${stopped}`, cy.token)).toBe(404);
      expect((await through.list(`/groups/${groupId}/recurring`, bob.token)).map(each => each.id)).toEqual([
        withCy,
        kept,
      ]);
      // Cy leaves before any day was recorded.
      await through.done('POST', `/groups/${groupId}/leave`, cy.token);
      await stop(hourly);

      running = await start(idle.path);
      const after = client(running.port);
      const token = await after.login(ann.email);
      const listed = await eventually(
        () => after.list(`/groups/${groupId}/expenses`, token),
        each => each.length >= passed.length,
        bySweep(0),
      );
      await sleep(2000);
      expect((await after.list(`/groups/${groupId}/expenses`, token)).map(each => each.id)).toEqual(
        listed.map(each => each.id),
      );
      expect(listed.map(each => [each.paidBy, each.date])).toEqual([...passed].reverse().map(date => [ann.id, date]));
      expect(await after.hidden(`/recurring/${withCy}`, token)).toBe(404);
      expect((await after.list(`/groups/${groupId}/recurring`, token)).map(each => each.id)).toEqual([kept]);
    } finally {
      if (running) await stop(running);
      else await stop(hourly);
      idle.remove();
    }
  }, 90000);
});
