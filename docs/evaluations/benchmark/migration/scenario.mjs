#!/usr/bin/env node
/**
 * The characterization scenario of linkbox: what its clients rely on, recorded against the legacy
 * before any code of the migration was written, as a black box over HTTP (ADR 36). Run against
 * the legacy it passes by construction; run against the migrated application on its compatibility
 * wire it must pass unchanged — that is the proof that the functionality did not change.
 *
 *   node scenario.mjs http://127.0.0.1:10000            # the legacy, or the migrated application's compat wire
 *   node scenario.mjs http://127.0.0.1:10000 --native   # the migrated application's native wire (/v2): the same
 *                                                        # steps, translated to the contract's grammar
 *
 * Every step asserts a status code and a body, field for field. Links are created under titles of
 * this run, so the scenario can run against a server that already holds data, and more than once.
 * The first failing step stops the run and names what differed; the exit code is the verdict.
 */

const [baseArg, ...flags] = process.argv.slice(2);
if (!baseArg || baseArg.startsWith('-')) {
  console.error('usage: node scenario.mjs <base-url> [--native]');
  process.exit(2);
}
const native = flags.includes('--native');
const base = baseArg.replace(/\/$/, '');
const api = native ? `${base}/v2` : `${base}/v1`;
const run = Date.now().toString(36);

class Refused extends Error {}
const fail = (what, expected, actual) =>
  new Refused(`${what}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
const eq = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw fail(what, expected, actual);
};
const ok = (condition, what, actual) => {
  if (!condition) throw fail(what, true, actual === undefined ? false : actual);
};
const keysOf = object => Object.keys(object).sort();
const isIsoDate = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));

async function send(method, path, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json };
}
const get = path => send('GET', path);
const post = (path, body) => send('POST', path, body);

/** A query's refusal on the native wire is `{ message }` with the contract's status; the legacy's was `{ error }` with its sentence. */
async function read(path) {
  const response = await get(path);
  if (native && response.status === 404) return { status: 404, json: { error: 'link not found' } };
  return response;
}

// --- the translation to the native wire ----------------------------------------------------
//
// On the legacy wire a command answers the thing, or `{ error }` with its own status. On the
// contract's grammar it answers `202 { operationId }`, the outcome is read at the Tracker, and a
// refusal is the operation's ERROR with the rule's exception. The translation below is the whole
// difference between the two wires; every assertion on *what happened* is the same.

const LEGACY_ERROR = {
  BlankLinkTitle: [400, 'title is required'],
  LinkTitleTooLong: [400, 'title is too long (80 characters at most)'],
  InvalidLinkUrl: [400, 'url must start with http:// or https://'],
  LinkNotFound: [404, 'link not found'],
  LinkAlreadyArchived: [409, 'link is already archived'],
};

async function settled(operationId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { status, json } = await get(`/tracker/operations/${operationId}`);
    eq(status, 200, `the operation ${operationId} can be followed`);
    if (json.status === 'SUCCESS' || json.status === 'ERROR') return json;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Refused(`the operation ${operationId} never settled`);
}

/** A command, as the client sees its outcome: the legacy's answer, or the native answer translated into it. */
async function command(path, body, readBack) {
  if (!native) return post(path, body);
  const accepted = await post(path, body);
  eq(accepted.status, 202, `${path} is accepted`);
  const operation = await settled(accepted.json.operationId);
  if (operation.status === 'ERROR') {
    const [status, error] = LEGACY_ERROR[operation.error.type] ?? [400, operation.error.message];
    return { status, json: { error } };
  }
  return readBack(operation.result);
}

const paths = native
  ? { links: '/links', link: id => `/links/${id}`, archive: id => `/links/${id}/archive`, activity: '/links/activity' }
  : { links: '/links', link: id => `/links/${id}`, archive: id => `/links/${id}/archive`, activity: '/activity' };

const saveLink = body =>
  command(paths.links, body, async id => {
    const { json } = await read(paths.link(id));
    return { status: 201, json };
  });
const archiveLink = id =>
  command(paths.archive(id), undefined, async () => {
    const { json } = await read(paths.link(id));
    return { status: 200, json };
  });

// --- the steps -------------------------------------------------------------------------------

const steps = [];
const step = (name, fn) => steps.push([name, fn]);
const mine = title => title.endsWith(` #${run}`);
const link = {};

step('a blank title is refused', async () => {
  const response = await saveLink({ url: 'https://example.org/a', title: '   ' });
  eq(response.status, 400, 'status');
  eq(response.json, { error: 'title is required' }, 'body');
});

step('a title over 80 characters is refused', async () => {
  const response = await saveLink({ url: 'https://example.org/a', title: 'x'.repeat(81) });
  eq(response.status, 400, 'status');
  eq(response.json, { error: 'title is too long (80 characters at most)' }, 'body');
});

step('a url that is not http(s) is refused', async () => {
  const response = await saveLink({ url: 'ftp://example.org/a', title: 'A' });
  eq(response.status, 400, 'status');
  eq(response.json, { error: 'url must start with http:// or https://' }, 'body');
});

step('a link is saved: the title trimmed, not archived, with its id and its time', async () => {
  const response = await saveLink({ url: 'https://example.org/first', title: `  First #${run}  ` });
  eq(response.status, 201, 'status');
  eq(keysOf(response.json), ['archived', 'createdAt', 'id', 'title', 'url'], 'the fields of a link');
  eq(response.json.title, `First #${run}`, 'the title is trimmed');
  eq(response.json.url, 'https://example.org/first', 'the url');
  eq(response.json.archived, false, 'not archived');
  ok(typeof response.json.id === 'string' && response.json.id.length > 0, 'an id', response.json.id);
  ok(isIsoDate(response.json.createdAt), 'a creation time', response.json.createdAt);
  link.first = response.json;
});

step('a second link is saved', async () => {
  const response = await saveLink({ url: 'https://example.org/second', title: `Second #${run}` });
  eq(response.status, 201, 'status');
  link.second = response.json;
});

step('the links are listed newest first, as they were answered', async () => {
  const response = await get(paths.links);
  eq(response.status, 200, 'status');
  eq(
    response.json.filter(each => mine(each.title)),
    [link.second, link.first],
    'the links of this run, newest first, field for field',
  );
});

step('a link is read by its id, as it was answered', async () => {
  const response = await read(paths.link(link.first.id));
  eq(response.status, 200, 'status');
  eq(response.json, link.first, 'the link');
});

step('an unknown link is not found', async () => {
  const response = await read(paths.link('00000000-0000-4000-8000-000000000000'));
  eq(response.status, 404, 'status');
  eq(response.json, { error: 'link not found' }, 'body');
});

step('a link is archived, and answered archived with nothing else changed', async () => {
  const response = await archiveLink(link.first.id);
  eq(response.status, 200, 'status');
  eq(response.json, { ...link.first, archived: true }, 'the link, archived');
  link.first = response.json;
});

step('archiving it again is refused', async () => {
  const response = await archiveLink(link.first.id);
  eq(response.status, 409, 'status');
  eq(response.json, { error: 'link is already archived' }, 'body');
});

step('archiving an unknown link is not found', async () => {
  const response = await archiveLink('00000000-0000-4000-8000-000000000000');
  eq(response.status, 404, 'status');
  eq(response.json, { error: 'link not found' }, 'body');
});

step('the list leaves the archived link out; reading it by id still finds it', async () => {
  eq((await get(paths.links)).json.filter(each => mine(each.title)), [link.second], 'the list');
  eq((await read(paths.link(link.first.id))).json, link.first, 'the archived link, by id');
});

step('the activity tells what happened, newest first', async () => {
  const response = await get(paths.activity);
  eq(response.status, 200, 'status');
  const ours = response.json.filter(each => mine(each.title));
  eq(
    ours.map(each => keysOf(each)),
    ours.map(() => ['at', 'linkId', 'title', 'type']),
    'the fields of an entry',
  );
  eq(
    ours.map(each => [each.type, each.linkId]),
    [
      ['link.archived', link.first.id],
      ['link.saved', link.second.id],
      ['link.saved', link.first.id],
    ],
    'the entries of this run, newest first',
  );
  ok(ours.every(each => isIsoDate(each.at)), 'each entry has a time', ours);
  eq(ours[2].at, link.first.createdAt, 'a link was saved when it was created');
});

// --- the run ---------------------------------------------------------------------------------

let passed = 0;
for (const [name, fn] of steps) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(error instanceof Refused ? `    ${error.message}` : error);
    console.log(`\n${passed} of ${steps.length} steps passed against ${api}${native ? ' (native wire)' : ''}`);
    process.exit(1);
  }
}
console.log(`\n${passed} of ${steps.length} steps passed against ${api}${native ? ' (native wire)' : ''}`);
