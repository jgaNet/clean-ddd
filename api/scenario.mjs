#!/usr/bin/env node
/**
 * The API, as a client sees it, walked once against a running server — whichever language wrote
 * it (API-ONE-SURFACE, ADR 16). Plain Node, no package: `fetch` and `WebSocket` are the platform's.
 *
 *   node api/scenario.mjs http://127.0.0.1:10000 [--admin admin@admin.fr:admin]
 *
 * Every step asserts what a client may rely on — a status code, a body shape, a public name — and
 * nothing about the implementation. The first failing step stops the run and names what differed;
 * the exit code is the verdict. Accounts are created under a fresh suffix, so the scenario can run
 * against a server that already holds data, and more than once.
 */

const [baseArg, ...rest] = process.argv.slice(2);
if (!baseArg || baseArg.startsWith('-')) {
  console.error('usage: node api/scenario.mjs <base-url> [--admin <identifier>:<password>] [--origin <web-origin>]');
  process.exit(2);
}
const base = baseArg.replace(/\/$/, '');
const api = `${base}/v1`;
const adminFlag = rest.indexOf('--admin');
const [adminIdentifier, adminPassword] =
  adminFlag >= 0 ? rest[adminFlag + 1].split(':') : ['admin@admin.fr', 'admin'];
// The origin a front end is served from, when the server was told about one (WEB_ORIGINS).
const originFlag = rest.indexOf('--origin');
const webOrigin = originFlag >= 0 ? rest[originFlag + 1] : undefined;
const run = Date.now().toString(36);

// --- a small client ------------------------------------------------------------------------

class Refused extends Error {}

const fail = (what, expected, actual) =>
  new Refused(
    `${what}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
  );
const eq = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw fail(what, expected, actual);
};
const ok = (condition, what, actual) => {
  if (!condition) throw fail(what, true, actual === undefined ? false : actual);
};
const isString = (value) => typeof value === 'string' && value.length > 0;
const keysOf = (object) => Object.keys(object).sort();
const sortedKeys = (keys) => [...keys].sort();

function client(token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const send = async (method, path, body, extra = {}) => {
    const response = await fetch(path.startsWith('http') ? path : `${api}${path}`, {
      method,
      headers: {
        ...headers,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...extra,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: response.status, headers: response.headers, text, json };
  };
  return {
    get: (path, extra) => send('GET', path, undefined, extra),
    post: (path, body, extra) => send('POST', path, body, extra),
    put: (path, body, extra) => send('PUT', path, body, extra),
    patch: (path, body, extra) => send('PATCH', path, body, extra),
  };
}

const anonymous = client();
const HTMX = { 'hx-request': 'true' };

async function login(identifier, password) {
  return anonymous.post('/auth/login', { identifier, password });
}
async function as(identifier, password) {
  const response = await login(identifier, password);
  eq(response.status, 200, `login of ${identifier}`);
  ok(isString(response.json?.token), 'login answers a token', response.json);
  return client(response.json.token);
}

/** A command was accepted: 202 { operationId }, a trace; polled on the Tracker to its outcome. */
async function accepted(who, response) {
  eq(response.status, 202, 'a command is accepted with 202');
  ok(isString(response.json?.operationId), 'the 202 carries an operationId', response.json);
  ok(isString(response.headers.get('x-trace-id')), 'the response carries x-trace-id');
  const record = await outcome(who, response.json.operationId);
  record.traceId === undefined || eq(record.traceId, response.headers.get('x-trace-id'), 'the record keeps the trace');
  return record;
}
async function outcome(who, operationId) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const operation = await who.get(`/tracker/operations/${operationId}`);
    eq(operation.status, 200, `the operation ${operationId} can be read by its caller`);
    if (operation.json.status !== 'PENDING') return operation.json;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Refused(`operation ${operationId} still PENDING after 5s`);
}
async function signUpValidated(admin, identifier, password) {
  // A sign-up is anonymous: its caller follows it by the id it was given, signed in or not (ADR 27).
  const signedUp = await accepted(anonymous, await anonymous.post('/auth/signup', { identifier, password }));
  eq(signedUp.status, 'SUCCESS', `sign-up of ${identifier}`);
  const accountId = signedUp.result;
  const validated = await accepted(admin, await admin.get(`/auth/accounts/${accountId}/validate`));
  eq(validated.status, 'SUCCESS', `validation of ${identifier}`);
  return accountId;
}
/** Polls until the function answers something truthy, for two seconds at most. */
async function eventually(read) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}
const noteIdOf = (list, title) => {
  const note = list.find((item) => item.title === title);
  ok(note, `a note titled ${title} is listed`, list);
  return note.id;
};

// --- the run ---------------------------------------------------------------------------------

let passed = 0;
let section = '';
async function step(name, body) {
  try {
    await body();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`\n${error instanceof Refused ? error.message : error.stack}\n`);
    console.error(`${passed} step(s) passed before "${section} › ${name}" failed against ${base}`);
    process.exit(1);
  }
}
const describe = (name) => {
  section = name;
  console.log(`\n${name}`);
};

const state = {};

describe('Home and health');
await step('GET /v1 answers { name, version } to an API client, with or without the trailing slash', async () => {
  const home = await anonymous.get('');
  eq(home.status, 200, 'home');
  eq(keysOf(home.json), ['name', 'version'], 'home body');
  ok(isString(home.json.name) && isString(home.json.version), 'name and version are strings', home.json);
  // The page asks for `/v1/`: the same answer.
  const slash = await anonymous.get('/');
  eq([slash.status, slash.json], [200, home.json], 'GET /v1/');
});
await step('GET /v1 answers the page shell to HTMX', async () => {
  const shell = await anonymous.get('', HTMX);
  eq(shell.status, 200, 'shell');
  ok(shell.headers.get('content-type')?.startsWith('text/html'), 'HTML', shell.headers.get('content-type'));
  ok(shell.text.includes('<main') && shell.text.includes('<h1>'), 'the shell has a <main> and a title');
});
await step('GET /v1/health says ok', async () => {
  const health = await anonymous.get('/health');
  eq(health.status, 200, 'health');
  eq(health.json.status, 'ok', 'health body');
});

describe('A front end on another origin');
await step('the API has no page: an unknown path is a 404, not a front end', async () => {
  eq((await anonymous.get(`${base}/me`)).status, 404, 'GET /me');
  eq((await anonymous.get(`${base}/js/htmx.min.js`)).status, 404, 'GET /js/htmx.min.js');
});
if (webOrigin) {
  await step(`a front end served from ${webOrigin} may call the API (CORS)`, async () => {
    const preflight = await fetch(`${api}/auth/login`, {
      method: 'OPTIONS',
      headers: { origin: webOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,hx-request' },
    });
    ok([200, 204].includes(preflight.status), 'preflight answered', preflight.status);
    eq(preflight.headers.get('access-control-allow-origin'), webOrigin, 'the origin is allowed');
    // Either every header (`*`, valid without credentials) or a list naming the ones the page sends.
    const allowed = (preflight.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    ok(allowed === '*' || (allowed.includes('authorization') && allowed.includes('hx-request')), 'authorization and hx-* headers allowed', allowed);
    const answer = await fetch(`${api}/health`, { headers: { origin: webOrigin } });
    eq(answer.headers.get('access-control-allow-origin'), webOrigin, 'an answer carries the origin');
    ok((answer.headers.get('access-control-expose-headers') ?? '').toLowerCase().includes('x-trace-id'), 'x-trace-id is exposed');
    const other = await fetch(`${api}/health`, { headers: { origin: 'http://evil.example' } });
    ok(other.headers.get('access-control-allow-origin') !== 'http://evil.example', 'an unknown origin is not allowed');
  });
}

describe('Authentication');
await step('a wrong password or an unknown account is a 401', async () => {
  eq((await login(adminIdentifier, 'nope')).status, 401, 'wrong password');
  eq((await login(`nobody-${run}@api.fr`, 'x')).status, 401, 'unknown account');
});
await step('login answers a token and sets the cookie', async () => {
  const response = await login(adminIdentifier, adminPassword);
  eq(response.status, 200, 'login');
  ok(isString(response.json.token), 'token', response.json);
  ok(response.headers.get('set-cookie')?.startsWith('token='), 'cookie', response.headers.get('set-cookie'));
  state.adminToken = response.json.token;
  state.admin = client(response.json.token);
});
await step('/auth/me: 401 anonymous or forged, the account otherwise', async () => {
  eq((await anonymous.get('/auth/me')).status, 401, 'anonymous');
  const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWJqZWN0SWQiOiJ4Iiwic3ViamVjdFR5cGUiOiJBRE1JTiJ9.bad';
  eq((await anonymous.get('/auth/me', { authorization: `Bearer ${forged}` })).status, 401, 'forged');
  const me = await state.admin.get('/auth/me');
  eq(me.status, 200, 'me');
  eq([me.json.email, me.json.role, me.json.status], [adminIdentifier, 'ADMIN', 'ACTIVE'], 'who the admin is');
  ok(isString(me.json.id), 'me has an id');
  state.adminId = me.json.id;
});

describe('Sign-up and validation, through the operations');
await step('an existing email is refused on the operation, under the public name SignUp', async () => {
  const response = await anonymous.post('/auth/signup', { identifier: adminIdentifier, password: 'x' });
  const operation = await accepted(state.admin, response);
  eq(operation.name, 'SignUp', 'public name');
  eq(operation.status, 'ERROR', 'status');
  eq(operation.error, { type: 'AccountAlreadyExists', message: 'An account already exists for this email' }, 'error');
});
await step('a new account is pending, and the record shows no payload', async () => {
  state.bobEmail = `bob-${run}@api.fr`;
  const response = await anonymous.post('/auth/signup', { identifier: state.bobEmail, password: 'S3cret-bob' });
  const operation = await accepted(state.admin, response);
  eq(operation.status, 'SUCCESS', 'sign-up succeeds');
  ok(isString(operation.result), 'the result is the account id', operation.result);
  state.bobId = operation.result;
  const expected = ['createdAt', 'finishedAt', 'id', 'name', 'result', 'status', 'traceId'];
  eq(sortedKeys(keysOf(operation.json ?? operation).filter((key) => key !== 'subjectId')), expected, 'record keys');
  ok(!JSON.stringify(operation).includes('S3cret-bob'), 'the password is nowhere on the record');
  const pending = await state.admin.get(`/auth/accounts/${state.bobId}`);
  eq(pending.json, { id: state.bobId, email: state.bobEmail, role: 'USER', status: 'PENDING' }, 'pending account');
  eq((await login(state.bobEmail, 'S3cret-bob')).status, 401, 'a pending account cannot log in');
});
await step('an anonymous caller may not validate; an administrator may', async () => {
  const attempt = await accepted(state.admin, await anonymous.get(`/auth/accounts/${state.bobId}/validate`));
  eq([attempt.status, attempt.error?.type], ['ERROR', 'NotAllowed'], 'anonymous validation');
  eq((await state.admin.get(`/auth/accounts/${state.bobId}`)).json.status, 'PENDING', 'still pending');
  const validated = await accepted(state.admin, await state.admin.get(`/auth/accounts/${state.bobId}/validate`));
  eq([validated.name, validated.status], ['ValidateAccount', 'SUCCESS'], 'validation');
  eq((await state.admin.get(`/auth/accounts/${state.bobId}`)).json.status, 'ACTIVE', 'active');
  state.bob = await as(state.bobEmail, 'S3cret-bob');
});
await step('a user reads their own account, not another one', async () => {
  eq((await state.bob.get(`/auth/accounts/${state.bobId}`)).status, 200, 'own account');
  eq((await state.bob.get(`/auth/accounts/${state.adminId}`)).status, 403, "the admin's account");
  const me = await state.bob.get('/auth/me');
  ok(isString(me.json.lastAuthenticatedAt), 'lastAuthenticatedAt', me.json);
});
await step('a login is never recorded as an operation', async () => {
  const operations = await state.admin.get('/tracker/operations');
  eq(operations.status, 200, 'the admin lists operations');
  ok(Array.isArray(operations.json) && operations.json.every((record) => record.name !== 'Login'), 'no Login record');
  state.carolEmail = `carol-${run}@api.fr`;
  state.carolId = await signUpValidated(state.admin, state.carolEmail, 'carol');
  state.carol = await as(state.carolEmail, 'carol');
});

describe('Notes');
await step('a new account has no notes; anonymous is refused', async () => {
  const mine = await state.bob.get('/notes');
  eq([mine.status, mine.json], [200, []], 'empty list');
  eq((await anonymous.get('/notes')).status, 403, 'anonymous');
});
await step('POST /notes creates one: the operation returns its id, the list and the detail show it', async () => {
  const created = await accepted(state.bob, await state.bob.post('/notes', { title: 'title', content: 'content' }));
  eq([created.name, created.status], ['CreateNote', 'SUCCESS'], 'creation');
  ok(isString(created.result), 'the result is the note id', created.result);
  state.noteId = created.result;
  eq((await state.bob.get('/notes')).json, [{ id: state.noteId, title: 'title', status: 'ACTIVE' }], 'list item');
  const detail = await state.bob.get(`/notes/${state.noteId}`);
  eq(detail.status, 200, 'detail');
  eq(detail.json, { id: state.noteId, title: 'title', status: 'ACTIVE', ownerId: state.bobId, content: 'content', sharedWith: [] }, 'detail');
});
await step('PUT /notes/:id edits it', async () => {
  const edited = await accepted(state.bob, await state.bob.put(`/notes/${state.noteId}`, { title: 'edited', content: 'content 2' }));
  eq([edited.name, edited.status], ['EditNote', 'SUCCESS'], 'edit');
  const detail = (await state.bob.get(`/notes/${state.noteId}`)).json;
  eq([detail.title, detail.content], ['edited', 'content 2'], 'edited detail');
});
await step('archive, refuse an edit while archived, restore', async () => {
  const archived = await accepted(state.bob, await state.bob.post(`/notes/${state.noteId}/archive`));
  eq([archived.name, archived.status], ['ArchiveNote', 'SUCCESS'], 'archive');
  eq((await state.bob.get(`/notes/${state.noteId}`)).json.status, 'ARCHIVED', 'archived');
  const refused = await accepted(state.bob, await state.bob.put(`/notes/${state.noteId}`, { title: 'x', content: 'y' }));
  eq([refused.status, refused.error?.type], ['ERROR', 'NoteArchived'], 'an archived note refuses an edit');
  const restored = await accepted(state.bob, await state.bob.post(`/notes/${state.noteId}/restore`));
  eq([restored.name, restored.status], ['RestoreNote', 'SUCCESS'], 'restore');
  eq((await state.bob.get(`/notes/${state.noteId}`)).json.status, 'ACTIVE', 'active again');
});
await step('an unknown note is a 404, another owner\'s note too', async () => {
  const unknown = await state.bob.get('/notes/00000000-0000-4000-8000-000000000000');
  eq(unknown.status, 404, 'unknown');
  ok(isString(unknown.json?.message), 'a refusal carries { message }', unknown.json);
  eq((await state.carol.get(`/notes/${state.noteId}`)).status, 404, "a note one cannot see does not exist");
  eq((await state.carol.get('/notes')).json, [], 'carol has no notes');
});
await step('POST /notes/:id/suggest-title applies a suggestion the note accepts, with its provenance', async () => {
  await accepted(state.bob, await state.bob.post('/notes', { title: 'Untitled', content: 'Groceries for Saturday\nmilk, eggs' }));
  const untitled = noteIdOf((await state.bob.get('/notes')).json, 'Untitled');
  const suggested = await accepted(state.bob, await state.bob.post(`/notes/${untitled}/suggest-title`));
  eq([suggested.name, suggested.status], ['SuggestNoteTitle', 'SUCCESS'], 'suggestion');
  eq(suggested.result.title, 'Groceries for Saturday', 'the title applied');
  eq([suggested.result.provenance.source, suggested.result.provenance.version], ['heuristic', 'first-line/1'], 'provenance');
  ok(isString(suggested.result.provenance.at), 'provenance.at');
  eq((await state.bob.get(`/notes/${untitled}`)).json.title, 'Groceries for Saturday', 'renamed');
});
await step('the note refuses a suggestion that breaks its rules', async () => {
  await accepted(state.bob, await state.bob.post('/notes', { title: 'Long first line', content: `${'x'.repeat(120)}\nsecond` }));
  const long = noteIdOf((await state.bob.get('/notes')).json, 'Long first line');
  const refused = await accepted(state.bob, await state.bob.post(`/notes/${long}/suggest-title`));
  eq([refused.status, refused.error?.type], ['ERROR', 'NoteTitleTooLong'], 'refused');
  eq((await state.bob.get(`/notes/${long}`)).json.title, 'Long first line', 'kept');
});
await step('sharing with an unknown account or with oneself is refused by the domain', async () => {
  const unknown = await accepted(state.bob, await state.bob.post(`/notes/${state.noteId}/share`, { recipientId: '00000000-0000-4000-8000-000000000000' }));
  eq([unknown.name, unknown.status, unknown.error?.type], ['ShareNote', 'ERROR', 'RecipientNotFound'], 'unknown recipient');
  state.unknownShareTrace = unknown.traceId;
  const self = await accepted(state.bob, await state.bob.post(`/notes/${state.noteId}/share`, { recipientId: state.bobId }));
  eq([self.status, self.error?.type], ['ERROR', 'CannotShareWithSelf'], 'oneself');
  eq((await state.bob.get(`/notes/${state.noteId}`)).json.sharedWith, [], 'nothing shared');
});
await step('sharing with carol: she lists it, reads it, and was notified (Notes → Notifications)', async () => {
  const shared = await accepted(state.bob, await state.bob.post(`/notes/${state.noteId}/share`, { recipientId: state.carolId }));
  eq([shared.name, shared.status], ['ShareNote', 'SUCCESS'], 'share');
  eq((await state.bob.get(`/notes/${state.noteId}`)).json.sharedWith, [state.carolId], 'sharedWith');
  const again = await accepted(state.bob, await state.bob.post(`/notes/${state.noteId}/share`, { recipientId: state.carolId }));
  eq([again.status, again.error?.type], ['ERROR', 'NoteAlreadyShared'], 'twice');
  eq((await state.carol.get('/notes/shared')).json, [{ id: state.noteId, title: 'edited', content: 'content 2', ownerId: state.bobId }], 'shared list');
  eq((await state.carol.get(`/notes/${state.noteId}`)).status, 200, 'carol reads it');
  const inbox = (await state.carol.get(`/notifications/account/${state.carolId}`)).json;
  const notice = inbox.notifications.find((n) => n.title === 'A note was shared with you: edited');
  ok(notice, 'the share notice', inbox.notifications.map((n) => n.title));
  eq([notice.recipientId, notice.metadata.noteId, notice.metadata.source], [state.carolId, state.noteId, 'Notes.NoteShared'], 'notice');
});

describe('Tracker');
await step('a user may not list operations; an administrator lists them by trace', async () => {
  eq((await state.bob.get('/tracker/operations')).status, 403, 'user');
  const byTrace = await state.admin.get(`/tracker/operations?traceId=${state.unknownShareTrace}`);
  eq(byTrace.status, 200, 'by trace');
  const records = byTrace.json;
  ok(records.some((r) => r.name === 'ShareNote' && r.status === 'ERROR'), 'the refused command', records.map((r) => [r.name, r.status]));
  ok(records.some((r) => r.name === 'NotificationFailed'), 'what it set off (the outcome notice, undelivered)', records.map((r) => r.name));
  ok(records.every((r) => r.traceId === state.unknownShareTrace), 'one trace');
  ok(records.every((r) => !('context' in r) && !('payload' in r)), 'no context, no payload');
});
await step('an operation an account started is read by that account or an administrator, not by another user nor anonymously', async () => {
  const created = await state.bob.post('/notes', { title: 'Private', content: '...' });
  const operationId = created.json.operationId;
  await outcome(state.bob, operationId);
  eq((await state.admin.get(`/tracker/operations/${operationId}`)).status, 200, 'admin');
  eq((await state.carol.get(`/tracker/operations/${operationId}`)).status, 404, 'another user');
  eq((await anonymous.get(`/tracker/operations/${operationId}`)).status, 403, 'anonymous, for an operation an account started');
  eq((await state.admin.get('/tracker/operations/00000000-0000-4000-8000-000000000000')).status, 404, 'unknown');
});

describe('Notifications');
await step('an inbox lists what was delivered, without the attempts', async () => {
  const inbox = await state.carol.get(`/notifications/account/${state.carolId}`);
  eq(inbox.status, 200, 'inbox');
  eq(keysOf(inbox.json), ['notifications', 'total', 'unread'], 'envelope');
  const emails = inbox.json.notifications.filter((n) => n.deliveredVia === 'EMAIL');
  eq(emails.map((n) => n.status), ['SENT', 'SENT'], 'account created and validated: two emails, delivered');
  ok(inbox.json.notifications.some((n) => n.metadata?.source === 'Security.AccountCreated'), 'the welcome notice');
  const shared = inbox.json.notifications.find((n) => n.metadata?.source === 'Notes.NoteShared');
  eq([shared.channels, shared.status], [['WEBSOCKET'], 'FAILED'], 'the share notice: a websocket she was not on');
  ok(inbox.json.notifications.every((n) => !('attempts' in n)), 'no attempts');
  const first = emails[0];
  for (const key of ['id', 'recipientId', 'title', 'content', 'status', 'channels', 'deliveredVia', 'createdAt', 'metadata']) {
    ok(key in first, `an item has ${key}`, keysOf(first));
  }
  state.notificationId = first.id;
  state.unread = inbox.json.unread;
});
await step('the recipient marks one read, once', async () => {
  const read = await accepted(state.carol, await state.carol.patch(`/notifications/${state.notificationId}/read`));
  eq([read.name, read.status], ['MarkAsReadNotification', 'SUCCESS'], 'mark read');
  const after = (await state.carol.get(`/notifications/account/${state.carolId}`)).json;
  eq(after.unread, state.unread - 1, 'one less unread');
  const item = after.notifications.find((n) => n.id === state.notificationId);
  eq(item.status, 'READ', 'READ');
  ok(isString(item.readAt), 'readAt');
  const again = await accepted(state.carol, await state.carol.patch(`/notifications/${state.notificationId}/read`));
  eq([again.status, again.error?.type], ['ERROR', 'NotificationAlreadyRead'], 'twice');
  const notice = after.notifications.find((n) => n.title === 'Operation complete: MarkAsReadNotification');
  ok(notice, 'the outcome notice, under the public name', after.notifications.map((n) => n.title));
  eq([notice.status, notice.channels], ['FAILED', ['WEBSOCKET']], 'undelivered without a websocket');
});
await step('an inbox is private; sending by hand is an administrator\'s', async () => {
  eq((await state.admin.get(`/notifications/account/${state.carolId}`)).status, 200, 'admin');
  eq((await state.bob.get(`/notifications/account/${state.carolId}`)).status, 403, 'another user');
  // The email channel addresses what the notification carries: the welcome notices bring the
  // address from Security's event, a notification sent by hand brings it in its metadata.
  const body = { recipientId: state.carolId, title: 'Hello', content: 'there', channels: ['EMAIL'], metadata: { email: state.carolEmail } };
  const refused = await accepted(state.bob, await state.bob.post('/notifications', body));
  eq([refused.name, refused.status, refused.error?.type], ['SendNotification', 'ERROR', 'NotAllowed'], 'user');
  const sent = await accepted(state.admin, await state.admin.post('/notifications', body));
  eq(sent.status, 'SUCCESS', 'admin');
  // Delivery follows the command, after its commit: a client sees it arrive, not at once.
  const delivered = await eventually(async () => {
    const inbox = (await state.carol.get(`/notifications/account/${state.carolId}`)).json;
    return inbox.notifications.find((n) => n.title === 'Hello' && n.status === 'SENT');
  });
  eq(delivered?.deliveredVia, 'EMAIL', 'delivered by email', delivered);
  const unread = (await state.carol.get(`/notifications/account/${state.carolId}?onlyUnread=true`)).json;
  ok(unread.notifications.every((n) => n.status !== 'READ'), 'onlyUnread filters the read ones');
});

describe('The live channel');
await step('a connected browser is told how its commands went', async () => {
  const wsBase = base.replace(/^http/, 'ws');
  const socket = new WebSocket(`${wsBase}/ws?token=${state.adminToken}`);
  const frames = [];
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Refused('the websocket refused an authenticated connection')), { once: true });
  });
  socket.addEventListener('message', (event) => frames.push(String(event.data)));
  await Promise.race([opened, new Promise((_, reject) => setTimeout(() => reject(new Refused('websocket open timed out')), 5000))]);
  await state.admin.post('/notes', { title: 'Live', content: 'wire' });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !frames.some((f) => f.includes('id="notifications"') && f.includes('succeeded'))) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  socket.close();
  ok(frames.some((f) => f.includes('id="notifications"') && f.includes('succeeded')), 'an HTMX fragment announcing the outcome', frames);
});
await step('an anonymous connection is closed at once', async () => {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  const closed = new Promise((resolve) => {
    socket.addEventListener('close', resolve, { once: true });
    socket.addEventListener('error', resolve, { once: true });
  });
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Refused('an anonymous websocket stayed open')), 5000))]);
});

describe('The HTMX fragments the page loads');
await step('not signed in: the login form; signed in through the form: the account', async () => {
  const form = await anonymous.get('/auth/me', HTMX);
  eq(form.status, 200, 'form');
  ok(form.text.includes('hx-post="/v1/auth/login"'), 'the login form');
  const loggedIn = await anonymous.post('/auth/login', { identifier: adminIdentifier, password: adminPassword }, HTMX);
  eq(loggedIn.status, 200, 'login through the form');
  ok(loggedIn.headers.get('set-cookie')?.startsWith('token='), 'cookie');
  ok(loggedIn.text.includes('hx-get="/v1/auth/me"'), 'the fragment that loads the account');
  ok(/data-token="[A-Za-z0-9._-]+"/.test(loggedIn.text), 'the fragment carries the token, for a page on another origin');
  const refused = await anonymous.post('/auth/login', { identifier: adminIdentifier, password: 'nope' }, HTMX);
  eq(refused.status, 401, 'refused');
  ok(refused.text.includes('alert'), 'an alert');
});
await step('the account page, the new-note form, logout', async () => {
  const me = await state.admin.get('/auth/me', HTMX);
  ok(me.text.includes(`Welcome ${adminIdentifier}`), 'welcome', me.text.slice(0, 200));
  const form = await state.admin.get('/notes/new', HTMX);
  ok(form.text.includes('hx-post="/v1/notes"'), 'the new-note form');
  const logout = await state.admin.post('/auth/logout', undefined, HTMX);
  eq(logout.status, 200, 'logout');
  ok(logout.text.includes('Login'), 'back to the login form');
});

console.log(`\n${passed} steps passed against ${base}`);
