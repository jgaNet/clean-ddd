/**
 * K4's driver, tested without an agent, a database or a tree: the plan it reads, the prompt and settings per arm,
 * the kit it composes, what makes a run recorded, void or successful, and the dry run of the 54 runs:
 * `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  armSettings,
  cleanEnvironment,
  codeSuccess,
  composeKit,
  composePrompt,
  guidanceAbove,
  J5_KIT,
  loadPlan,
  PILOT,
  regressionsOf,
  runStatus,
  tokensOf,
} from './run-task.mjs';

const yaml = createRequire(new URL('../../package.json', import.meta.url))('js-yaml');
const scratch = mkdtempSync(join(tmpdir(), 'run-task-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const plan = loadPlan();

describe('the plan', () => {
  it('holds 54 runs: 6 tasks, 3 arms, 3 runs each, each task once a round', () => {
    assert.equal(plan.runs.length, 54);
    const cells = new Map();
    for (const run of plan.runs) cells.set(`${run.task}/${run.arm}`, (cells.get(`${run.task}/${run.arm}`) ?? 0) + 1);
    assert.equal(cells.size, 18);
    assert.ok([...cells.values()].every(count => count === 3));
    assert.deepEqual(
      plan.runs.map(run => run.order),
      Array.from({ length: 54 }, (_, index) => index + 1),
    );
    for (const run of plan.runs) assert.ok(existsSync(join(PILOT, 'tasks', run.task, 'task.md')), run.task);
  });
});

describe('the prompt and the settings of each arm', () => {
  const task = readFileSync(join(PILOT, 'tasks/1-cancelled-stay-hides-contacts/task.md'), 'utf8');

  it("holds the task verbatim, the port, and C's sentence in C only", () => {
    const b = composePrompt(plan, task, 'B', 4471);
    assert.ok(b.includes(task.trimEnd()));
    assert.ok(b.startsWith('You are working in a git repository of an application, on its current branch.'));
    assert.match(b, /use port 4471\.$/);
    assert.equal(composePrompt(plan, task, 'A', 4471), b, 'A and B are given the same prompt');
    const c = composePrompt(plan, task, 'C', 4471);
    assert.ok(c.startsWith(b));
    assert.match(c, /clean-ddd knowledge <name>/);
    assert.doesNotMatch(b, /knowledge|CLAUDE\.md|gate|architecture/);
  });

  it('gives A the six tools and no slash commands, B and C the skills too, every arm the project settings only', () => {
    const a = armSettings(plan, 'A', 'uuid-a');
    assert.deepEqual(a.tools, ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep']);
    assert.ok(a.extraArgs.includes('--disable-slash-commands'));
    for (const arm of ['B', 'C']) {
      const settings = armSettings(plan, arm, 'uuid');
      assert.deepEqual(settings.tools, [...a.tools, 'Skill']);
      assert.ok(!settings.extraArgs.includes('--disable-slash-commands'));
    }
    for (const arm of ['A', 'B', 'C']) {
      const { extraArgs, tools } = armSettings(plan, arm, `uuid-${arm}`);
      const at = flag => extraArgs[extraArgs.indexOf(flag) + 1];
      assert.equal(at('--setting-sources'), 'project');
      assert.ok(extraArgs.includes('--strict-mcp-config'));
      assert.equal(at('--session-id'), `uuid-${arm}`);
      assert.equal(at('--tools'), tools.join(','));
    }
  });
});

describe('the kit composed for a task', () => {
  it("is J5's kit with the task as request 101 and its hidden test beside J5's", () => {
    const dir = join(scratch, 'kit');
    composeKit({
      taskDir: join(PILOT, 'tasks/3-message-notice-names-the-listing'),
      task: '3-message-notice-names-the-listing',
      dir,
    });
    const backlog = yaml.load(readFileSync(join(dir, 'backlog/backlog.yaml'), 'utf8'));
    const j5 = yaml.load(readFileSync(join(J5_KIT, 'backlog/backlog.yaml'), 'utf8'));
    assert.equal(backlog.features.length, j5.features.length + 1);
    assert.deepEqual(backlog.features.at(-1), {
      id: 'k4-3-message-notice-names-the-listing',
      n: 101,
      contexts: [],
      needs: [],
      kind: 'k4',
    });
    const acceptance = readdirSync(join(dir, 'acceptance'));
    assert.ok(acceptance.includes('101-k4-3-message-notice-names-the-listing.acceptance.ts'));
    assert.ok(acceptance.includes('openstay.ts') && acceptance.includes('provider.ts'), "J5's support, unchanged");
    assert.equal(acceptance.filter(name => name.endsWith('.acceptance.ts')).length, j5.features.length + 1);
    assert.equal(readdirSync(join(dir, 'storms')).length, readdirSync(join(J5_KIT, 'storms')).length);
  });
});

describe('a run recorded, void, or successful', () => {
  const records = join(scratch, 'records');
  mkdirSync(records, { recursive: true });

  it('is pending, then the next attempt after a void one, and recorded once a record is not void', () => {
    assert.deepEqual(runStatus(records, 'k4-t2-A-r1'), { status: 'pending', attempt: 1, voided: 0 });
    writeFileSync(join(records, 'k4-t2-A-r1.json'), JSON.stringify({ id: 'k4-t2-A-r1', void: true }));
    assert.deepEqual(runStatus(records, 'k4-t2-A-r1'), { status: 'pending', attempt: 2, voided: 1 });
    writeFileSync(
      join(records, 'k4-t2-A-r1.2.json'),
      JSON.stringify({ id: 'k4-t2-A-r1.2', void: false, success: true }),
    );
    const status = runStatus(records, 'k4-t2-A-r1');
    assert.equal(status.status, 'recorded');
    assert.equal(status.attempt, 2);
    assert.equal(runStatus(records, 'k4-t2-A-r10').status, 'pending', 'another run with a longer id is another run');
  });

  it('stops after three void attempts: the operator decides', () => {
    for (const name of ['k4-t3-B-r1', 'k4-t3-B-r1.2', 'k4-t3-B-r1.3'])
      writeFileSync(join(records, `${name}.json`), JSON.stringify({ id: name, void: true }));
    assert.equal(runStatus(records, 'k4-t3-B-r1').status, 'exhausted');
  });

  it('succeeds when the hidden test, the five checks and the J5 kit hold, whatever the conventions check says', () => {
    const checks = Object.fromEntries(
      ['format:check', 'lint', 'typecheck', 'test:units', 'test:e2e'].map(name => [name, { pass: true }]),
    );
    const grading = {
      applied: { pass: true },
      hidden: { pass: true },
      checks,
      apart: { 'check:conventions': { pass: false } },
      regressions: [],
    };
    assert.equal(codeSuccess(grading), true);
    assert.equal(codeSuccess({ ...grading, hidden: { pass: false } }), false);
    assert.equal(codeSuccess({ ...grading, checks: { ...checks, lint: { pass: false } } }), false);
    assert.equal(codeSuccess({ ...grading, regressions: ['53-contact-details-held-back'] }), false);
    assert.equal(codeSuccess({ ...grading, applied: { pass: false } }), false);
  });

  it('counts as a regression a J5 file that passes on the start and fails on the result, not the task itself', () => {
    const at = (feature, pass) => ({ feature, M2: { pass } });
    const baseline = [at('51-conversations', true), at('53-contact-details-held-back', false), at('k4-1', false)];
    const result = [at('51-conversations', false), at('53-contact-details-held-back', false), at('k4-1', false)];
    assert.deepEqual(regressionsOf(baseline, result, 'k4-1'), ['51-conversations']);
  });

  it("sums the tokens the runner reports, every model's: input, output, cache read and cache creation", () => {
    assert.equal(
      tokensOf({
        'claude-haiku-5-5': {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadInputTokens: 300,
          cacheCreationInputTokens: 40,
        },
        'claude-other': { inputTokens: 1, outputTokens: 2 },
      }),
      373,
    );
    assert.equal(tokensOf(undefined), undefined);
  });
});

describe("the agent's tree", () => {
  it('refuses guidance above it: a CLAUDE.md or a .claude/ of a directory it sits in', () => {
    const outer = join(scratch, 'outer');
    mkdirSync(join(outer, 'runs/01/openstay'), { recursive: true });
    assert.deepEqual(guidanceAbove(join(outer, 'runs/01/openstay'), '/nowhere'), []);
    writeFileSync(join(outer, 'CLAUDE.md'), '# not the tree');
    assert.deepEqual(guidanceAbove(join(outer, 'runs/01/openstay'), '/nowhere'), [join(outer, 'CLAUDE.md')]);
  });
});

describe("the agent's environment", () => {
  it('names no path the agent must not be told, and keeps the rest of the PATH', () => {
    const env = cleanEnvironment(
      {
        PATH: '/usr/local/bin:/home/user/cdd-next/node_modules/.bin:/usr/bin',
        INIT_CWD: '/somewhere',
        OLDPWD: '/home/user/cdd-next',
        CLAUDECODE: '1',
        K4_WORK: '/var/tmp/k4',
        HOME: '/root',
        PROJECT: '/home/user/cdd-next/docs',
      },
      ['/home/user/cdd-next'],
    );
    assert.deepEqual(env, { PATH: '/usr/local/bin:/usr/bin', HOME: '/root' });
  });
});

describe('the dry run', () => {
  it('prints the 54 runs, runs nothing, and finds no problem when the K3 package is given', () => {
    const work = join(scratch, 'work');
    const k3 = join(scratch, 'clean-ddd-k3.tgz');
    writeFileSync(k3, 'a stand-in for the K3 package');
    const done = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('run-task.mjs', import.meta.url)),
        '--dry',
        '--work',
        work,
        '--k3',
        k3,
        '--openstay',
        scratch,
        '--modules',
        scratch,
      ],
      {
        encoding: 'utf8',
      },
    );
    assert.match(done.stdout, /^54 run\(s\): A 18, B 18, C 18; per task 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9$/m);
    assert.match(done.stdout, /54 pending/);
    assert.match(done.stdout, /--disable-slash-commands/);
    assert.equal((done.stdout.match(/^#\d+ /gm) ?? []).length, 54);
    // The scratch directory is no OpenStay repository: the only problem the dry run finds.
    assert.match(done.stdout, /problems \(1\):\n {2}- OpenStay's repository has no commit c1ac8da/);
    assert.equal(existsSync(work), false, 'nothing is made');
  });
});
