import { acceptance } from './support';

/** Feature 6 of the benchmark backlog: a plan and a ten-note quota. */
const { client, stop } = acceptance();
afterAll(stop);

describe('a plan and a ten-note quota', () => {
  it('starts on Free, refuses an eleventh note, and lets the person switch plans', async () => {
    const { call, command, account, note, list } = client();
    const person = await account('quota@acceptance.test');
    expect((await call('GET', '/plans/me', person.token)).body).toEqual({ plan: 'free', noteLimit: 10 });

    const ids: string[] = [];
    for (let index = 1; index <= 10; index++) ids.push(await note(person.token, `Note ${index}`));
    // Archived notes count.
    expect(await command('POST', `/notes/${ids[0]}/archive`, person.token)).toBe('SUCCESS');
    expect(await command('POST', '/notes', person.token, { title: 'Eleventh', text: '' })).toBe('ERROR');

    expect(await command('PUT', '/plans/me', person.token, { plan: 'unlimited' })).toBe('SUCCESS');
    expect((await call('GET', '/plans/me', person.token)).body).toEqual({ plan: 'unlimited', noteLimit: null });
    expect(await command('POST', '/notes', person.token, { title: 'Eleventh', text: '' })).toBe('SUCCESS');
    expect(await command('POST', '/notes', person.token, { title: 'Twelfth', text: '' })).toBe('SUCCESS');

    expect(await command('PUT', '/plans/me', person.token, { plan: 'free' })).toBe('SUCCESS');
    expect((await call('GET', '/plans/me', person.token)).body).toEqual({ plan: 'free', noteLimit: 10 });
    expect(await list('/notes', person.token)).toHaveLength(12);
    expect(await command('POST', '/notes', person.token, { title: 'Thirteenth', text: '' })).toBe('ERROR');
  });

  it('counts each person on their own, refuses a plan that does not exist and an anonymous caller', async () => {
    const { call, command, account, note } = client();
    const busy = await account('busy@acceptance.test');
    const fresh = await account('fresh@acceptance.test');
    for (let index = 1; index <= 10; index++) await note(busy.token, `Busy ${index}`);
    expect(await command('POST', '/notes', fresh.token, { title: 'Mine', text: '' })).toBe('SUCCESS');

    expect(await command('PUT', '/plans/me', fresh.token, { plan: 'gold' })).toBe('ERROR');
    expect((await call('GET', '/plans/me', fresh.token)).body).toEqual({ plan: 'free', noteLimit: 10 });
    expect((await call('GET', '/plans/me')).status).toBe(403);
  });
});
