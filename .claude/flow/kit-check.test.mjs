/**
 * The kit standard, tested on a kit of three requests built in a temp dir: what kit-check refuses,
 * and the composed API catching the three conventions OpenStay's trees broke long after they were
 * born (`node --test .claude/flow/`).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import { compose, loadFragments, validate, writeComposed } from './api-schema.mjs';
import { apiTableRoutes, checkKit, testNames } from './kit-check.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const Ajv = require('ajv');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const scratch = mkdtempSync(join(tmpdir(), 'kit-check-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** The fixture: accounts and operations (1), bookings (2), paying one (3), as data a test may change. */
function fixture() {
  return {
    backlog: {
      schemaVersion: 1,
      features: [
        { id: 'accounts', n: 1, needs: [] },
        { id: 'book', n: 2, needs: ['accounts'] },
        { id: 'pay', n: 3, needs: ['book'] },
      ],
    },
    requests: {
      '1-accounts': [
        '| Request | Answer |',
        '| --- | --- |',
        '| `POST /v1/accounts` `{ email }` | creates the account, `{ id }` |',
        "| `GET /v1/operations/{operationId}` | `{ status, result?, error? }`, `error` the refused rule's name |",
      ],
      '2-book': [
        '| Request | Answer |',
        '| --- | --- |',
        '| `POST /v1/bookings` `{ listingId }` | `{ id }` |',
        '| `GET /v1/bookings/{id}` | `{ id, status, total }`, `status` one of `requested`, `confirmed` |',
      ],
      '3-pay': [
        '| Provider request | Answer |',
        '| --- | --- |',
        '| `POST /payments` `{ amount }` | `201 { id }` |',
        '',
        '| Request | Answer |',
        '| --- | --- |',
        '| `POST /v1/bookings/{id}/pay` | `{ payUrl }` |',
        '| `GET /v1/bookings/{id}` | gains `payment: { status }`, `null` for a request still waiting; `status` may be `lapsed` |',
      ],
    },
    api: {
      '1-accounts': {
        resources: {
          operation: {
            schema: {
              type: 'object',
              required: ['status'],
              properties: { status: { enum: ['PENDING', 'SUCCESS', 'ERROR'] }, result: {}, error: { type: 'string' } },
            },
          },
          accepted: {
            schema: { type: 'object', required: ['operationId'], properties: { operationId: { type: 'string' } } },
          },
        },
        all_routes: { 202: 'accepted', '4xx': {} },
        routes: {
          'POST /v1/accounts': { 201: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
          'GET /v1/operations/{operationId}': { 200: 'operation' },
        },
      },
      '2-book': {
        resources: {
          booking: {
            schema: {
              type: 'object',
              required: ['id', 'status', 'total'],
              properties: {
                id: { type: 'string' },
                status: { enum: ['requested', 'confirmed'] },
                total: { type: 'integer' },
              },
            },
          },
        },
        routes: {
          'POST /v1/bookings': { 201: { type: 'object', required: ['id'] } },
          'GET /v1/bookings/{id}': { 200: 'booking' },
          'GET /v1/bookings/mine': { 200: { type: 'array', items: { $resource: 'booking' } } },
        },
      },
      '3-pay': {
        resources: {
          booking: {
            gains: {
              payment: {
                type: ['object', 'null'],
                required: ['status'],
                properties: { status: { enum: ['due', 'paid'] } },
              },
            },
            states: [{ field: 'status', add: ['lapsed'], test: 'reads a lapsed booking whole' }],
            conditions: [{ field: 'payment', null_only_when: { status: ['requested'] } }],
          },
        },
        routes: { 'POST /v1/bookings/{id}/pay': { 200: { type: 'object', required: ['payUrl'] } } },
      },
    },
    acceptance: {
      '1-accounts': [
        'refuses with a 4xx, never a 5xx, what it cannot do',
        "names the refused rule in the operation's error",
      ],
      '2-book': ['books a listing'],
      '3-pay': ['owes nothing while a request waits', 'reads a lapsed booking whole', 'lapses at the next sweep'],
    },
    conventions: {
      conventions: [
        {
          id: 'refusal',
          says: 'A refusal is a 4xx at once or an operation in ERROR; a 5xx is never an answer the application chooses.',
          born: 1,
          test: 'refuses with a 4xx, never a 5xx, what it cannot do',
        },
        {
          id: 'operation-error',
          says: "An operation's error is the name of the rule that refused it, a string.",
          born: 1,
          departs: 'operation.error',
          test: "names the refused rule in the operation's error",
        },
        {
          id: 'payment-null',
          says: "A booking's payment is null while its request waits, and in no other state.",
          born: 3,
          test: 'owes nothing while a request waits',
        },
        {
          id: 'lapse',
          says: 'An unpaid booking lapses at the next sweep, not when it is read.',
          born: 3,
          test: 'lapses at the next sweep',
        },
      ],
    },
  };
}

let kits = 0;
/** The fixture, changed by `change`, written as a kit. */
function kit(change = () => {}) {
  const data = fixture();
  change(data);
  const dir = join(scratch, `kit-${++kits}`);
  for (const sub of ['backlog', 'acceptance', 'api']) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, 'backlog/backlog.yaml'), yaml.dump(data.backlog));
  for (const [name, lines] of Object.entries(data.requests))
    writeFileSync(join(dir, 'backlog', `${name}.md`), `# ${name}\n\n${lines.join('\n')}\n`);
  for (const [name, fragment] of Object.entries(data.api))
    writeFileSync(join(dir, 'api', `${name}.yaml`), yaml.dump(fragment));
  for (const [name, tests] of Object.entries(data.acceptance))
    writeFileSync(
      join(dir, 'acceptance', `${name}.acceptance.ts`),
      `describe('${name}', () => {\n${tests.map(t => `  it(${JSON.stringify(t)}, async () => {});`).join('\n')}\n});\n`,
    );
  if (data.conventions) writeFileSync(join(dir, 'conventions.yaml'), yaml.dump(data.conventions));
  return dir;
}

const messages = result => result.findings.map(f => `${f.check} ${f.request}: ${f.message}`);

describe('kit-check', () => {
  it('passes the fixture, and prints the operation error it decided in request 1 as decided', () => {
    const result = checkKit(kit());
    assert.deepEqual(result.findings, []);
    assert.equal(result.notes.length, 1);
    assert.match(
      result.notes[0],
      /decided in request 1 by operation-error: the kit's operation `error` is string; the contract's is object/,
    );
  });

  it('refuses a request whose backlog file has an API table and no fragment', () => {
    const result = checkKit(kit(data => delete data.api['2-book']));
    assert.ok(messages(result).includes('fragment 2: 2-book.md has an API table, and there is no api/2-book.yaml'));
  });

  it('refuses a route of the table no fragment up to that request declares', () => {
    const result = checkKit(kit(data => delete data.api['3-pay'].routes));
    assert.deepEqual(messages(result), [
      "fragment 3: 3-pay.md's table names POST /v1/bookings/{id}/pay, which no fragment up to request 3 declares",
    ]);
  });

  it('refuses a convention without the request that sets it', () => {
    const result = checkKit(kit(data => delete data.conventions.conventions[2].born));
    assert.deepEqual(messages(result), ['convention undefined: payment-null has no `born`: the request that sets it']);
  });

  it('refuses a convention whose test is not in the acceptance file of the request that sets it', () => {
    // Request 80's 503: the convention was set at 26, and no test there asked.
    const result = checkKit(
      kit(data => (data.acceptance['1-accounts'] = ["names the refused rule in the operation's error"])),
    );
    assert.deepEqual(messages(result), [
      "convention 1: refusal: no it('refuses with a 4xx, never a 5xx, what it cannot do') in 1-accounts.acceptance.ts",
    ]);
    const untested = checkKit(kit(data => delete data.conventions.conventions[3].test));
    assert.deepEqual(messages(untested), ['convention 3: lapse names no test']);
  });

  it('refuses a kit with no register, and with it the decision its operation needed', () => {
    const result = checkKit(kit(data => delete data.conventions));
    assert.deepEqual(messages(result), [
      'convention undefined: the kit has no conventions.yaml: the conventions its requests rely on are not registered',
      "contract 1: the kit's operation `error` is string; the contract's is object (request 1): a conflict to decide in request 1",
    ]);
  });

  it('refuses a state added without a test that reads the whole resource in it', () => {
    const result = checkKit(kit(data => delete data.api['3-pay'].resources.booking.states[0].test));
    assert.deepEqual(messages(result), [
      'state 3: api/3-pay.yaml adds lapsed to booking.status, and its whole-resource test names no test',
    ]);
    const missing = checkKit(
      kit(data => (data.acceptance['3-pay'] = ['owes nothing while a request waits', 'lapses at the next sweep'])),
    );
    assert.deepEqual(messages(missing), [
      "state 3: api/3-pay.yaml adds lapsed to booking.status, and its whole-resource test: no it('reads a lapsed booking whole') in 3-pay.acceptance.ts",
    ]);
  });

  it("refuses an operation that differs from the contract's, as a conflict to decide in request 1", () => {
    const result = checkKit(kit(data => delete data.conventions.conventions[1].departs));
    assert.deepEqual(messages(result), [
      "contract 1: the kit's operation `error` is string; the contract's is object (request 1): a conflict to decide in request 1",
    ]);
    const late = checkKit(
      kit(data => {
        data.conventions.conventions[1].born = 3;
        data.conventions.conventions[1].test = 'owes nothing while a request waits';
      }),
    );
    assert.deepEqual(messages(late), [
      "contract 1: the kit's operation `error` is string; the contract's is object (request 1): a conflict to decide in request 1 (operation-error decides it at request 3)",
    ]);
  });

  it("names a status and a field the contract's operation does not have", () => {
    const result = checkKit(
      kit(data => {
        data.api['1-accounts'].resources.operation.schema.properties.status.enum.push('CANCELLED');
        data.api['1-accounts'].resources.operation.schema.properties.reason = { type: 'string' };
      }),
    );
    assert.deepEqual(messages(result), [
      "contract 1: the kit's operation `status` takes CANCELLED, which the contract's does not (PENDING, SUCCESS, ERROR, SENT) (request 1): a conflict to decide in request 1",
      "contract 1: the kit's operation has `reason`; the contract's has not (request 1): a conflict to decide in request 1",
    ]);
  });

  it('reads the routes of a request table, not of the provider table beside it', () => {
    assert.deepEqual(apiTableRoutes(fixture().requests['3-pay'].join('\n')), [
      'POST /v1/bookings/{id}/pay',
      'GET /v1/bookings/{id}',
    ]);
    assert.equal(apiTableRoutes('# no table here\n'), undefined);
    const j5 = readFileSync(join(root, 'docs/evaluations/benchmark/openstay/j5/backlog/27-pay-a-booking.md'), 'utf8');
    assert.deepEqual(apiTableRoutes(j5), ['POST /v1/bookings/{id}/pay', 'GET /v1/bookings/{id}']);
  });

  it('reads the names of the tests as the runner does', () => {
    assert.deepEqual(testNames(`it('a', f); it("it's b", f); test(\`c\`, f); it.skip('d \\'e\\'', f)`), [
      'a',
      "it's b",
      'c',
      "d 'e'",
    ]);
  });
});

describe('the composed API', () => {
  const api = compose(loadFragments(kit()), 3);
  const booking = { id: 'b1', status: 'confirmed', total: 100, payment: { status: 'due' } };

  it('holds what the requests give', () => {
    const answers = [
      { method: 'GET', path: '/v1/bookings/b1', status: 200, body: booking },
      { method: 'GET', path: '/v1/bookings/b1', status: 200, body: { ...booking, status: 'requested', payment: null } },
      { method: 'GET', path: '/v1/bookings/mine', status: 200, body: [booking] },
      { method: 'GET', path: '/v1/operations/o1?x=1', status: 200, body: { status: 'ERROR', error: 'TOO_SHORT' } },
      { method: 'POST', path: '/v1/bookings/b1/pay', status: 202, body: { operationId: 'o2' } },
      { method: 'POST', path: '/v1/bookings/b1/pay', status: 409, body: { message: 'already paid' } },
      { method: 'GET', path: '/v1/not-in-any-request', status: 500, body: {} },
    ];
    for (const answer of answers) assert.deepEqual(validate(api, answer), [], `${answer.method} ${answer.path}`);
  });

  it("catches an operation's error that is an object where request 1 says a string (J5b clean-3, request 61)", () => {
    const problems = validate(api, {
      method: 'GET',
      path: '/v1/operations/o1',
      status: 200,
      body: { status: 'ERROR', error: { type: 'COMMENT_TOO_SHORT', message: 'too short' } },
    });
    assert.deepEqual(
      problems.map(p => [p.requests, p.at]),
      [[[1], '.error']],
    );
    assert.match(problems[0].message, /GET \/v1\/operations\/o1 answered 200: \.error should be string \(request 1\)/);
  });

  it('catches a payment null in a state where request 3 says it is not (J5b simple-3, request 73)', () => {
    const problems = validate(api, {
      method: 'GET',
      path: '/v1/bookings/b1',
      status: 200,
      body: { ...booking, status: 'lapsed', payment: null },
    });
    assert.deepEqual(
      problems.map(p => [p.requests, p.at]),
      [[[3], '.payment']],
    );
    assert.match(problems[0].message, /payment is null only when status is requested/);
  });

  it("catches a 503 where request 1's convention says a refusal is a 4xx (J5, request 80)", () => {
    const problems = validate(api, {
      method: 'POST',
      path: '/v1/bookings/b1/pay',
      status: 503,
      body: { message: 'no provider' },
    });
    assert.deepEqual(
      problems.map(p => p.requests),
      [[1]],
    );
    assert.match(problems[0].message, /answered 503: the body should NOT be valid \(request 1: .*a 5xx never\)/);
  });

  it('holds a tree to the requests up to n only, and names the request that gave a missing property', () => {
    const before = compose(loadFragments(kit(), 2), 2);
    const unpaid = { id: 'b1', status: 'confirmed', total: 100 };
    assert.deepEqual(validate(before, { method: 'GET', path: '/v1/bookings/b1', status: 200, body: unpaid }), []);
    const problems = validate(api, { method: 'GET', path: '/v1/bookings/b1', status: 200, body: unpaid });
    assert.deepEqual(
      problems.map(p => p.requests),
      [[3]],
    );
    assert.match(problems[0].message, /should have required property 'payment' \(request 3\)/);
    const lapsed = validate(before, {
      method: 'GET',
      path: '/v1/bookings/b1',
      status: 200,
      body: { ...unpaid, status: 'lapsed' },
    });
    assert.match(lapsed[0].message, /\.status should be equal to one of the allowed values \(request 2\)/);
    assert.deepEqual(
      validate(api, { method: 'GET', path: '/v1/bookings/b1', status: 200, body: { ...booking, status: 'lapsed' } }),
      [],
    );
  });

  it('is written for the grader only when the kit has api/, and read by the lines a client needs', () => {
    const plain = kit(data => (data.api = {}));
    rmSync(join(plain, 'api'), { recursive: true });
    assert.equal(writeComposed(plain, 3, join(scratch, 'none.json')), undefined);
    assert.equal(existsSync(join(scratch, 'none.json')), false);

    const file = writeComposed(kit(), 3, join(scratch, 'api-schema.json'));
    // The lines of docs/evaluations/benchmark/kit-standard.md, as a kit's client has them.
    const composed = JSON.parse(readFileSync(file, 'utf8'));
    const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });
    const check = (method, path, status, body) => {
      const responses = composed.routes.find(r => r.method === method && new RegExp(r.pattern).test(path))?.responses;
      const schema = responses && (responses[status] ?? responses[`${String(status)[0]}xx`] ?? responses.default);
      if (schema && !ajv.validate(schema, body))
        throw new Error(
          ajv.errors.map(e => `${e.dataPath ?? e.instancePath} ${e.message} (${e.parentSchema.$comment})`).join('; '),
        );
    };
    assert.doesNotThrow(() => check('GET', '/v1/bookings/b1', 200, booking));
    assert.throws(() => check('POST', '/v1/accounts', 503, {}), /should NOT be valid \(request 1: /);
  });
});

describe("the contract's operation", () => {
  const contract = yaml.load(readFileSync(join(root, 'conventions/architecture.yaml'), 'utf8'));
  const ajv = new Ajv({ allErrors: true });
  const record = contract.http.operation.record;
  const read = { id: 'o1', name: 'SignUp', traceId: 't1', createdAt: '2026-11-11T10:00:00.000Z' };

  it('is read at the route the reference answers, with the statuses its Tracker records', () => {
    assert.equal(contract.http.operation.read, 'GET /tracker/operations/:id');
    assert.deepEqual(Object.keys(contract.http.operation.statuses), record.properties.status.enum);
  });

  it('holds the records the shared scenario reads (api/scenario.mjs)', () => {
    const finished = { ...read, finishedAt: '2026-11-11T10:00:01.000Z' };
    const records = [
      { ...read, status: 'PENDING' },
      { ...finished, status: 'SUCCESS', result: 'account-id', subjectId: 'admin' },
      { ...finished, status: 'SUCCESS' },
      {
        ...finished,
        status: 'ERROR',
        error: { type: 'AccountAlreadyExists', message: 'An account already exists for this email' },
      },
      { ...read, status: 'SENT' },
    ];
    for (const each of records) assert.ok(ajv.validate(record, each), `${each.status}: ${ajv.errorsText()}`);
  });

  it('refuses an error that is a name, an error on a success, and a payload', () => {
    const finished = { ...read, finishedAt: '2026-11-11T10:00:01.000Z' };
    assert.equal(ajv.validate(record, { ...finished, status: 'ERROR', error: 'AccountAlreadyExists' }), false);
    assert.equal(ajv.validate(record, { ...finished, status: 'SUCCESS', error: { type: 'X', message: 'x' } }), false);
    assert.equal(ajv.validate(record, { ...finished, status: 'SUCCESS', payload: { password: 'secret' } }), false);
    assert.equal(ajv.validate(record, { ...read, status: 'PENDING', result: 'early' }), false);
  });
});
