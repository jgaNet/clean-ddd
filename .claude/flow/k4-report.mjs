#!/usr/bin/env node
/**
 * K4's table and §8's two criteria, from the run records run-task.mjs writes (docs/evaluations/knowledge/k4-pilot:
 * README.md, "The rejection criteria" and "When the pilot is undecided"), as data and as Markdown.
 *
 *   node .claude/flow/k4-report.mjs --records <dir> [--plan <plan.yaml>] [--json <file>] [--md <file>]
 *
 * - **The runs read**: for each run of the plan, its record that is not void (a void attempt is counted apart). A
 *   record that says `standIn` (a proof) is refused: it is no run of the pilot.
 * - **The table**, per task and arm: runs recorded, successes, tokens (sum and mean), cost, time, the explore share of
 *   the results' bytes, the files read before the first edit and the unnecessary files (medians), the calls to
 *   `clean-ddd knowledge`; for task 4, the pooled recall, precision and F1 of each run.
 * - **Criterion 1** (C's 18 runs against B's 18; tokens summed over every run, failed ones included):
 *   holds when C's successes are 2 or more below B's, or C's tokens are 90% of B's or more; does not hold when C's
 *   successes are at least B's, C's tokens are 70% of B's or less, and below 80% of B's on at least 4 of the 6 tasks;
 *   undecided otherwise.
 * - **Criterion 2** (task 4, the recall over files and tests pooled): holds when C's mean recall is B's or lower; does
 *   not hold when each of C's 3 recalls is above the highest of B's; undecided otherwise.
 * - **The pilot**: decided when both criteria are, then "dropped" if either holds and "stands" otherwise; "undecided"
 *   (extended as §8 sizes it) when either is undecided; "incomplete" while a run of B or C has no record.
 *
 * Arm A is read beside B and C, as §8's conventional baseline: it decides nothing.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const IMPACT_TASK = '4-review-window-impact';
const ARMS = ['A', 'B', 'C'];

const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => (values.length ? sum(values) / values.length : undefined);
const median = values => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value, digits = 4) => (value === undefined || value === null ? value : Number(value.toFixed(digits)));

/** The records of a directory, every attempt. */
export function readRecords(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

/** For each run of the plan, the record kept (not void), and the void attempts. */
export function keptRuns(planRuns, records) {
  const proofs = records.filter(record => record.standIn);
  if (proofs.length)
    throw new Error(`stand-in records are proofs, not runs: ${proofs.map(record => record.id).join(', ')}`);
  return planRuns.map(run => {
    const attempts = records.filter(record => record.plan === run.id);
    return {
      ...run,
      record: attempts.find(record => !record.void),
      voided: attempts.filter(record => record.void).length,
    };
  });
}

const recallOf = record => record?.score?.pooled?.recall;

/** One cell of the table: the runs of one task in one arm. */
export function cell(runs) {
  const recorded = runs.filter(run => run.record).map(run => run.record);
  const tokens = recorded.map(record => record.agent?.tokens ?? 0);
  const measures = recorded.map(record => record.measures).filter(Boolean);
  return {
    planned: runs.length,
    recorded: recorded.length,
    voided: sum(runs.map(run => run.voided)),
    successes: recorded.filter(record => record.success).length,
    tokens: sum(tokens),
    meanTokens: round(mean(tokens), 0),
    costUsd: round(sum(recorded.map(record => record.agent?.costUsd ?? 0)), 2),
    meanMinutes: round(
      mean(recorded.map(record => (record.agent?.durationMs ?? record.agent?.wallClockMs ?? 0) / 60_000)),
      1,
    ),
    exploreByteShare: round(median(measures.map(each => each.classes?.explore?.byteShare ?? 0)), 3),
    filesReadBeforeFirstEdit: median(measures.map(each => each.filesReadBeforeFirstEdit)),
    unnecessaryFilesRead: median(measures.map(each => each.unnecessaryFilesRead)),
    knowledgeCalls: sum(measures.map(each => each.knowledge?.calls ?? 0)),
    knowledgeBeforeFirstEdit: measures.filter(each => each.knowledge?.calls && each.knowledge.beforeFirstEdit).length,
    ...(runs.some(run => run.task === IMPACT_TASK) && {
      recalls: recorded.map(recallOf),
      precisions: recorded.map(record => record.score?.pooled?.precision),
      f1s: recorded.map(record => record.score?.pooled?.f1),
    }),
  };
}

/** Criterion 1, from B's and C's runs (every task). */
export function criterion1(bRuns, cRuns, tasks) {
  const complete = [...bRuns, ...cRuns].every(run => run.record);
  const tokensOf = runs => sum(runs.filter(run => run.record).map(run => run.record.agent?.tokens ?? 0));
  const successesOf = runs => runs.filter(run => run.record?.success).length;
  const b = { successes: successesOf(bRuns), tokens: tokensOf(bRuns) };
  const c = { successes: successesOf(cRuns), tokens: tokensOf(cRuns) };
  const ratio = b.tokens > 0 ? c.tokens / b.tokens : undefined;
  const perTask = Object.fromEntries(
    tasks.map(task => {
      const bt = tokensOf(bRuns.filter(run => run.task === task));
      const ct = tokensOf(cRuns.filter(run => run.task === task));
      return [task, bt > 0 ? round(ct / bt) : null];
    }),
  );
  const below80 = Object.values(perTask).filter(value => value !== null && value < 0.8).length;
  let verdict;
  if (!complete) verdict = 'incomplete';
  else if (ratio === undefined) verdict = 'undecided';
  else if (c.successes <= b.successes - 2 || ratio >= 0.9) verdict = 'holds';
  else if (c.successes >= b.successes && ratio <= 0.7 && below80 >= 4) verdict = 'does not hold';
  else verdict = 'undecided';
  return { verdict, b, c, tokenRatio: round(ratio), perTask, tasksBelow80: below80 };
}

/** Criterion 2, from B's and C's runs of task 4. */
export function criterion2(bRuns, cRuns) {
  const of = runs => runs.filter(run => run.task === IMPACT_TASK);
  const complete = [...of(bRuns), ...of(cRuns)].every(run => run.record);
  const b = of(bRuns)
    .map(run => recallOf(run.record))
    .filter(value => value !== undefined);
  const c = of(cRuns)
    .map(run => recallOf(run.record))
    .filter(value => value !== undefined);
  const meanB = mean(b);
  const meanC = mean(c);
  let verdict;
  if (!complete) verdict = 'incomplete';
  else if (meanC <= meanB) verdict = 'holds';
  else if (c.length && c.every(value => value > Math.max(...b))) verdict = 'does not hold';
  else verdict = 'undecided';
  return { verdict, b: { recalls: b, mean: round(meanB) }, c: { recalls: c, mean: round(meanC) } };
}

/** The pilot's reading, from the two criteria (README, "When the pilot is undecided"). */
export function pilotVerdict(one, two) {
  const verdicts = [one.verdict, two.verdict];
  if (verdicts.includes('incomplete')) return 'incomplete';
  if (verdicts.includes('undecided'))
    return verdicts.includes('holds')
      ? 'undecided (one criterion holds; the pilot is extended)'
      : 'undecided (the pilot is extended)';
  return verdicts.includes('holds') ? 'dropped' : 'stands';
}

/** The whole report, as data. */
export function report(plan, records) {
  const runs = keptRuns(plan.runs, records);
  const tasks = [...new Set(plan.runs.map(run => run.task))];
  const table = tasks.map(task => ({
    task,
    arms: Object.fromEntries(ARMS.map(arm => [arm, cell(runs.filter(run => run.task === task && run.arm === arm))])),
  }));
  const totals = Object.fromEntries(ARMS.map(arm => [arm, cell(runs.filter(run => run.arm === arm))]));
  const one = criterion1(
    runs.filter(run => run.arm === 'B'),
    runs.filter(run => run.arm === 'C'),
    tasks,
  );
  const two = criterion2(
    runs.filter(run => run.arm === 'B'),
    runs.filter(run => run.arm === 'C'),
  );
  return {
    pilot: plan.pilot,
    runs: {
      planned: runs.length,
      recorded: runs.filter(run => run.record).length,
      voided: sum(runs.map(run => run.voided)),
    },
    spentUsd: round(sum(records.map(record => (record.agent?.costUsd ?? 0) + (record.score?.rules?.costUsd ?? 0))), 2),
    table,
    totals,
    criterion1: one,
    criterion2: two,
    verdict: pilotVerdict(one, two),
  };
}

const show = value => (value === undefined || value === null ? '–' : String(value));
const pct = value => (value === undefined || value === null ? '–' : `${Math.round(value * 100)}%`);

/** The report as Markdown. */
export function markdown(data) {
  const lines = [
    `# ${data.pilot}: the table and the criteria`,
    '',
    `${data.runs.recorded} of ${data.runs.planned} runs recorded (${data.runs.voided} void attempts apart); $${data.spentUsd} spent. **The pilot: ${data.verdict}.**`,
    '',
    '| Task | Arm | Runs | Successes | Tokens (sum) | Tokens (mean) | Cost | Minutes (mean) | Explore share of bytes | Files read before the first edit | Unnecessary files read | `knowledge` calls | Recall (task 4) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of data.table)
    for (const arm of ARMS) {
      const each = row.arms[arm];
      lines.push(
        `| ${row.task} | ${arm} | ${each.recorded}/${each.planned}${each.voided ? ` (+${each.voided} void)` : ''} | ${each.successes} | ${each.tokens} | ${show(each.meanTokens)} | $${each.costUsd} | ${show(each.meanMinutes)} | ${pct(each.exploreByteShare)} | ${show(each.filesReadBeforeFirstEdit)} | ${show(each.unnecessaryFilesRead)} | ${arm === 'C' ? `${each.knowledgeCalls} (${each.knowledgeBeforeFirstEdit} runs before an edit)` : show(each.knowledgeCalls || undefined)} | ${each.recalls ? each.recalls.map(show).join(', ') : '–'} |`,
      );
    }
  for (const arm of ARMS) {
    const each = data.totals[arm];
    lines.push(
      `| **all** | **${arm}** | ${each.recorded}/${each.planned} | ${each.successes} | ${each.tokens} | ${show(each.meanTokens)} | $${each.costUsd} | ${show(each.meanMinutes)} | ${pct(each.exploreByteShare)} | ${show(each.filesReadBeforeFirstEdit)} | ${show(each.unnecessaryFilesRead)} | ${show(each.knowledgeCalls)} | |`,
    );
  }
  const one = data.criterion1;
  const two = data.criterion2;
  lines.push(
    '',
    `**Criterion 1 — ${one.verdict}.** C ${one.c.successes} successes and ${one.c.tokens} tokens; B ${one.b.successes} and ${one.b.tokens}; C's tokens are ${pct(one.tokenRatio)} of B's, below 80% on ${one.tasksBelow80} of ${Object.keys(one.perTask).length} tasks (${Object.entries(
      one.perTask,
    )
      .map(([task, ratio]) => `${task.split('-')[0]}: ${pct(ratio)}`)
      .join(
        ', ',
      )}). Holds when C's successes are 2 or more below B's or its tokens 90% of B's or more; does not hold when its successes are at least B's, its tokens 70% or less, and below 80% on at least 4 tasks.`,
    '',
    `**Criterion 2 — ${two.verdict}.** Task 4's recall (files and tests pooled): C ${two.c.recalls.map(show).join(', ') || '–'} (mean ${show(two.c.mean)}); B ${two.b.recalls.map(show).join(', ') || '–'} (mean ${show(two.b.mean)}). Holds when C's mean is B's or lower; does not hold when each of C's recalls is above the highest of B's.`,
    '',
    'Arm A is read beside B and C as the conventional baseline; it decides nothing.',
  );
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
  const records = option('records');
  if (!records) {
    process.stderr.write('usage: k4-report.mjs --records <dir> [--plan <plan.yaml>] [--json <file>] [--md <file>]\n');
    process.exit(2);
  }
  const here = fileURLToPath(new URL('.', import.meta.url));
  const yaml = createRequire(join(here, '../../package.json'))('js-yaml');
  const plan = yaml.load(
    readFileSync(option('plan') ?? join(here, '../../docs/evaluations/knowledge/k4-pilot/plan.yaml'), 'utf8'),
  );
  const data = report(plan, readRecords(resolve(records)));
  if (option('json')) writeFileSync(option('json'), `${JSON.stringify(data, null, 2)}\n`);
  const text = markdown(data);
  if (option('md')) writeFileSync(option('md'), text);
  process.stdout.write(text);
}
