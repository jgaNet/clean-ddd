#!/usr/bin/env node
/**
 * The article, built from site/data.json (node site/collect.mjs writes it from the records):
 *
 *   node site/collect.mjs && node site/build.mjs   → site/index.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARMS, bars, dotRange, groupedColumns, legend, table } from './charts.mjs';
import { page } from './page.mjs';

const here = new URL('.', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(here, 'data.json'), 'utf8'));
const repo = 'https://github.com/jgaNet/clean-ddd/blob/main';
const link = (path, text) => `<a href="${repo}/${path}">${text}</a>`;

const { A, P, D, Cp } = data.backlog;
const f8 = data.feature8;
const X = data.extensions;
const sum = (features, from = 0) => features.slice(from).reduce((total, f) => total + f.minutes, 0);
const perFeature = {
  before: arm => sum(X.E3[arm].before, 1) / (X.E3[arm].before.length - 1),
  after: arm => X.E3[arm].minutes / X.E3[arm].features.length,
};
const growth = arm => Math.round((perFeature.after(arm) / perFeature.before(arm) - 1) * 100);
const horizon = ['Comments', 'History', 'Editors', 'Delete account', 'Search'];
const range = (runs, key, digits = 1) => {
  const values = runs.map(run => run[key]);
  const [low, high] = [Math.min(...values).toFixed(digits), Math.max(...values).toFixed(digits)];
  return low === high ? low : `${low}–${high}`;
};
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const ratio = (a, b) => (mean(a) / mean(b)).toFixed(1);
const short = ['Accounts & notes', 'Pin', 'Tags', 'Share', 'Notify', 'Plan & quota', 'Remind'];
// Each architecture arm's time and cost as a multiple of the plain project's, experiment by experiment.
const experiments = [
  { name: 'Backlog', runs: { A, D, P } },
  { name: 'Backlog, weaker model', runs: X.E1 },
  { name: 'Feature 8', runs: { A: [f8.A], D: [f8.D], P: [f8.P] } },
  { name: 'Features 9–13', runs: { A: [X.E3.A], D: [X.E3.D], P: [X.E3.P] } },
  { name: 'Move to SQLite', runs: X.E4 },
];
const times = (e, arm, key = 'minutes') => mean(e.runs[arm].map(r => r[key])) / mean(e.runs.P.map(r => r[key]));
const graded = 11 + 4 + [X.E1.A, X.E1.D, X.E1.P, X.E2, X.E4.A, X.E4.D, X.E4.P].flat().length + 3;
const allTimes = experiments.flatMap(e => ['A', 'D'].map(arm => times(e, arm)));
const allCosts = experiments.flatMap(e => ['A', 'D'].map(arm => times(e, arm, 'usd')));
const span = values => `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}`;

// The reading, harmonized (docs/evaluations/flow/control/reading/README.md).
const reading = {
  rows: [
    ['A', 'pilot', 7, 6],
    ['A', 'run 2', 6, 6],
    ['A', 'run 3', 6, 5],
    ['D', 'run 1', 7, 7],
    ['D', 'run 2', 6, 6],
    ['P', 'run 1', 6, 5],
    ['P', 'run 2', 6, 5],
    ['P', 'run 3', 7, 6],
  ],
  // Files to edit per change probe, mean over each arm's trees.
  probes: {
    A: [3.1, 5, 10.7],
    D: [3, 3, 12],
    P: [2, 2, 5],
  },
};

const charts = {
  summaryTime: groupedColumns({
    id: 'chart-summary-time',
    title: 'Every experiment: time each architecture arm took, as a multiple of the plain project’s',
    unit: '× P’s time',
    categories: experiments.map(e => e.name),
    series: ['A', 'D'].map(arm => ({ arm, values: experiments.map(e => times(e, arm)) })),
  }),
  summaryCost: groupedColumns({
    id: 'chart-summary-cost',
    title: 'Every experiment: reported cost of each architecture arm, as a multiple of the plain project’s',
    unit: '× P’s cost',
    categories: experiments.map(e => e.name),
    series: ['A', 'D'].map(arm => ({ arm, values: experiments.map(e => times(e, arm, 'usd')) })),
  }),
  lead: dotRange({
    id: 'chart-lead',
    title: 'Time to deliver the seven-feature backlog, per run (minutes of agent activity)',
    unit: 'min',
    rows: [
      { arm: 'A', values: A.map(r => ({ label: `A, ${r.run}`, value: r.minutes })) },
      { arm: 'D', values: D.map(r => ({ label: `D, ${r.run}`, value: r.minutes })) },
      { arm: 'P', values: P.map(r => ({ label: `P, ${r.run}`, value: r.minutes })) },
      { arm: 'Cp', values: Cp.map(r => ({ label: `C′, ${r.run}`, value: r.minutes })) },
    ],
  }),
  cost: dotRange({
    id: 'chart-cost',
    title: 'Reported cost of the seven-feature backlog, per run (US dollars)',
    unit: '',
    prefix: '$',
    digits: 2,
    rows: [
      { arm: 'A', values: A.map(r => ({ label: `A, ${r.run}`, value: r.usd })) },
      { arm: 'D', values: D.map(r => ({ label: `D, ${r.run}`, value: r.usd })) },
      { arm: 'P', values: P.map(r => ({ label: `P, ${r.run}`, value: r.usd })) },
      { arm: 'Cp', values: Cp.map(r => ({ label: `C′, ${r.run}`, value: r.usd })) },
    ],
  }),
  features: groupedColumns({
    id: 'chart-features',
    title: 'Minutes per feature, mean of each arm’s runs',
    unit: 'min',
    categories: short,
    series: ['A', 'D', 'P'].map(arm => ({
      arm,
      values: data.features.map((_, i) => mean(data.backlog[arm].map(run => run.features[i].minutes))),
    })),
  }),
  written: groupedColumns({
    id: 'chart-written',
    title: 'Lines the agent added to deliver the backlog, mean of each arm’s runs',
    unit: 'lines',
    digits: 0,
    categories: ['Source', 'Tests'],
    series: ['A', 'D', 'P'].map(arm => ({
      arm,
      values: [
        mean(data.backlog[arm].map(run => run.written.added.source)),
        mean(data.backlog[arm].map(run => run.written.added.tests)),
      ],
    })),
  }),
  f8time: bars({
    id: 'chart-f8-time',
    title: 'Feature 8, team spaces across six contexts: active minutes (one run per arm)',
    unit: 'min',
    items: [
      { arm: 'A', value: f8.A.minutes, note: '8/8 tests' },
      { arm: 'Cp', value: f8.Cp.minutes, note: '8/8 tests, six slices' },
      { arm: 'D', value: f8.D.minutes, note: '7/8 tests' },
      { arm: 'P', value: f8.P.minutes, note: '8/8 tests' },
    ],
  }),
  f8cost: bars({
    id: 'chart-f8-cost',
    title: 'Feature 8: reported cost (one run per arm)',
    prefix: '$',
    digits: 2,
    items: [
      { arm: 'A', value: f8.A.usd },
      { arm: 'Cp', value: f8.Cp.usd },
      { arm: 'D', value: f8.D.usd },
      { arm: 'P', value: f8.P.usd },
    ],
  }),
  e1time: dotRange({
    id: 'chart-e1-time',
    title: 'E1, a weaker model: time to deliver the seven-feature backlog (minutes), beside the strong model',
    unit: 'min',
    rows: [
      ...['A', 'D', 'P'].map(arm => ({
        arm,
        label: `${arm}, weaker model`,
        values: X.E1[arm].map(r => ({ label: `${arm} weaker, ${r.run} (${r.accepted}/7)`, value: r.minutes })),
      })),
      { arm: 'A', label: 'A, strong model', values: A.map(r => ({ label: `A strong, ${r.run}`, value: r.minutes })) },
      { arm: 'P', label: 'P, strong model', values: P.map(r => ({ label: `P strong, ${r.run}`, value: r.minutes })) },
    ],
  }),
  e1cost: dotRange({
    id: 'chart-e1-cost',
    title: 'E1, a weaker model: reported cost of the backlog (US dollars)',
    prefix: '$',
    digits: 2,
    rows: ['A', 'D', 'P'].map(arm => ({
      arm,
      label: `${arm}, weaker model`,
      values: X.E1[arm].map(r => ({ label: `${arm} weaker, ${r.run}`, value: r.usd })),
    })),
  }),
  e2: bars({
    id: 'chart-e2',
    title: 'E2, feature 8: active minutes of one agent with the fan-out’s whole contract (A+)',
    unit: 'min',
    items: [
      { arm: 'A', label: 'A, request and storm', value: f8.A.minutes, note: 'campaign' },
      ...X.E2.map(r => ({ arm: 'A', label: `A+, ${r.run}`, value: r.minutes, note: '8/8 tests, no regression' })),
      { arm: 'Cp', label: 'C′, six slices', value: f8.Cp.minutes, note: 'campaign' },
    ],
  }),
  e3features: groupedColumns({
    id: 'chart-e3-features',
    title: 'E3, five more features: minutes per feature, one tree per arm',
    unit: 'min',
    categories: horizon,
    series: ['A', 'D', 'P'].map(arm => ({ arm, values: X.E3[arm].features.map(f => f.minutes) })),
  }),
  e3growth: groupedColumns({
    id: 'chart-e3-growth',
    title: 'E3: mean minutes per feature, on the same tree, before and after it grew',
    unit: 'min',
    categories: ['Features 2–7', 'Features 9–13'],
    series: ['A', 'D', 'P'].map(arm => ({ arm, values: [perFeature.before(arm), perFeature.after(arm)] })),
  }),
  e4time: dotRange({
    id: 'chart-e4-time',
    title: 'E4, storage moved to SQLite: active minutes, two trees per arm',
    unit: 'min',
    rows: ['A', 'D', 'P'].map(arm => ({
      arm,
      values: X.E4[arm].map(r => ({ label: `${arm}, ${r.run}`, value: r.minutes })),
    })),
  }),
  e4lines: bars({
    id: 'chart-e4-lines',
    title: 'E4: source lines the storage change added, per tree',
    unit: 'lines',
    digits: 0,
    items: ['A', 'D', 'P'].flatMap(arm =>
      X.E4[arm].map(r => ({
        arm,
        label: `${arm}, ${r.run}`,
        value: r.written.added.source,
        note: `${r.written.filesTouched} files touched`,
      })),
    ),
  }),
  probes: groupedColumns({
    id: 'chart-probes',
    title: 'Files a developer would edit for each change request, mean of each arm’s trees',
    unit: 'files',
    categories: ['Titles up to 200 chars', 'Case-insensitive tags', 'Email a due reminder'],
    series: ['A', 'D', 'P'].map(arm => ({ arm, values: reading.probes[arm] })),
  }),
};

const tables = {
  summary: table(
    'Every experiment, as a multiple of the plain project',
    ['Experiment', 'A, time', 'D, time', 'A, cost', 'D, cost'],
    experiments.map(e => [
      e.name,
      `${times(e, 'A').toFixed(1)}×`,
      `${times(e, 'D').toFixed(1)}×`,
      `${times(e, 'A', 'usd').toFixed(1)}×`,
      `${times(e, 'D', 'usd').toFixed(1)}×`,
    ]),
  ),
  lead: table(
    'Backlog runs',
    ['Arm', 'Run', 'Minutes', 'Cost', 'Features passing'],
    [...A.map(r => ['A', r]), ...D.map(r => ['D', r]), ...P.map(r => ['P', r]), ...Cp.map(r => ['C′', r])].map(
      ([arm, r]) => [arm, r.run, r.minutes.toFixed(1), `$${r.usd.toFixed(2)}`, `${r.accepted}/7`],
    ),
  ),
  features: table(
    'Minutes per feature',
    ['Feature', 'A', 'D', 'P'],
    data.features.map((_, i) => [
      short[i],
      ...['A', 'D', 'P'].map(arm => mean(data.backlog[arm].map(run => run.features[i].minutes)).toFixed(1)),
    ]),
  ),
  written: table(
    'Lines added and test cases',
    ['Arm', 'Run', 'Source lines', 'Test lines', 'Test cases', 'Files touched'],
    [...A.map(r => ['A', r]), ...D.map(r => ['D', r]), ...P.map(r => ['P', r])].map(([arm, r]) => [
      arm,
      r.run,
      r.written.added.source,
      r.written.added.tests,
      r.written.testCases,
      r.written.filesTouched,
    ]),
  ),
  f8: table(
    'Feature 8',
    ['Arm', 'Minutes', 'Cost', 'Feature 8 tests', 'Features 1–7 afterwards'],
    [
      ['A', f8.A.minutes.toFixed(1), `$${f8.A.usd.toFixed(2)}`, '8/8', 'no regression'],
      ['C′', f8.Cp.minutes.toFixed(1), `$${f8.Cp.usd.toFixed(2)}`, '8/8', 'no regression'],
      ['D', f8.D.minutes.toFixed(1), `$${f8.D.usd.toFixed(2)}`, '7/8', 'no regression'],
      ['P', f8.P.minutes.toFixed(1), `$${f8.P.usd.toFixed(2)}`, '8/8', 'no regression'],
    ],
  ),
  e1: table(
    'E1, a weaker model',
    ['Arm', 'Run', 'Minutes', 'Cost', 'Features passing', 'Import refusals'],
    ['A', 'D', 'P'].flatMap(arm =>
      X.E1[arm].map(r => [
        arm,
        r.run,
        r.minutes.toFixed(1),
        `$${r.usd.toFixed(2)}`,
        `${r.accepted}/7`,
        r.drift ? r.drift.refusals : '—',
      ]),
    ),
  ),
  e2: table(
    'E2, feature 8',
    ['Agent', 'Minutes', 'Cost', 'Feature 8 tests', 'Features 1–7 afterwards'],
    [
      ['A, request and storm', f8.A.minutes.toFixed(1), `$${f8.A.usd.toFixed(2)}`, '8/8', 'no regression'],
      ...X.E2.map(r => [`A+, ${r.run}`, r.minutes.toFixed(1), `$${r.usd.toFixed(2)}`, '8/8', 'no regression']),
      ['C′, six slices', f8.Cp.minutes.toFixed(1), `$${f8.Cp.usd.toFixed(2)}`, '8/8', 'no regression'],
    ],
  ),
  e3: table(
    'E3, five more features',
    ['Arm', 'Tree', ...horizon, 'Per feature, 2–7', 'Per feature, 9–13', 'Cost, 9–13', 'Tests passing'],
    ['A', 'D', 'P'].map(arm => [
      arm,
      X.E3[arm].tree,
      ...X.E3[arm].features.map(f => f.minutes.toFixed(1)),
      perFeature.before(arm).toFixed(1),
      perFeature.after(arm).toFixed(1),
      `$${X.E3[arm].usd.toFixed(2)}`,
      `${X.E3[arm].accepted}/5`,
    ]),
  ),
  e4: table(
    'E4, storage in SQLite',
    ['Arm', 'Tree', 'Minutes', 'Cost', 'Hidden test', 'Regressions', 'Source lines added', 'Files touched'],
    ['A', 'D', 'P'].flatMap(arm =>
      X.E4[arm].map(r => [
        arm,
        r.run,
        r.minutes.toFixed(1),
        `$${r.usd.toFixed(2)}`,
        r.accepted ? 'pass' : 'fail',
        r.regressions,
        r.written.added.source,
        r.written.filesTouched,
      ]),
    ),
  ),
  probes: table(
    'Files to edit per change request',
    ['Arm', 'Titles', 'Tags', 'Email'],
    ['A', 'D', 'P'].map(arm => [arm, ...reading.probes[arm].map(v => v.toFixed(1))]),
  ),
};

const readingRows = reading.rows
  .map(
    ([arm, run, lenient, strict]) =>
      `<tr><td>${ARMS[arm].name}</td><td>${run}</td><td>${lenient}/7</td><td>${strict}/7</td></tr>`,
  )
  .join('');

const body = `
<header class="title">
<h1>Does Clean Architecture help an AI agent write software?</h1>
<p class="dek">We built a reference implementation of Clean Architecture and Domain-Driven Design whose rules are data, a tool that holds code to them, and a flow that lets several agents build features in parallel. Then we measured whether any of it helps an agent deliver, including where it should help most: a weaker model, a growing codebase, a change of storage. On our benchmark, it did not. It did keep changes in their place, and only the tool kept the structure from drifting.</p>
<p class="byline">30 October 2026 · The <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> experiments · Every number below is read from the records in the repository.</p>
</header>

<div class="answer">
<p><strong>The short answer.</strong> A coding agent given a plain TypeScript project delivered the same seven features, and passed the same hidden acceptance tests, as an agent given Clean Architecture, DDD and our tooling. It was about ${ratio(
  A.map(r => r.minutes),
  P.map(r => r.minutes),
)} times sooner and ${ratio(
  A.map(r => r.usd),
  P.map(r => r.usd),
)} times cheaper. It also took the largest change of the benchmark sooner and cheaper. Two independent readers found no difference in quality between the trees.</p>
<p><strong>Our tool</strong> does what it claims: it holds code to the architecture exactly, and it made a parallel fan-out of agents safe where naive parallelism failed. On this benchmark neither bought anything a plain single agent did not already deliver.</p>
<p><strong>Then we tested where the architecture should pay.</strong> Four more experiments, written down before they ran, each took a condition the first answer could not rule out:</p>
<ul>
<li><strong>A weaker model.</strong> The plain project still delivered everything, and the architecture did not help.</li>
<li><strong>Five more features</strong> on grown trees. Every arm kept delivering, and the plain project stayed the soonest.</li>
<li><strong>A move to real storage.</strong> In the architecture trees the change stayed out of the domain, as promised, yet it still took twice as long as in the plain project.</li>
<li><strong>The fan-out's contract given to one agent.</strong> It did not make that agent sooner: the fan-out's speed is its parallelism.</li>
</ul>
<p>In every experiment that had a plain arm, the architecture arms took ${span(allTimes)} times the plain project's time and ${span(allCosts)} times its cost. What the architecture did buy is now measured: changes kept in their layer, and, with our tool only, a structure that does not drift as the code grows.</p>
<p><strong>The limits of this answer:</strong> one model family, one application of twelve features, a handful of runs, and graders who are agents.</p>
</div>

<div class="stats">
<div class="stat"><div class="figure">${graded}</div><div class="what">agent runs graded against hidden tests, in six experiments</div></div>
<div class="stat"><div class="figure">${span(allTimes)}×</div><div class="what">the plain project’s time, taken by the architecture arms in each experiment</div></div>
<div class="stat"><div class="figure">0</div><div class="what">experiments in which the architecture delivered more, sooner or cheaper</div></div>
<div class="stat"><div class="figure">0</div><div class="what">domain files the move to SQLite touched in the architecture trees</div></div>
</div>
${charts.summaryTime}
${charts.summaryCost}
${tables.summary}
<p class="note">1 is the plain project. Feature 8 and features 9–13 are one tree per arm; the other experiments are means of two or three runs. Features 9–13 started a fresh conversation, so their cost is not comparable to the backlog’s.</p>

<h2>What we built</h2>
<p><a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> is a reference implementation of Clean Architecture with DDD, in four languages. The architecture is data: layers, who may import whom, and every rule under a stable id live in YAML files. Linters, a conventions check and the documentation are generated from them. Around it we built the tooling an AI agent would use:</p>
<ul>
<li>a <strong>gate</strong>: one verdict on whether a change stayed inside the architecture;</li>
<li><strong>expected event storms</strong>, which hold the code to the model a feature was decided to have;</li>
<li>a <strong>checked context map</strong>, which refuses a coupling between two contexts nobody declared;</li>
<li>a <strong>multi-agent flow</strong>: one agent per bounded context, against a frozen contract, integrated by a single writer.</li>
</ul>
<p>The bet was that an architecture made explicit and enforced would make AI agents better at building software, alone and together. This article is the test of that bet.</p>

<h2>How we measured</h2>
<p>A backlog of seven features of a notes application, from accounts and notes to sharing, notifications, a plan with a quota, and reminders. Each feature was written in product words, with the HTTP API it must answer. For each feature, a black-box acceptance test over HTTP was written <em>before any run</em>, and no agent ever saw it. The same model, through the same headless runner, built the backlog in every arm. Each arm's starting point and instructions differed:</p>
<div class="scroll"><table>
<thead><tr><th>Arm</th><th>Starts from</th><th>Is given</th><th>Is held to</th></tr></thead>
<tbody>
<tr><td>${legend(['A'])}</td><td>a project our tool created: building blocks, contract, linters</td><td>the request and its event storm</td><td>the gate</td></tr>
<tr><td>${legend(['D'])}</td><td>the same project with the tool taken out; the rules as prose</td><td>the request</td><td>typecheck, lint, tests</td></tr>
<tr><td>${legend(['P'])}</td><td>a plain TypeScript/Fastify project, same toolchain</td><td>the request</td><td>typecheck, lint, tests</td></tr>
<tr><td>${legend(['Cp'])}</td><td>as A, one agent per bounded context in parallel</td><td>a frozen contract per slice</td><td>the gate, then one integrator</td></tr>
</tbody></table></div>
<p>Each arm is one agent in one conversation, taking the features in order, except C′. The protocols, predictions and biases were committed before the runs: ${link('docs/evaluations/benchmark/README.md', 'the benchmark')}, ${link('docs/evaluations/benchmark/control/README.md', 'the control')}. One defect in our harness, found after two runs, was fixed and recorded as an amendment before the counted runs. A difference between arms is called a difference only when their ranges of runs do not overlap.</p>

<h2>1. Everyone delivered</h2>
<p>All ${A.length + D.length + P.length + Cp.length} runs passed all seven hidden acceptance tests, on every arm. Correctness, as a client sees it, did not separate the arms at all.</p>

<h2>2. The plain project was sooner and cheaper</h2>
${charts.lead}
${tables.lead}
${charts.cost}
<p class="note">Each dot is a run; the line spans an arm’s runs. C′’s pilot is shown without the minutes our harness’s own defects cost it.</p>
<p>The plain project (P) took ${range(P, 'minutes')} minutes and $${range(P, 'usd', 2)}. The architecture with the tool (A) took ${range(A, 'minutes')} minutes and $${range(A, 'usd', 2)}, and the architecture as prose (D) ${range(D, 'minutes')} minutes and $${range(D, 'usd', 2)}. P's ranges do not overlap A's or D's. A's and D's overlap on time. D's cost sits below A's in both of its runs, but two runs are too few to call that a difference. <strong>The cost is the architecture's, not the tool's.</strong></p>
${charts.features}
${tables.features}
<p>The gap is largest on feature 1, which sets up two bounded contexts in the architecture arms, and it persists on every later feature. Feature 1 is where the plain project had to write its own asynchronous command protocol, which the architecture arms found ready-made. It still finished first.</p>

<h2>3. The architecture wrote four times the code</h2>
${charts.written}
${tables.written}
<p>For the same behaviour, the architecture arms added about four times the source lines and about twice the test lines of the plain project. Aggregates, value objects, ports, adapters, handlers and wiring are the architecture's vocabulary, and an agent pays for every token it reads and writes. That is most of the cost difference.</p>

<h2>4. The large change did not favour the architecture</h2>
<p>Feature 8 adds team spaces to the finished application: members, roles, invitations, seats, search and an audit trail, across six contexts, three of them new. We predicted, before the runs, that if the architecture pays anywhere, it is here. One fresh agent took it on one finished tree of each arm. C′ ran six agents in parallel.</p>
${charts.f8time}
${charts.f8cost}
${tables.f8}
<p>The plain tree took it in ${f8.P.minutes.toFixed(1)} minutes for $${f8.P.usd.toFixed(2)}, changing ${f8.P.written.added.source} source lines and removing ${f8.P.written.removed.source}, with no regression. The architecture arms took two to three times as long.</p>
<p>D failed one of the eight tests. It recorded a space's creator as having "joined", a point the request leaves open and the storm given to A had settled. These are single runs: they show a direction, not a result.</p>

<h2>5. What the tests cannot see</h2>
<p>Black-box tests do not see where a rule lives, whether a password is hashed, or how far a change spreads. Two agents that had not run the benchmark read all eight trees, under neutral names, against a rubric written before the reading. The rubric's seven items apply to any structure:</p>
<ul>
<li>passwords;</li>
<li>the owner taken from the caller;</li>
<li>each rule in one place;</li>
<li>refusals as outcomes;</li>
<li>injectable time;</li>
<li>parts that change apart;</li>
<li>rules under test.</li>
</ul>
<p>The two readers read one item differently, so the table gives both readings.</p>
<div class="scroll"><table>
<thead><tr><th>Arm</th><th>Run</th><th>Items passed (one decision per behaviour)</th><th>Items passed (one function per rule)</th></tr></thead>
<tbody>${readingRows}</tbody></table></div>
<p><strong>No difference in quality was shown, under either reading.</strong> The failures differed in kind:</p>
<ul>
<li>Two layered trees decided one rule in two contexts (a reminder's due check, in notes and again in notifications).</li>
<li>One layered tree answered a missing field with a 400 instead of a refusal. ${link('docs/adr/0032-a-command-body-is-refused-for-its-shape-only.md', 'ADR 32')}, written later, makes that the expected answer: a missing field is the body's shape.</li>
<li>Two plain trees coupled notes and notifications through internal types.</li>
</ul>
<p>The readers also named, for three change requests, every file a developer would edit:</p>
${charts.probes}
${tables.probes}
<p>On this proxy, changes were more local in the plain trees. A layered change spreads across more, smaller files: a domain object, a handler, a port, an adapter, the wiring, and their tests. Finding them meant reading about twice as many lines.</p>
<p>The readers' security findings went both ways:</p>
<ul>
<li>The plain trees' login tokens never expire. The architecture trees sign theirs and expire them.</li>
<li>One architecture tree signs tokens with a fixed fallback secret. The agent copied that pattern from our own reference, which has the same fallback. It is a defect we will fix.</li>
</ul>

<h2>6. Is our tool relevant?</h2>
<p>We separate what it did from what it bought.</p>
<ul>
<li><strong>It holds the architecture exactly, and the gap grows with the code.</strong> No import crossed a boundary in any A tree. Without the tool, D's trees had 0 and 20 refusals after the backlog, none in production code. Five features later, D's grown tree had ${X.E3.D.drift.refusals}. A model told the rules in prose keeps them nearly, not exactly, and the difference accumulates. The weaker model kept them as well as the strong one: 2 and 0 refusals.</li>
<li><strong>It holds what the contract says, no more.</strong> With the weaker model, one A run answered an unknown plan with a 400 from its request schema, where the request wanted a refusal on the operation. Our own guide called a list of allowed values "shape", so the agent followed it and the gate rightly passed it. The gap was in the contract, and ${link('docs/adr/0032-a-command-body-is-refused-for-its-shape-only.md', 'ADR 32')} has since closed it: a command's body is refused for its shape only.</li>
<li><strong>Its storms and context map are ceremony a single agent pays for.</strong> In A's transcripts, most of what the tool caught was its own bookkeeping: a storm not marked done, a document to regenerate, a context missing from the map. It caught one substantive thing: a later feature reshaped an earlier command, and the storm check said so.</li>
<li><strong>It made a parallel fan-out work.</strong> Naive parallel agents lost three of seven features to conflicts in one context. With the context as the conflict key, a frozen contract and one integrating writer, every feature landed. On the six-context feature, that fan-out was 21% sooner than one agent on the architecture, at 1.7 times the cost. Giving one agent the same contract did not make it sooner (E2), so the gain is the parallelism, and the contract is what makes the parallelism safe. It was still slower than one agent on a plain project.</li>
<li><strong>Its strategy command</strong> recommends one agent unless a feature is wide and its time matters more than its cost. That rule is right as far as it goes. It should now also say that a small backlog does not need the architecture at all.</li>
</ul>
<p><strong>Our verdict:</strong> the tool is relevant in two places. It coordinates several agents working in parallel. It enforces the architecture for teams that have already chosen it, and the longer they work, the more it matters. It is not a productivity aid for a single agent, strong or weak. Choosing Clean Architecture with DDD for an AI agent's sake is not supported by these results. Choosing it for what it does to the code — changes kept in their layer — is a choice these results can price: about twice the agent's time.</p>

<h2>7. How this fits what others found</h2>
<p>The results agree with most of the literature we reviewed (${link('docs/research/related-work.md', 'related work')}):</p>
<ul>
<li>Strong models conform to an architecture given as prose: a hexagonal pilot found 0% forbidden imports for a frontier model, against 80% for a small one. Here the smallest model of the family conformed almost as well as the strong one. Its prose-only trees had 2 and 0 refusals, so this gap may depend on the model family more than on size.</li>
<li>Stacking Clean Architecture constraints on agents costs correctness points rather than adding them.</li>
<li>Repository instruction files are followed but rarely raise task success.</li>
<li>Multi-agent systems beat a strong single agent only on work that decomposes cleanly.</li>
</ul>
<p>Our contribution is the control. The same backlog, the same model and the same hidden tests were run with and without the architecture, and with and without the tool that enforces it. Four further tests followed, each on a condition where the architecture is claimed to pay.</p>

<h2>8. Four more experiments</h2>
<p>The control named what it could not show. We wrote four more experiments, with their predictions, before running them (${link('docs/evaluations/benchmark/extensions/README.md', 'the protocol')}). Same driver, same grader, hidden tests no agent saw. Grading found three defects in our own kit, all recorded as amendments and applied to every tree alike.</p>

<h3>E1. A weaker model</h3>
<p>The literature finds that architecture documentation helps weaker models most. We ran the backlog with the smallest model of the same family, two runs per arm.</p>
${charts.e1time}
${charts.e1cost}
${tables.e1}
<p>The plain project delivered 7/7 twice, in ${range(X.E1.P, 'minutes')} minutes for $${range(X.E1.P, 'usd', 2)}. The architecture with the tool delivered 6/7 and 7/7 in ${range(X.E1.A, 'minutes')} minutes. Its one failure is a 400 from the request schema, where the request wanted a 202 and a refused outcome. Our own guide then told the agent to put the list of allowed values in the schema. That was a gap in the architecture, since closed, not a slip of the agent. <strong>The architecture did not help the weaker model deliver</strong>, and the weaker model paid relatively more to read it: about ${ratio(
  X.E1.A.map(r => r.usd),
  X.E1.P.map(r => r.usd),
)} times P's cost, against ${ratio(
  A.map(r => r.usd),
  P.map(r => r.usd),
)} times with the strong model.</p>

<h3>E2. Was the fan-out's speed its contract?</h3>
<p>On feature 8, the fan-out C′ was 21% sooner than one agent. But C′ also had a contract stage: a plan per context, frozen events and read models, and the acceptance test. We gave one agent all of it, from the same commit.</p>
${charts.e2}
${tables.e2}
<p>With the whole contract, one agent took ${range(X.E2, 'minutes')} minutes, as long as without it. <strong>The fan-out's gain was parallelism, not the contract.</strong> The contract is what makes the parallelism safe; on its own it bought nothing measurable.</p>

<h3>E3. Five more features</h3>
<p>Architectural decay is said to grow with code size. One finished tree per arm took five more features that change what exists: comments, a note's history with a restore, editors on a shared note, deleting an account and everything it owns, and search.</p>
${charts.e3features}
${charts.e3growth}
${tables.e3}
<p>Every arm passed every new test, with no regression. Feature 11 changed a rule of feature 4 on purpose, and only the old assertion of that rule failed. P was the soonest on four of five features. Its time per feature grew by ${growth('P')}%, and D's by ${growth('D')}%, while A's moved ${growth('A')}%. That is the shape the hypothesis predicted for the plain tree, but D shows it too, and each arm has one tree. <strong>It is a direction to measure over a longer horizon, not a result.</strong></p>
<p>Without the tool, the structure drifted as the code grew: D's tree went from 20 refusals of the generated import rules in 10 files to ${X.E3.D.drift.refusals} in ${X.E3.D.drift.files}. A's tree cannot drift, since the tool refuses the violation.</p>

<h3>E4. Real storage</h3>
<p>Ports and adapters exist so that storage can change in one place. One fresh agent per tree moved everything to SQLite. A hidden test then restarted the server on the same file and read everything back.</p>
${charts.e4time}
${charts.e4lines}
${tables.e4}
<p>All six trees passed, with no regression. <strong>The prediction on where the change lands held:</strong> no architecture run touched a context's domain or use cases, only adapters, wiring and the building blocks. The plain runs changed every module, since storage is not apart from the rules there. <strong>It did not make the change cheaper.</strong> P took ${range(X.E4.P, 'minutes')} minutes, against ${range(X.E4.A, 'minutes')} for A and ${range(X.E4.D, 'minutes')} for D. Within the architecture arms, the size of the change followed a design choice, a table per aggregate or one document each, and not the arm.</p>

<h2>9. What this still does not show</h2>
<ul>
<li><strong>A product's lifetime.</strong> Twelve features are still small. E3's direction needs several trees and many more features to become a result.</li>
<li><strong>Concurrency and crashes under test.</strong> The outbox and the optimistic concurrency now run on real storage, but no test makes two writers race or kills the server between a commit and a publication.</li>
<li><strong>People.</strong> Agents read the code here, not developers who must maintain it for years. The locality E4 shows matters to a reviewer; we did not price it.</li>
<li><strong>Another model family.</strong> The weaker model was the smallest of the same family.</li>
<li><strong>Independence.</strong> One person designed the architecture, the benchmark and the rubric, and agents graded the trees. The API's asynchronous protocol came from the architecture, which, if anything, favoured it.</li>
<li><strong>Sample size.</strong> Two or three runs per arm, and one tree per arm in E3.</li>
</ul>

<h2>Reproduce it</h2>
<p>Everything is in the repository:</p>
<ul>
<li>the kits, written before the runs: ${link('docs/evaluations/benchmark', 'benchmark/')};</li>
<li>the drivers and the grader: ${link('.claude/flow', '.claude/flow/')};</li>
<li>the records: ${link('docs/evaluations/2026-10-30-flow-phase-4-pilot.md', 'the pilot')}, ${link('docs/evaluations/2026-10-30-flow-phase-4-campaign.md', 'the campaign')}, ${link('docs/evaluations/2026-10-30-flow-control.md', 'the control')} and ${link(X.source, 'the four experiments after it')};</li>
<li>the logs, grades and readings: ${link('docs/evaluations/flow', 'flow/')}.</li>
</ul>
<p>The figures on this page are read from those files by ${link('site/collect.mjs', 'site/collect.mjs')}.</p>

<footer>clean-ddd · experiments run and written up with an AI assistant. Corrections welcome as issues on the repository.</footer>
`;

writeFileSync(
  join(here, 'index.html'),
  page({
    title: 'Architecture and AI agents',
    description:
      'Does Clean Architecture and DDD help an AI coding agent? A controlled benchmark with and without the architecture, on a strong and a weaker model, over a growing codebase and a change of storage.',
    body,
  }),
);
process.stdout.write('site/index.html written\n');
