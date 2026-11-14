/**
 * The ladder itself, run on a project and a kit built in a temp dir, with `runner: command` standing in for the agent
 * (no agent, no grading: the verdict refuses every tree, so no attempt reaches the hidden tests). It shows what the
 * agent is given (the request with its API fragment and those before it, D3) and that an attempt whose transcript
 * reads the kit is void and run again once, then stops the tree (`node --test .claude/flow/`).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { shortTmpDir } from './machine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const scratch = mkdtempSync(join(tmpdir(), 'run-ladder-'));
const runTmps = [];
after(() => {
  rmSync(scratch, { recursive: true, force: true });
  for (const dir of runTmps) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** A plain project on `main`, a kit of three requests (two with a fragment), and an agent that may read the kit. */
function setUp(name) {
  const dir = join(scratch, name);
  const project = join(dir, 'app');
  mkdirSync(project, { recursive: true });
  // The verdict refuses every tree: the attempt escalates on it, and the hidden tests are never graded.
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'app', scripts: { verify: 'exit 1' } }));
  writeFileSync(join(project, 'CLAUDE.md'), '# app\n');
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'created');

  const kit = join(dir, 'frozen');
  mkdirSync(join(kit, 'backlog'), { recursive: true });
  mkdirSync(join(kit, 'api'), { recursive: true });
  writeFileSync(
    join(kit, 'backlog/backlog.yaml'),
    'schemaVersion: 1\nfeatures:\n  - { id: first, n: 1 }\n  - { id: second, n: 2 }\n  - { id: third, n: 3 }\n',
  );
  for (const [n, id] of [
    [1, 'first'],
    [2, 'second'],
    [3, 'third'],
  ]) {
    writeFileSync(join(kit, 'backlog', `${n}-${id}.md`), `# ${n}. The ${id} request\n\nIts words.\n`);
    if (n !== 2) writeFileSync(join(kit, 'api', `${n}-${id}.yaml`), `# Request ${n}\nroutes:\n  GET /v1/${id}: {}\n`);
  }

  const out = join(dir, 'out');
  mkdirSync(out);
  // The agent: keeps its prompt, writes a transcript where Claude Code would, reading the kit for its first `LEAK`
  // turns, and commits something.
  const agent = join(dir, 'agent.sh');
  writeFileSync(
    agent,
    `#!/bin/sh
n=$(ls "$OUT" | wc -l)
printf '%s' "$PROMPT" > "$OUT/prompt-$n.txt"
slug=$(pwd | sed 's/[^A-Za-z0-9]/-/g')
mkdir -p "$CLAUDE_CONFIG_DIR/projects/$slug"
if [ "$n" -lt "$LEAK" ]; then target="$KIT/backlog"; else target="$PWD"; fi
printf '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls %s"}}]}}\\n' "$target" > "$CLAUDE_CONFIG_DIR/projects/$slug/s$n.jsonl"
echo "$n" > work.txt
git add -A && git -c user.name=a -c user.email=a@a commit -qm "turn $n"
`,
  );
  chmodSync(agent, 0o755);
  const plan = join(dir, 'plan.yaml');
  writeFileSync(
    plan,
    [
      `run: ${name}`,
      'arm: simple',
      'kit: frozen',
      'base: main',
      'of: 3',
      'ladder: [stand-in]',
      `agent: { runner: command, command: ${agent} }`,
      'retry: { perFeature: 0 }',
      `replayLock: ${join(dir, 'replay.lock')}`,
      'features: [second]',
      '',
    ].join('\n'),
  );
  return { dir, project, kit, out, plan };
}

function ladder({ dir, project, kit, out, plan }, leak) {
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp);
  const name = readFileSync(plan, 'utf8').match(/^run: (\S+)$/m)[1];
  runTmps.push(shortTmpDir(join(`${project}.flow`, 'tmp', name)));
  const ran = spawnSync(process.execPath, [join(here, 'run-ladder.mjs'), '--project', project, '--plan', plan], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: tmp,
      NODE_PATH: join(root, 'node_modules'),
      FLOW_REGISTRY: join(dir, 'registry.json'),
      FLOW_LADDERS: '3',
      CLAUDE_CONFIG_DIR: join(dir, 'claude'),
      OUT: out,
      KIT: kit,
      LEAK: String(leak),
    },
    timeout: 120_000,
  });
  const log = join(`${project}.flow`, `${name}.jsonl`);
  assert.ok(existsSync(log), ran.stderr);
  const events = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  const prompts = readdirSync(out)
    .sort()
    .map(file => readFileSync(join(out, file), 'utf8'));
  return { ran, events, prompts, tmp };
}

describe('the ladder', () => {
  it("gives the agent the request's text with its API fragment and those of the requests before it", () => {
    const { events, prompts } = ladder(setUp('brief'), 0);
    const brief = prompts[0];
    assert.match(brief, /This is feature 2 of 3/);
    assert.match(brief, /# 2\. The second request\n\nIts words\./);
    // Request 2 has no fragment of its own: request 1's is given, request 3's is not.
    assert.match(brief, /The API fragments of the requests before this one \(this request has none of its own\)/);
    assert.match(
      brief,
      /Request 1's fragment \(`1-first\.yaml`\):\n\n```yaml\n# Request 1\nroutes:\n {2}GET \/v1\/first: \{\}\n```/,
    );
    assert.doesNotMatch(brief, /Request 3's fragment|third/);
    assert.equal(events.filter(each => each.event === 'leak').length, 0);
    assert.equal(events.find(each => each.event === 'escalated')?.reason, 'verdict');
  });

  it('voids an attempt whose agent listed the kit, and runs it again once', () => {
    const { events, prompts } = ladder(setUp('leak-once'), 1);
    const leaks = events.filter(each => each.event === 'leak');
    assert.equal(leaks.length, 1);
    assert.equal(leaks[0].runAgain, true);
    assert.equal(leaks[0].touched[0].tool, 'Bash');
    assert.match(leaks[0].touched[0].matched, /frozen$/);
    assert.equal(events.filter(each => each.event === 'attempt' && each.step === 0).length, 2);
    // The attempt run again is judged as any is: here the verdict refuses it.
    assert.equal(events.find(each => each.event === 'escalated')?.reason, 'verdict');
    assert.equal(prompts.length, 2);
  });

  it('stops the tree when the attempt run again reads the kit too, and keeps the slots in the machine’s temp dir', () => {
    const { events, tmp } = ladder(setUp('leak-twice'), 99);
    const leaks = events.filter(each => each.event === 'leak');
    assert.deepEqual(
      leaks.map(each => each.runAgain),
      [true, false],
    );
    assert.equal(
      events.some(each => each.event === 'escalated' || each.event === 'needs-triage'),
      false,
    );
    const finished = events.at(-1);
    assert.equal(finished.event, 'finished');
    assert.equal(finished.state, 'STOPPED');
    assert.match(finished.features.second, /^VOID/);
    // The slots every ladder shares are in the TMPDIR the ladder was started with, not in the run's own.
    assert.ok(existsSync(join(tmp, 'clean-ddd-ladder-slots')));
  });
});
