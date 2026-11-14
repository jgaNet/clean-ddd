/**
 * K4's table and §8's criteria, read from synthetic records: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import { criterion1, criterion2, keptRuns, markdown, pilotVerdict, report } from './k4-report.mjs';

const yaml = createRequire(new URL('../../package.json', import.meta.url))('js-yaml');
const plan = yaml.load(
  readFileSync(new URL('../../docs/evaluations/knowledge/k4-pilot/plan.yaml', import.meta.url), 'utf8'),
);
const tasks = [...new Set(plan.runs.map(run => run.task))];

/**
 * Records for every run of the plan: `tokens(arm, task)` and `success(arm, task, run)` decide each; task 4's recall is
 * `recall(arm, run)`.
 */
function records({ tokens = () => 1000, success = () => true, recall = () => 0.5 } = {}) {
  return plan.runs.map(run => ({
    id: run.id,
    plan: run.id,
    task: run.task,
    arm: run.arm,
    run: run.run,
    void: false,
    success: success(run.arm, run.task, run.run),
    agent: { tokens: tokens(run.arm, run.task), costUsd: 0.5, durationMs: 600_000 },
    measures: {
      classes: { explore: { byteShare: 0.7 } },
      filesReadBeforeFirstEdit: 10,
      unnecessaryFilesRead: 4,
      knowledge: { calls: run.arm === 'C' ? 2 : 0, beforeFirstEdit: run.arm === 'C' },
    },
    ...(run.task === '4-review-window-impact' && {
      score: { pooled: { recall: recall(run.arm, run.run), precision: 0.8, f1: 0.6 } },
    }),
  }));
}
const verdicts = all => {
  const runs = keptRuns(plan.runs, all);
  const b = runs.filter(run => run.arm === 'B');
  const c = runs.filter(run => run.arm === 'C');
  return [criterion1(b, c, tasks).verdict, criterion2(b, c).verdict];
};

describe('criterion 1: C reaches success with at least 20% fewer tokens than B, without a loss of success', () => {
  it('holds when C uses 90% of B’s tokens or more', () => {
    assert.equal(verdicts(records({ tokens: arm => (arm === 'C' ? 900 : 1000) }))[0], 'holds');
  });
  it('holds when C’s successes are two below B’s, whatever the tokens', () => {
    const success = (arm, task, run) =>
      !(arm === 'C' && run === 1 && ['1-cancelled-stay-hides-contacts', '2-phone-numbers-with-hyphens'].includes(task));
    assert.equal(verdicts(records({ tokens: arm => (arm === 'C' ? 500 : 1000), success }))[0], 'holds');
  });
  it('does not hold when C succeeds as often with 70% of the tokens or less, below 80% on four tasks', () => {
    assert.equal(verdicts(records({ tokens: arm => (arm === 'C' ? 650 : 1000) }))[0], 'does not hold');
  });
  it('is undecided between 70% and 90%, or with successes one apart', () => {
    assert.equal(verdicts(records({ tokens: arm => (arm === 'C' ? 800 : 1000) }))[0], 'undecided');
    const oneApart = (arm, task, run) => !(arm === 'C' && run === 1 && task === '1-cancelled-stay-hides-contacts');
    assert.equal(verdicts(records({ tokens: arm => (arm === 'C' ? 500 : 1000), success: oneApart }))[0], 'undecided');
  });
  it('is undecided at 70% overall when fewer than four tasks are below 80%', () => {
    // Three tasks at 40%, three at 100%: 70% overall, below 80% on three.
    const cheap = tasks.slice(0, 3);
    const result = criterion1(
      keptRuns(
        plan.runs,
        records({ tokens: (arm, task) => (arm === 'C' ? (cheap.includes(task) ? 400 : 1000) : 1000) }),
      ).filter(run => run.arm === 'B'),
      keptRuns(
        plan.runs,
        records({ tokens: (arm, task) => (arm === 'C' ? (cheap.includes(task) ? 400 : 1000) : 1000) }),
      ).filter(run => run.arm === 'C'),
      tasks,
    );
    assert.equal(result.tokenRatio, 0.7);
    assert.equal(result.tasksBelow80, 3);
    assert.equal(result.verdict, 'undecided');
  });
  it('sums the tokens of failed runs too: a failed run is paid for', () => {
    const success = arm => arm !== 'C';
    const result = criterion1(
      keptRuns(plan.runs, records({ success })).filter(run => run.arm === 'B'),
      keptRuns(plan.runs, records({ success })).filter(run => run.arm === 'C'),
      tasks,
    );
    assert.equal(result.c.tokens, 18 * 1000);
    assert.equal(result.c.successes, 0);
  });
});

describe("criterion 2: C's recall of the impact is better than B's", () => {
  it("holds when C's mean recall is B's or lower", () => {
    assert.equal(verdicts(records({ recall: () => 0.6 }))[1], 'holds');
  });
  it("does not hold when each of C's recalls is above the highest of B's", () => {
    assert.equal(
      verdicts(records({ recall: (arm, run) => (arm === 'C' ? 0.8 + run / 100 : 0.4 + run / 10) }))[1],
      'does not hold',
    );
  });
  it('is undecided when C is better on the mean only', () => {
    assert.equal(
      verdicts(
        records({ recall: (arm, run) => (arm === 'C' ? [0.5, 0.9, 0.9][run - 1] : [0.4, 0.6, 0.6][run - 1]) }),
      )[1],
      'undecided',
    );
  });
});

describe('the pilot', () => {
  it('stands when neither holds, is dropped when one holds, and is extended when one is undecided', () => {
    assert.equal(pilotVerdict({ verdict: 'does not hold' }, { verdict: 'does not hold' }), 'stands');
    assert.equal(pilotVerdict({ verdict: 'holds' }, { verdict: 'does not hold' }), 'dropped');
    assert.match(pilotVerdict({ verdict: 'undecided' }, { verdict: 'does not hold' }), /^undecided/);
    assert.match(pilotVerdict({ verdict: 'holds' }, { verdict: 'undecided' }), /one criterion holds/);
  });

  it('is incomplete while a run of B or C has no record, and keeps a void attempt apart', () => {
    const all = records().filter(record => record.id !== 'k4-t3-C-r2');
    all.push({ ...records().find(record => record.id === 'k4-t3-C-r2'), id: 'k4-t3-C-r2', void: true });
    const data = report(plan, all);
    assert.equal(data.verdict, 'incomplete');
    assert.equal(data.runs.recorded, 53);
    assert.equal(data.runs.voided, 1);
  });

  it('refuses a stand-in record: a proof is not a run', () => {
    assert.throws(() => report(plan, [{ ...records()[0], standIn: { patch: 'solution.patch' } }]), /stand-in/);
  });

  it('renders the table per task and arm, and the two criteria', () => {
    const text = markdown(
      report(
        plan,
        records({
          tokens: arm => (arm === 'C' ? 650 : 1000),
          recall: (arm, run) => (arm === 'C' ? 0.9 : 0.3 + run / 10),
        }),
      ),
    );
    assert.match(text, /\*\*The pilot: stands\.\*\*/);
    assert.match(text, /\| 4-review-window-impact \| C \| 3\/3 \| 3 \|/);
    assert.match(text, /Criterion 1 — does not hold/);
    assert.match(text, /Criterion 2 — does not hold/);
  });
});
