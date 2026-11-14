/**
 * K4's transcript measures, on a small fixture transcript, tested without an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  classifyBash,
  filesPrinted,
  groundTruthPaths,
  loadGroundTruth,
  measureFile,
  parseShell,
  scanLeakage,
} from './k4-measures.mjs';

const yaml = createRequire(new URL('../../package.json', import.meta.url))('js-yaml');
const scratch = mkdtempSync(join(tmpdir(), 'k4-measures-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const ROOT = '/work/runs/01/openstay';
const TRACKED = [
  'CLAUDE.md',
  'src/Contexts/Messaging/module.local.ts',
  'src/Contexts/Messaging/Domain/Conversation/Conversation.ts',
  'src/Contexts/Booking/Infrastructure/PostgresBookingQueries.ts',
  'src/Contexts/Booking/module.local.ts',
  'src/Contexts/Reviews/module.local.ts',
];

/** A session as Claude Code writes it: assistant lines with tool uses, user lines with their results. */
function fixture() {
  const lines = [{ type: 'queue-operation' }, { type: 'user', message: { role: 'user', content: 'the prompt' } }];
  let n = 0;
  const call = (name, input, result) => {
    const id = `toolu_${++n}`;
    lines.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
    lines.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: result }] } });
  };
  call('Skill', { skill: 'feature' }, 'x'.repeat(50)); // 0 other (a skill)
  call('Read', { file_path: `${ROOT}/CLAUDE.md` }, 'g'.repeat(1000)); // 1 explore, reads CLAUDE.md
  call('Grep', { pattern: 'hasPaidStay', path: 'src' }, 'm'.repeat(200)); // 2 explore, reads nothing
  call('Bash', { command: 'clean-ddd knowledge IBookingQueries 2>&1 | head -80' }, 'k'.repeat(300)); // 3 explore, knowledge
  call('Bash', { command: 'cat src/Contexts/*/module.local.ts && git log --oneline -3' }, [
    { type: 'text', text: 'c'.repeat(400) },
  ]); // 4 explore, 3 files
  call(
    'Bash',
    { command: "sed -n '1,80p' src/Contexts/Booking/Infrastructure/PostgresBookingQueries.ts" },
    's'.repeat(100),
  ); // 5 explore
  call(
    'Edit',
    {
      file_path: `${ROOT}/src/Contexts/Booking/Infrastructure/PostgresBookingQueries.ts`,
      old_string: 'a',
      new_string: 'b',
    },
    'ok',
  ); // 6 edit
  call('Read', { file_path: `${ROOT}/src/Contexts/Messaging/Domain/Conversation/Conversation.ts` }, 'r'.repeat(500)); // 7 explore, after the edit
  call('Bash', { command: 'yarn -s test:e2e 2>&1 | tail -30' }, 'v'.repeat(250)); // 8 verify
  call('Bash', { command: "cat > notes.txt <<'EOF'\ncat src/Contexts/Reviews/module.local.ts\nEOF" }, ''); // 9 edit (a redirection into the tree)
  call('Bash', { command: 'git add -A && git commit -m "Fix: a paid stay > a cancelled one"' }, 'committed'); // 10 other
  lines.push({
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: 'Done: the query no longer requires a booking that is not cancelled.' }],
    },
  });
  return lines;
}

const GROUND_TRUTH = {
  rule: {
    lives_in: [
      'src/Contexts/Booking/Infrastructure/PostgresBookingQueries.ts',
      'src/Contexts/Messaging/module.local.ts',
    ],
  },
  reference_solution: {
    changes: { source: ['src/Contexts/Booking/Infrastructure/PostgresBookingQueries.ts'], tests: [] },
  },
};

describe('the shell reader', () => {
  it('finds every command of a line, across operators, pipes and substitutions, and skips here-documents', () => {
    const verbs = parseShell(
      "cd src && cat a.ts | head -5; echo $(wc -l b.ts) || true\ncat > c.ts <<'EOF'\nrm -rf /\nEOF",
    ).map(each => each.words[0]);
    assert.deepEqual(verbs, ['cd', 'cat', 'head', 'wc', 'echo', 'true', 'cat']);
  });

  it('classes a call by the first of edit, verify, explore its commands have', () => {
    const root = ROOT;
    assert.equal(classifyBash('grep -rn foo src | head', root).class, 'explore');
    assert.equal(classifyBash('yarn test 2>&1 | tail -30', root).class, 'verify');
    assert.equal(classifyBash('yarn -s architecture gate --base abc --json', root).class, 'verify');
    assert.equal(classifyBash('yarn architecture checklist command', root).class, 'explore');
    assert.equal(classifyBash("sed -i 's/a/b/' src/x.ts && yarn lint", root).class, 'edit');
    assert.equal(
      classifyBash('ls src > /tmp/listing.txt', root).class,
      'explore',
      'a redirection outside the tree writes nothing in it',
    );
    assert.equal(classifyBash('rm -rf /tmp/scratch', root).class, 'other');
    assert.equal(classifyBash('rm src/x.ts', root).class, 'edit');
    assert.equal(classifyBash(`node -e "require('fs').writeFileSync('a.ts', '')"`, root).class, 'edit');
    assert.equal(classifyBash('git commit -m "a > b"', root).class, 'other', 'a quoted > is no redirection');
    assert.equal(classifyBash('echo hello', root).class, 'other');
    assert.equal(classifyBash('npx clean-ddd knowledge MessageSentEvent', root).knowledge, true);
    assert.equal(
      classifyBash('yarn architecture knowledge MessageSentEvent', root).knowledge,
      false,
      "the tree's 0.2.0 has no knowledge",
    );
  });

  it('reads the files a command prints, not those it searches, with globs and cd', () => {
    const tracked = new Set(TRACKED);
    assert.deepEqual(filesPrinted('cat src/Contexts/*/module.local.ts', ROOT, tracked).sort(), [
      'src/Contexts/Booking/module.local.ts',
      'src/Contexts/Messaging/module.local.ts',
      'src/Contexts/Reviews/module.local.ts',
    ]);
    assert.deepEqual(filesPrinted('cd src/Contexts/Messaging && head -n 40 module.local.ts', ROOT, tracked), [
      'src/Contexts/Messaging/module.local.ts',
    ]);
    assert.deepEqual(filesPrinted('grep -n Clock src/Contexts/Messaging/module.local.ts', ROOT, tracked), []);
    assert.deepEqual(filesPrinted("sed -n '1,9p' CLAUDE.md", ROOT, tracked), ['CLAUDE.md']);
    assert.deepEqual(filesPrinted('git show HEAD:CLAUDE.md', ROOT, tracked), ['CLAUDE.md']);
    assert.deepEqual(filesPrinted('cat /etc/hosts untracked.ts', ROOT, tracked), []);
  });
});

describe('the measures of a transcript', () => {
  const file = join(scratch, 'session.jsonl');
  writeFileSync(
    file,
    `${fixture()
      .map(line => JSON.stringify(line))
      .join('\n')}\nnot json\n`,
  );
  const result = measureFile(file, {
    root: ROOT,
    tracked: TRACKED,
    changed: ['src/Contexts/Booking/Infrastructure/PostgresBookingQueries.ts'],
    groundTruth: GROUND_TRUTH,
  });

  it('classes each call and counts the bytes of its result', () => {
    assert.equal(result.calls, 11);
    assert.deepEqual(
      Object.fromEntries(Object.entries(result.classes).map(([cls, each]) => [cls, [each.calls, each.bytes]])),
      { explore: [6, 2500], edit: [2, 2], verify: [1, 250], other: [2, 59] },
    );
    assert.equal(result.resultBytes, 2811);
    assert.equal(result.classes.explore.byteShare, Number((2500 / 2811).toFixed(4)));
  });

  it('counts the files read before the first edit and the unnecessary ones', () => {
    assert.equal(result.firstEdit, 6);
    assert.equal(result.exploreCallsBeforeFirstEdit, 5);
    // CLAUDE.md, the three modules, PostgresBookingQueries.ts
    assert.equal(result.filesReadBeforeFirstEdit, 5);
    assert.equal(result.filesRead, 6);
    // Neither changed nor named by the ground truth; the here-document's `cat` is code, not a read.
    assert.deepEqual(result.unnecessary, [
      'CLAUDE.md',
      'src/Contexts/Booking/module.local.ts',
      'src/Contexts/Messaging/Domain/Conversation/Conversation.ts',
      'src/Contexts/Reviews/module.local.ts',
    ]);
  });

  it('counts the knowledge query and the skills on their own', () => {
    assert.deepEqual(result.knowledge, { calls: 1, bytes: 300, beforeFirstEdit: true });
    assert.equal(result.skill.calls, 1);
    assert.deepEqual(result.skill.names, ['feature']);
    assert.match(result.finalText, /no longer requires/);
  });

  it('finds no leakage in a clean run', () => {
    assert.equal(result.leakage.void, false);
  });
});

describe('leakage', () => {
  const call = (input, result = '') => ({ name: 'Bash', input: { command: input }, result });
  it("voids a run whose input names a hidden test, the kit, the K3 package's source or a path given", () => {
    const scan = scanLeakage(
      [
        call('ls src'),
        call('cat /home/user/cdd-next/docs/evaluations/knowledge/k4-pilot/tasks/1-x/ground-truth.yaml'),
        call('find / -name "101-k4-1.acceptance.ts"'),
        call('cat ../openstay.k3/package/tools/dist/cli.js'),
        call('ls /home/user/openstay/src'),
        call('ls /home/user/openstay-other'),
        call('find / -name "*.yaml"', '/home/user/cdd-next/docs/evaluations/x.yaml'),
      ],
      ['/home/user/openstay'],
    );
    assert.equal(scan.void, true);
    assert.deepEqual(
      scan.touched.map(each => [each.call, each.matched]),
      [
        [1, 'docs/evaluations'],
        [2, '*.acceptance.ts'],
        [3, 'the K3 package'],
        [4, '/home/user/openstay'],
      ],
    );
    assert.deepEqual(
      scan.seen.map(each => each.call),
      [6],
      'a result that lists a path is seen, and voids nothing',
    );
  });
});

describe('the ground truth', () => {
  it('reads a ground truth whose line is not valid YAML in memory, and says so', () => {
    // Task 5's file was registered with such a line (`… 0.2.0, predates: nothing …`); it is fixed, the reading kept.
    const text = [
      'task: example',
      'rule:',
      '  born: request 57; its tooling, 0.2.0, predates: nothing holds it',
      '',
    ].join('\n');
    assert.throws(() => yaml.load(text));
    const { groundTruth, repaired } = loadGroundTruth(text, yaml.load);
    assert.deepEqual(
      repaired.map(each => each.line),
      [3],
    );
    assert.equal(groundTruth.task, 'example');
  });

  it("reads task 5's file as registered, with nothing to repair", () => {
    const file = new URL(
      '../../docs/evaluations/knowledge/k4-pilot/tasks/5-domain-time-is-given/ground-truth.yaml',
      import.meta.url,
    );
    const { groundTruth, repaired } = loadGroundTruth(readFileSync(file, 'utf8'), yaml.load);
    assert.deepEqual(repaired, []);
    assert.equal(groundTruth.start_reads.length, 7);
  });

  it('names the paths of its reference changes, where the rule lives, the half-done work and the expected impact', () => {
    const tasks = new URL('../../docs/evaluations/knowledge/k4-pilot/tasks/', import.meta.url);
    const load = name =>
      loadGroundTruth(readFileSync(new URL(`${name}/ground-truth.yaml`, tasks), 'utf8'), yaml.load).groundTruth;
    const four = groundTruthPaths(load('4-review-window-impact'));
    assert.ok(four.has('src/Contexts/Reviews/Domain/StayReview/ReviewWindow.ts'));
    assert.ok(four.has('conventions/domain.yaml'), 'tolerated paths are named too');
    const six = groundTruthPaths(load('6-archive-a-conversation'));
    assert.ok(six.has('src/Contexts/Messaging/Infrastructure/PostgresConversations.ts'), 'the half-done work');
    assert.ok(six.has('src/Contexts/Messaging/module.local.ts'), 'the reference changes');
  });
});
