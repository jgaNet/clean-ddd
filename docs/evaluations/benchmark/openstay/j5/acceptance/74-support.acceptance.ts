import { adminEnvironment, client, Client, database, Json, Running, sleep, start, stop } from './openstay';

/**
 * Request 74: support tickets. Any account opens one, it and the administrators write in it, its
 * status follows who wrote last or closed it, and only it and the administrators see it.
 */
const db = database('support');
const ADA = 'ada@support.test';
let server: Running;
let api: Client;
let ada: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, adminEnvironment(ADA));
  api = client(server.port);
  ada = await api.admin(ADA);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const ticketOf = (id: string, token: string) => api.read(`/support/tickets/${id}`, token);
const open = (
  token: string,
  subject = 'My payout never came',
  text = 'I was due a payout last week and saw nothing.',
) => api.create('/support/tickets', token, { subject, text });
const write = (id: string, token: string, text: string) =>
  api.act('POST', `/support/tickets/${id}/messages`, token, { text });
const ids = (tickets: Json[], among: string[]) =>
  tickets.map(each => String(each.id)).filter(each => among.includes(each));

describe('support', () => {
  it('opens a ticket whose text is its first message, open', async () => {
    const tom = await api.traveller('tom@support.test');
    const hal = await api.host('hal@support.test');
    const id = await open(tom.token, 'Cannot change my dates', 'The page refuses my new dates without saying why.');
    const ticket = await ticketOf(id, tom.token);
    expect(ticket).toMatchObject({
      id,
      accountId: tom.id,
      subject: 'Cannot change my dates',
      status: 'open',
      messages: [{ authorId: tom.id, text: 'The page refuses my new dates without saying why.' }],
    });
    expect(typeof ticket.createdAt).toBe('string');
    expect(typeof (ticket.messages as Json[])[0].at).toBe('string');
    // A host opens one too.
    expect(await ticketOf(await open(hal.token), hal.token)).toMatchObject({ accountId: hal.id, status: 'open' });
  }, 60000);

  it('refuses a subject or a text empty, of spaces or too long, and anyone not signed in', async () => {
    const una = await api.traveller('una@support.test');
    const text = 'Something is wrong with my booking.';
    for (const body of [
      { subject: '', text },
      { subject: '    ', text },
      { subject: 'x'.repeat(201), text },
      { subject: 'A question', text: '' },
      { subject: 'A question', text: '    ' },
      { subject: 'A question', text: 'x'.repeat(2001) },
    ])
      expect(await api.refused('POST', '/support/tickets', una.token, body)).toBe(true);
    expect(await api.refused('POST', '/support/tickets', undefined, { subject: 'A question', text })).toBe(true);
    expect(await api.list('/support/tickets/mine', una.token)).toEqual([]);

    const id = await open(una.token, 'x'.repeat(200), 'x'.repeat(2000));
    expect(await ticketOf(id, una.token)).toMatchObject({ subject: 'x'.repeat(200), status: 'open' });
    expect((await write(id, una.token, '')).accepted).toBe(false);
    expect((await write(id, una.token, 'x'.repeat(2001))).accepted).toBe(false);
    await api.done('POST', `/support/tickets/${id}/messages`, una.token, { text: 'x'.repeat(2000) });
    expect((await ticketOf(id, una.token)).messages).toHaveLength(2);
  }, 60000);

  it('is answered by an administrator, opened again by its account, closed by either, and reopened by a message', async () => {
    const tom = await api.traveller('tom2@support.test');
    const id = await open(tom.token, 'A refund I cannot find', 'I cancelled and I see no refund.');
    const status = async () => (await ticketOf(id, tom.token)).status;

    await api.done('POST', `/support/tickets/${id}/messages`, ada.token, { text: 'It is on its way.' });
    expect(await status()).toBe('answered');
    await api.done('POST', `/support/tickets/${id}/messages`, tom.token, { text: 'Still nothing today.' });
    expect(await status()).toBe('open');
    await api.done('POST', `/support/tickets/${id}/close`, tom.token);
    expect(await status()).toBe('closed');
    // Closing a closed ticket changes nothing, whatever it answers.
    await api.act('POST', `/support/tickets/${id}/close`, ada.token);
    expect(await status()).toBe('closed');
    expect((await ticketOf(id, tom.token)).messages).toHaveLength(3);

    await api.done('POST', `/support/tickets/${id}/messages`, ada.token, { text: 'The bank confirmed it.' });
    expect(await status()).toBe('answered');
    await api.done('POST', `/support/tickets/${id}/close`, ada.token);
    expect(await status()).toBe('closed');
    await api.done('POST', `/support/tickets/${id}/messages`, tom.token, { text: 'It came, thank you.' });
    expect(await status()).toBe('open');

    const ticket = await ticketOf(id, ada.token);
    expect((ticket.messages as Json[]).map(each => [each.authorId, each.text])).toEqual([
      [tom.id, 'I cancelled and I see no refund.'],
      [ada.id, 'It is on its way.'],
      [tom.id, 'Still nothing today.'],
      [ada.id, 'The bank confirmed it.'],
      [tom.id, 'It came, thank you.'],
    ]);
    const times = (ticket.messages as Json[]).map(each => Date.parse(String(each.at)));
    expect(times.every((at, n) => !Number.isNaN(at) && (n === 0 || at >= times[n - 1]))).toBe(true);
  }, 60000);

  it('shows a ticket to its account and the administrators only, and lists each account its own, the most recent first', async () => {
    const tom = await api.traveller('tom3@support.test');
    const una = await api.traveller('una3@support.test');
    // A second apart: the order is by when each was opened, which may be kept to the second (request 1).
    const first = await open(tom.token, 'First question');
    await sleep(1100);
    const second = await open(tom.token, 'Second question');
    const hers = await open(una.token, 'Her question');

    expect((await api.call('GET', `/support/tickets/${first}`, una.token)).status).toBe(404);
    expect((await api.call('GET', `/support/tickets/${hers}`, tom.token)).status).toBe(404);
    expect((await write(first, una.token, 'I am not the one who asked.')).accepted).toBe(false);
    expect(await api.refused('POST', `/support/tickets/${first}/close`, una.token)).toBe(true);
    expect(await ticketOf(first, tom.token)).toMatchObject({ status: 'open', messages: [expect.anything()] });
    expect(await ticketOf(hers, ada.token)).toMatchObject({ id: hers, accountId: una.id });

    const mine = await api.list('/support/tickets/mine', tom.token);
    expect(mine.map(each => each.id)).toEqual([second, first]);
    expect(mine[0]).toMatchObject({ id: second, accountId: tom.id, subject: 'Second question', status: 'open' });
    expect((await api.list('/support/tickets/mine', una.token)).map(each => each.id)).toEqual([hers]);
  }, 60000);

  it('lists every ticket to the administrators, the oldest first, or those of one status, and to nobody else', async () => {
    const tom = await api.traveller('tom4@support.test');
    const opened = await open(tom.token, 'Opened');
    await sleep(1100);
    const answered = await open(tom.token, 'Answered');
    await sleep(1100);
    const closed = await open(tom.token, 'Closed');
    await api.done('POST', `/support/tickets/${answered}/messages`, ada.token, { text: 'Here is your answer.' });
    await api.done('POST', `/support/tickets/${closed}/close`, tom.token);
    const all = [opened, answered, closed];

    const every = await api.list('/admin/support/tickets', ada.token);
    expect(ids(every, all)).toEqual(all);
    expect(every.find(each => each.id === answered)).toMatchObject({
      accountId: tom.id,
      subject: 'Answered',
      status: 'answered',
    });
    for (const [status, id] of [
      ['open', opened],
      ['answered', answered],
      ['closed', closed],
    ]) {
      const some = await api.list(`/admin/support/tickets?status=${status}`, ada.token);
      expect(ids(some, all)).toEqual([id]);
      expect(some.every(each => each.status === status)).toBe(true);
    }
    expect((await api.call('GET', '/admin/support/tickets?status=pending', ada.token)).status).toBe(400);
    expect((await api.call('GET', '/admin/support/tickets', tom.token)).status).toBe(403);
    expect((await api.call('GET', '/admin/support/tickets?status=open', tom.token)).status).toBe(403);
  }, 60000);

  it('writes nothing to the audit log when an administrator answers or closes a ticket', async () => {
    const tom = await api.traveller('tom5@support.test');
    const id = await open(tom.token);
    await api.done('POST', `/support/tickets/${id}/messages`, ada.token, { text: 'We are looking into it.' });
    await api.done('POST', `/support/tickets/${id}/close`, ada.token);
    await sleep(2000);
    expect(await api.list(`/admin/audit?subjectId=${id}`, ada.token)).toEqual([]);
  }, 60000);
});
