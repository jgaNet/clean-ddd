import { FastifyApplication } from '@Bootstrap/Fastify/FastifyApplication';
import { createApplication } from '@Bootstrap/Fastify/createApplication';

/**
 * The native wire: the characterization scenario of the legacy, translated to the contract's
 * grammar (`scenario.mjs --native` walks the same steps against a running server). A command is
 * accepted, followed at the Tracker, and its refusal is the operation's ERROR with the rule's name.
 */
let app: FastifyApplication;
let api: string;
beforeAll(async () => {
  app = await createApplication({ legacyWire: undefined });
  await app.start(0);
  api = `${app.address}/${app.apiPrefix}`;
});
afterAll(() => app.stop());

const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json().catch(() => undefined) };
};
const settled = async (operationId: string) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { json } = await send('GET', `/tracker/operations/${operationId}`);
    if (json.status === 'SUCCESS' || json.status === 'ERROR') return json;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`operation ${operationId} never settled`);
};
const command = async (path: string, body?: unknown) => {
  const accepted = await send('POST', path, body);
  expect(accepted.status).toBe(202);
  return settled(accepted.json.operationId);
};

describe('the Links API, on the native wire', () => {
  const link: Record<string, { id: string }> = {};

  it("accepts a link and answers its id as the operation's result; a bad value is the operation's refusal", async () => {
    const saved = await command('/links', { url: 'https://example.org/first', title: '  First  ' });
    expect(saved.status).toBe('SUCCESS');
    link.first = { id: saved.result };

    const read = await send('GET', `/links/${saved.result}`);
    expect(read.status).toBe(200);
    expect(read.json).toEqual({
      id: saved.result,
      url: 'https://example.org/first',
      title: 'First',
      archived: false,
      createdAt: expect.any(String),
    });

    const refused = await command('/links', { url: 'ftp://example.org', title: 'A' });
    expect(refused.status).toBe('ERROR');
    expect(refused.error).toEqual({ type: 'InvalidLinkUrl', message: expect.any(String) });
  });

  it('refuses a body of the wrong shape with a 400, and leaves the values to the domain', async () => {
    expect((await send('POST', '/links', { url: 'https://example.org' })).status).toBe(400);
  });

  it('lists the links newest first, archives once, and tells the activity', async () => {
    const second = await command('/links', { url: 'https://example.org/second', title: 'Second' });
    link.second = { id: second.result };
    expect((await send('GET', '/links')).json.map((each: { id: string }) => each.id)).toEqual([
      link.second.id,
      link.first.id,
    ]);

    expect((await command(`/links/${link.first.id}/archive`)).status).toBe('SUCCESS');
    const again = await command(`/links/${link.first.id}/archive`);
    expect(again.error.type).toBe('LinkAlreadyArchived');
    expect((await command('/links/00000000-0000-4000-8000-000000000000/archive')).error.type).toBe('LinkNotFound');

    expect((await send('GET', '/links')).json.map((each: { id: string }) => each.id)).toEqual([link.second.id]);
    expect((await send('GET', `/links/${link.first.id}`)).json.archived).toBe(true);
    expect((await send('GET', '/links/00000000-0000-4000-8000-000000000000')).status).toBe(404);

    const activity = await send('GET', '/links/activity');
    expect(activity.json.map((each: { type: string; linkId: string }) => [each.type, each.linkId])).toEqual([
      ['link.archived', link.first.id],
      ['link.saved', link.second.id],
      ['link.saved', link.first.id],
    ]);
  });
});
