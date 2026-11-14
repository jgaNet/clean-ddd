import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  applicationAnswerProblems,
  applicationApiProblems,
  holdAnswer,
  loadApplicationApi,
  readApplicationFragments,
} from './index';

/**
 * An application's API as data (ADR 45): its `api/` composes or the check says which fragment does
 * not, and an answer is held to it, each problem naming the fragment whose shape it breaks. The
 * composition itself is the one the benchmark's kits use, specified with them
 * (`.claude/flow/kit-check.test.mjs`, "the composed API").
 */
const FIRST = `
resources:
  refusal:
    schema: { type: object, required: [message], properties: { message: { type: string } } }
  accepted:
    schema: { type: object, required: [operationId], properties: { operationId: { type: string } } }
all_routes:
  202: accepted
  4xx: refusal
routes: {}
`;
const TASKS = `
resources:
  task:
    schema:
      type: object
      required: [id, title]
      additionalProperties: false
      properties: { id: { type: string }, title: { type: string }, status: { enum: [open, done] } }
routes:
  GET /v1/tasks/{id}:
    200: task
  GET /v1/tasks:
    200: { type: array, items: { $resource: task } }
`;
const DUE = `
resources:
  task:
    gains:
      dueOn: { type: [string, 'null'] }
`;

describe("an application's api/", () => {
  const roots: string[] = [];
  const application = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), 'api-'));
    roots.push(root);
    mkdirSync(join(root, 'api'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'api', name), text);
    return root;
  };
  afterAll(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));

  it('is read in the order of its numbers, its README aside, and composes', () => {
    const root = application({
      '10-due-dates.yaml': DUE,
      '2-tasks.yaml': TASKS,
      '1-the-api.yaml': FIRST,
      'README.md': '# The API',
    });
    expect(readApplicationFragments(root).fragments.map(each => each.file)).toEqual([
      'api/1-the-api.yaml',
      'api/2-tasks.yaml',
      'api/10-due-dates.yaml',
    ]);
    expect(applicationApiProblems(root)).toEqual([]);
    const api = loadApplicationApi(root);
    expect(api.routes.map(route => `${route.method} ${route.path}`)).toEqual(['GET /v1/tasks', 'GET /v1/tasks/{id}']);
    expect(api.fragments.map(each => each.n)).toEqual([1, 2, 10]);
  });

  it('is nothing to check where an application has none', () => {
    expect(applicationApiProblems(mkdtempSync(join(tmpdir(), 'no-api-')))).toEqual([]);
  });

  it('refuses a fragment that does not parse, a file that is not one, and a number given twice', () => {
    const root = application({
      '1-the-api.yaml': FIRST,
      '2-tasks.yaml': 'routes:\n  GET /v1/tasks:\n    200: [unclosed\n',
      'tasks.yaml': TASKS,
      '3-a.yaml': TASKS,
      '3-b.yaml': DUE,
      '4-odd.yaml': 'paths: {}\nroutes:\n  /v1/tasks:\n    ok: task\n',
    });
    const problems = applicationApiProblems(root);
    expect(problems).toContainEqual(expect.stringMatching(/^api\/2-tasks\.yaml does not parse: /));
    expect(problems).toContainEqual(expect.stringMatching(/^api\/tasks\.yaml: a fragment is named <n>-<name>\.yaml/));
    expect(problems).toContain('api/3-b.yaml: api/3-a.yaml has the number 3 already; one fragment per number');
    expect(problems).toContain(
      'api/4-odd.yaml: "paths" is not something a fragment says (resources, all_routes, routes)',
    );
    expect(problems).toContain(
      'api/4-odd.yaml: "/v1/tasks" is not a route: a method and a whole path (GET /v1/things/{id})',
    );
    expect(problems).toContain(
      'api/4-odd.yaml: /v1/tasks answers "ok", which is neither a status (200) nor a class (4xx)',
    );
    expect(() => loadApplicationApi(root)).toThrow(/^api\/ does not compose:\n {2}- /);
  });

  it('refuses a route answered with a resource no fragment defines, and a $resource nothing defines', () => {
    const root = application({
      '1-the-api.yaml': FIRST,
      '2-tasks.yaml': `${TASKS}  GET /v1/tasks/{id}/notes:\n    200: note\n  GET /v1/tags:\n    200: { type: array, items: { $resource: tag } }\n`,
    });
    expect(applicationApiProblems(root)).toEqual([
      'api/2-tasks.yaml: GET /v1/tasks/{id}/notes answers 200 with the resource note, which no fragment of api/ defines',
      'api/2-tasks.yaml: GET /v1/tags answers 200 with the resource tag, which no fragment of api/ defines',
    ]);
  });

  it('refuses a change composition cannot make, naming its fragment', () => {
    const root = application({ '1-the-api.yaml': FIRST, '2-due-dates.yaml': DUE });
    expect(applicationApiProblems(root)).toEqual([
      'api/2-due-dates.yaml: the resource task is changed before any request defines it',
    ]);
  });

  describe('an answer held to it', () => {
    let root: string;
    beforeAll(() => {
      root = application({ '1-the-api.yaml': FIRST, '2-tasks.yaml': TASKS, '3-due-dates.yaml': DUE });
    });
    const task = { id: 't1', title: 'Write the fragment', dueOn: null };
    const problems = (method: string, path: string, status: number, body: unknown) =>
      applicationAnswerProblems(loadApplicationApi(root), { method, path, status, body });

    it('passes the shapes the fragments give, a refusal and a 202 on any route', () => {
      expect(problems('GET', '/v1/tasks/t1', 200, task)).toEqual([]);
      expect(problems('GET', '/v1/tasks?status=open', 200, [task])).toEqual([]);
      expect(problems('GET', '/v1/tasks/t2', 404, { message: 'no such task' })).toEqual([]);
      expect(problems('POST', '/v1/tasks', 202, { operationId: 'o1' })).toEqual([]);
      // A route no fragment declares answers what any route may: a refusal.
      expect(problems('GET', '/v1/no-such-route', 404, { message: 'not found', statusCode: 404 })).toEqual([]);
    });

    it('fails an answer of another shape, naming the fragment, the field and the property', () => {
      expect(problems('GET', '/v1/tasks/t1', 200, { id: 't1', name: 'renamed', dueOn: null })).toEqual([
        "GET /v1/tasks/t1 answered 200: the body should NOT have additional properties ('name') (request 2), the shape api/2-tasks.yaml gives",
        "GET /v1/tasks/t1 answered 200: the body should have required property 'title' (request 2), the shape api/2-tasks.yaml gives",
      ]);
      expect(problems('GET', '/v1/tasks/t1', 200, { id: 't1', title: 'no due date' })).toEqual([
        "GET /v1/tasks/t1 answered 200: the body should have required property 'dueOn' (request 3), the shape api/3-due-dates.yaml gives",
      ]);
      expect(problems('GET', '/v1/tasks/t2', 404, {})).toEqual([
        "GET /v1/tasks/t2 answered 404: the body should have required property 'message' (request 1), the shape api/1-the-api.yaml gives",
      ]);
    });

    it('fails a status neither the route nor all_routes names, and a route answered before its fragment', () => {
      expect(problems('GET', '/v1/tasks/t1', 500, { message: 'boom' })).toEqual([
        'GET /v1/tasks/t1 answered 500, a status neither its route (GET /v1/tasks/{id}) nor all_routes names (api/1-the-api.yaml)',
      ]);
      expect(problems('GET', '/v1/projects', 200, [])).toEqual([
        'GET /v1/projects answered 200 on a route no fragment of api/ declares: write its fragment first (all_routes, api/1-the-api.yaml, allows no 200 elsewhere)',
      ]);
    });

    it('throws with every problem, for the end-to-end client', () => {
      const api = loadApplicationApi(root);
      expect(() => holdAnswer(api, { method: 'GET', path: '/v1/tasks/t1', status: 200, body: task })).not.toThrow();
      expect(() => holdAnswer(api, { method: 'GET', path: '/v1/tasks/t1', status: 200, body: {} })).toThrow(
        /required property 'id' .*api\/2-tasks\.yaml gives\n.*required property 'title'/,
      );
    });
  });
});
