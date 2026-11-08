import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { createApplication } from '@Bootstrap/Fastify/createApplication';

/**
 * The compatibility wire answers what the legacy answered: the characterization scenario
 * (../../../../scenario.mjs) is the whole proof against a running server; this suite keeps the
 * shape of each answer under the application's own checks, and shows the one case the scenario
 * cannot: a wrong body type, which the legacy read as missing.
 */
let app: FastifyApplication;
let legacy: string;
beforeAll(async () => {
  app = await createApplication();
  await app.start(0);
  legacy = `${app.address}/v1`;
});
afterAll(() => app.stop());

const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${legacy}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json().catch(() => undefined) };
};

describe('linkbox, on its legacy wire', () => {
  it('answers a saved link with 201 and the link, as the legacy did, and the activity in the same breath', async () => {
    const saved = await send('POST', '/links', { url: 'https://example.org/a', title: ' A ' });
    expect(saved.status).toBe(201);
    expect(saved.json).toEqual({
      id: expect.any(String),
      url: 'https://example.org/a',
      title: 'A',
      archived: false,
      createdAt: expect.any(String),
    });

    const activity = await send('GET', '/activity');
    expect(activity.json[0]).toEqual({
      type: 'link.saved',
      linkId: saved.json.id,
      title: 'A',
      at: saved.json.createdAt,
    });

    const archived = await send('POST', `/links/${saved.json.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.json).toEqual({ ...saved.json, archived: true });
    expect(await send('POST', `/links/${saved.json.id}/archive`)).toEqual({
      status: 409,
      json: { error: 'link is already archived' },
    });
  });

  it("refuses as the legacy refused: its status codes and its sentences, from the rule's name", async () => {
    expect(await send('POST', '/links', { url: 'https://example.org/a', title: 12 })).toEqual({
      status: 400,
      json: { error: 'title is required' },
    });
    expect(await send('POST', '/links', { title: 'A' })).toEqual({
      status: 400,
      json: { error: 'url must start with http:// or https://' },
    });
    expect(await send('GET', '/links/nope')).toEqual({ status: 404, json: { error: 'link not found' } });
    expect(await send('POST', '/links/nope/archive')).toEqual({ status: 404, json: { error: 'link not found' } });
  });

  it('serves the native wire beside it, under the next prefix', async () => {
    const native = await fetch(`${app.address}/${app.apiPrefix}/links`);
    expect(app.apiPrefix).toBe('v2');
    expect(native.status).toBe(200);
  });
});
