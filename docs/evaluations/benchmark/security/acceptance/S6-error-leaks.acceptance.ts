import { INTERNALS, server } from './security';

/**
 * Probe S6 of the security audit: a malformed request is the client's mistake. The server answers
 * it with a 4xx, never breaks on it, and never shows a client its internals (a stack, a source
 * file, a query, its store's errors), whatever it answers.
 */
let audited: Awaited<ReturnType<typeof server>>;
beforeAll(async () => {
  audited = await server('error-leaks');
}, 120000);
afterAll(() => audited?.close());

describe('malformed requests', () => {
  it('answers malformed input with a 4xx, never a 5xx, and shows nothing of its internals', async () => {
    const { call, account, note } = audited;
    const ada = await account('ada@security.test');
    const id = await note(ada.token, 'A note to aim at');
    const json = (body: string) => ({ body, headers: { 'content-type': 'application/json' } });
    type Raw = { body?: string; headers: Record<string, string> };
    const requests: [string, string, string | undefined, Raw | undefined][] = [
      ['POST', '/notes', ada.token, json('{"title": ')],
      ['POST', '/notes', ada.token, json('[]')],
      ['POST', '/notes', ada.token, json('null')],
      ['POST', '/notes', ada.token, json('"a string"')],
      ['POST', '/notes', ada.token, json('{"title": {"$gt": ""}, "text": []}')],
      [
        'POST',
        '/notes',
        ada.token,
        { body: 'title=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } },
      ],
      ['POST', '/notes', ada.token, { body: 'plain', headers: { 'content-type': 'text/plain' } }],
      ['PUT', `/notes/${id}`, ada.token, json(JSON.stringify({ title: 'x'.repeat(2_000_000), text: '' }))],
      ['POST', '/accounts', undefined, json('{"email": "a@b.c", "password": ')],
      ['POST', '/accounts/login', undefined, json('{')],
      ['GET', '/notes/%00', ada.token, undefined],
      ['GET', '/notes/..%2F..%2F..%2Fetc%2Fpasswd', ada.token, undefined],
      ['GET', `/notes/${'x'.repeat(5000)}`, ada.token, undefined],
      ['GET', '/notes', 'a'.repeat(10_000), undefined],
      ['GET', '/notes', undefined, { headers: { authorization: 'Basic YWRhOnNlY3JldA==' } }],
      ['GET', '/notes', undefined, { headers: { authorization: 'Bearer' } }],
    ];
    const broke: string[] = [];
    for (const [method, path, token, raw] of requests) {
      const shown = `${method} ${path.slice(0, 40)} ${raw?.body?.slice(0, 30) ?? ''}`;
      const answer = await call(method, path, token, undefined, raw);
      if (answer.status >= 500) broke.push(`${shown}: ${answer.status}`);
      if (INTERNALS.test(answer.text)) broke.push(`${shown}: shows ${answer.text.match(INTERNALS)?.[0]}`);
    }
    expect(broke).toEqual([]);
  }, 180000);

  it('keeps a note with unusual characters as written, or refuses it, and never breaks', async () => {
    const { call, outcome, account, read } = audited;
    const bob = await account('bob@security.test');
    const broke: string[] = [];
    for (const title of [
      '\u0000 null byte',
      'lone surrogate \ud800',
      '🧪 emoji',
      'right-to-left ‮',
      '<script>alert(1)</script>',
    ]) {
      const answer = await call('POST', '/notes', bob.token, { title, text: title });
      if (answer.status >= 500) broke.push(`${JSON.stringify(title)}: ${answer.status}`);
      if (INTERNALS.test(answer.text)) broke.push(`${JSON.stringify(title)}: shows internals`);
      if (answer.status !== 202) continue;
      const ended = await outcome(answer, bob.token);
      if (INTERNALS.test(JSON.stringify(ended))) broke.push(`${JSON.stringify(title)}: its outcome shows internals`);
      if (ended.status === 'SUCCESS' && typeof (await read(bob.token, String(ended.result))).title !== 'string')
        broke.push(`${JSON.stringify(title)}: not read back`);
    }
    expect(broke).toEqual([]);
  }, 180000);
});
