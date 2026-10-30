#!/usr/bin/env node
/**
 * The article's numbers, read from the records — never typed twice. The logs and grades of the
 * runs are under docs/evaluations/flow/; the figures phase 4's records established for the
 * fan-out (C′) are quoted from those records, with the record named beside them.
 *
 *   node site/collect.mjs   → site/data.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const flow = join(root, 'docs/evaluations/flow');
const read = path => JSON.parse(readFileSync(join(flow, path), 'utf8'));
const lines = path =>
  readFileSync(join(flow, path), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
const FEATURES = [
  'accounts-and-notes',
  'pin-a-note',
  'tag-a-note',
  'share-a-note',
  'notify-on-archive',
  'plan-and-quota',
  'remind-a-note',
];

/**
 * A sequential run, feature by feature: the agent's and the driver's minutes (so a run a restart
 * interrupted counts its active time only), and the cost each feature added to the conversation.
 * A session a restart killed reports nothing; its cost, priced from its transcript's tokens, is
 * given in `lost`.
 */
function sequential(log, { lost = {}, features: ids = FEATURES } = {}) {
  const per = {};
  let previous = 0;
  for (const entry of lines(log)) {
    if (entry.event === 'agent-finished') {
      const feature = (per[entry.feature] ??= { minutes: 0, usd: 0, attempts: 0 });
      feature.minutes += entry.wallClockMs / 60000;
      feature.attempts += 1;
      if (entry.costUsd !== undefined) {
        feature.usd += Math.max(entry.costUsd - previous, 0);
        previous = Math.max(previous, entry.costUsd);
      }
    }
    if (entry.event === 'gate') per[entry.feature].minutes += (entry.wallClockMs ?? 0) / 60000;
  }
  for (const [feature, usd] of Object.entries(lost)) per[feature].usd += usd;
  const features = ids.map(id => ({ feature: id, ...(per[id] ?? { minutes: 0, usd: 0, attempts: 0 }) }));
  return {
    features,
    minutes: features.reduce((sum, f) => sum + f.minutes, 0),
    usd: features.reduce((sum, f) => sum + f.usd, 0),
  };
}

function graded(path) {
  const grade = read(path);
  return {
    checks: grade.M1.verdict,
    accepted: grade.features.filter(f => f.M2.pass).length,
    failing: grade.features.filter(f => !f.M2.pass).map(f => ({ feature: f.feature, failed: f.M2.failed })),
    drift: grade.drift,
  };
}

const metrics = path => (existsSync(join(flow, path)) ? read(path) : undefined);

const A = [
  ['pilot', 'phase4-pilot/a.jsonl', 'phase4-pilot/grade-a.json', 'control/metrics-a-pilot.json'],
  ['run 2', 'phase4-campaign/r2-a.jsonl', 'phase4-campaign/grade-r2-a.json', 'control/metrics-a-r2.json'],
  ['run 3', 'phase4-campaign/r3-a.jsonl', 'phase4-campaign/grade-r3-a.json', 'control/metrics-a-r3.json'],
].map(([run, log, grade, written]) => ({ run, ...sequential(log), ...graded(grade), written: metrics(written) }));

const control = arm =>
  [1, 2, 3]
    .map(n => [
      `run ${n}`,
      `control/c-${arm}${n}.jsonl`,
      `control/grade-${arm}${n}.json`,
      `control/metrics-${arm}${n}.json`,
    ])
    .filter(([, log]) => existsSync(join(flow, log)))
    .map(([run, log, grade, written]) => {
      const lost = existsSync(join(flow, `control/lost-${arm}${run.slice(-1)}.json`))
        ? read(`control/lost-${arm}${run.slice(-1)}.json`)
        : {};
      return {
        run,
        ...sequential(log, { lost }),
        ...(existsSync(join(flow, grade)) ? graded(grade) : {}),
        written: metrics(written),
      };
    });

// The fan-out's backlog runs, as phase 4's records give them (lead time without the pilot's harness defects).
const Cp = [
  { run: 'pilot', minutes: 52, usd: 17.54, accepted: 7, source: 'docs/evaluations/2026-10-30-flow-phase-4-pilot.md' },
  {
    run: 'run 2',
    minutes: 42.6,
    usd: 16.39,
    accepted: 7,
    source: 'docs/evaluations/2026-10-30-flow-phase-4-campaign.md',
  },
  {
    run: 'run 3',
    minutes: 43.6,
    usd: 16.41,
    accepted: 7,
    source: 'docs/evaluations/2026-10-30-flow-phase-4-campaign.md',
  },
];

// Feature 8, from the same project: A and C′ as the campaign's record gives them; P and D from their logs.
const feature8 = {
  A: {
    minutes: 23.8,
    usd: 8.67,
    accepted: true,
    regressions: 0,
    readFailures: 1,
    source: 'docs/evaluations/2026-10-30-flow-phase-4-campaign.md',
  },
  Cp: {
    minutes: 18.9,
    usd: 15.07,
    accepted: true,
    regressions: 0,
    readFailures: 0,
    source: 'docs/evaluations/2026-10-30-flow-phase-4-campaign.md',
  },
};
for (const arm of ['p', 'd']) {
  const log = `control/f8-${arm}.jsonl`;
  if (!existsSync(join(flow, log))) continue;
  let minutes = 0;
  let usd = 0;
  let previous = 0;
  for (const entry of lines(log)) {
    if (entry.event === 'agent-finished') {
      minutes += entry.wallClockMs / 60000;
      if (entry.costUsd !== undefined) {
        usd += Math.max(entry.costUsd - previous, 0);
        previous = Math.max(previous, entry.costUsd);
      }
    }
    if (entry.event === 'gate') minutes += (entry.wallClockMs ?? 0) / 60000;
  }
  const grade = existsSync(join(flow, `control/grade-f8-${arm}.json`))
    ? read(`control/grade-f8-${arm}.json`)
    : undefined;
  const regression = existsSync(join(flow, `control/grade-f8-${arm}-1to7.json`))
    ? read(`control/grade-f8-${arm}-1to7.json`)
    : undefined;
  feature8[arm.toUpperCase()] = {
    minutes,
    usd,
    accepted: grade ? grade.features.every(f => f.M2.pass) : undefined,
    regressions: regression ? regression.features.filter(f => !f.M2.pass).length : undefined,
    written: metrics(`control/metrics-f8-${arm}.json`),
  };
}

/**
 * The four experiments the control could not run (docs/evaluations/2026-10-30-flow-extensions.md):
 * E1 the backlog on a weaker model, E2 feature 8 by one agent given the fan-out's contract, E3 five
 * more features on one finished tree per arm, E4 a change of storage on two trees per arm. A
 * regression E3's amendment 3 explains (a rule feature 11 changes on purpose) is not counted.
 */
const ext = path => `extensions/${path}`;
const regressions = path => {
  if (!existsSync(join(flow, ext(path)))) return undefined;
  const grade = read(ext(path));
  return grade.features.filter(f => !f.M2.pass && grade.amendment3?.feature !== f.feature).length;
};
const run = (id, features) => ({
  id,
  ...sequential(ext(`${id}.jsonl`), { features }),
  ...graded(ext(`grade-${id}.json`)),
  regressions: regressions(`grade-${id}-1to7.json`),
  written: metrics(ext(`metrics-${id}.json`)),
});
const HORIZON = ['comments', 'note-history', 'editors', 'delete-account', 'search'];
const extensions = {
  E1: Object.fromEntries(
    ['a', 'd', 'p'].map(arm => [arm.toUpperCase(), [1, 2].map(n => ({ run: `run ${n}`, ...run(`e1-${arm}${n}`) }))]),
  ),
  E2: [1, 2].map(n => ({ run: `run ${n}`, ...run(`e2-a${n}`, ['team-spaces']) })),
  E3: {
    A: { tree: 'run 3', ...run('e3-a3', HORIZON), before: A[2].features },
    D: { tree: 'run 2', ...run('e3-d2', HORIZON), before: control('d')[1].features },
    P: { tree: 'run 2', ...run('e3-p2', HORIZON), before: control('p')[1].features },
  },
  E4: Object.fromEntries(
    [
      ['A', [2, 3]],
      ['D', [1, 2]],
      ['P', [2, 3]],
    ].map(([arm, ns]) => [arm, ns.map(n => ({ run: `run ${n}`, ...run(`e4-${arm.toLowerCase()}${n}`, ['persist']) }))]),
  ),
  source: 'docs/evaluations/2026-10-30-flow-extensions.md',
};

const data = { features: FEATURES, backlog: { A, P: control('p'), D: control('d'), Cp }, feature8, extensions };
writeFileSync(join(root, 'site/data.json'), `${JSON.stringify(data, null, 2)}\n`);
process.stdout.write(
  `site/data.json: A ${A.length}, P ${data.backlog.P.length}, D ${data.backlog.D.length} runs; feature 8: ${Object.keys(feature8).join(', ')}\n`,
);
