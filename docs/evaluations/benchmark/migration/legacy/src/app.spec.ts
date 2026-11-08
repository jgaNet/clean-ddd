import { Application, createApplication } from './app';

/** The tests the legacy has: a happy path and the three refusals somebody once hit in production. */
describe('linkbox', () => {
  let app: Application;
  let api: string;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${api}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

  beforeAll(async () => {
    app = await createApplication();
    await app.start(0);
    api = `${app.address}/${app.apiPrefix}`;
  });
  afterAll(() => app.stop());

  it('saves a link, lists it newest first, archives it once, and tells the activity', async () => {
    const first = await (await send('POST', '/links', { url: 'https://a.example', title: ' A ' })).json();
    const second = await (await send('POST', '/links', { url: 'https://b.example', title: 'B' })).json();
    expect(first).toMatchObject({ url: 'https://a.example', title: 'A', archived: false });

    expect(await (await send('GET', '/links')).json()).toEqual([second, first]);

    const archived = await send('POST', `/links/${first.id}/archive`);
    expect(archived.status).toBe(200);
    expect(await archived.json()).toEqual({ ...first, archived: true });
    expect((await send('POST', `/links/${first.id}/archive`)).status).toBe(409);
    expect(await (await send('GET', '/links')).json()).toEqual([second]);

    const activity = await (await send('GET', '/activity')).json();
    expect(activity.map((entry: { type: string; linkId: string }) => [entry.type, entry.linkId])).toEqual([
      ['link.archived', first.id],
      ['link.saved', second.id],
      ['link.saved', first.id],
    ]);
  });

  it('refuses a blank title, a long title, a bad url, and an unknown link', async () => {
    expect(await (await send('POST', '/links', { url: 'https://a.example', title: '  ' })).json()).toEqual({
      error: 'title is required',
    });
    expect(await (await send('POST', '/links', { url: 'https://a.example', title: 'x'.repeat(81) })).json()).toEqual({
      error: 'title is too long (80 characters at most)',
    });
    expect(await (await send('POST', '/links', { url: 'ftp://a.example', title: 'A' })).json()).toEqual({
      error: 'url must start with http:// or https://',
    });
    expect((await send('GET', '/links/nope')).status).toBe(404);
    expect((await send('POST', '/links/nope/archive')).status).toBe(404);
  });
});
