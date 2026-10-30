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
const range = (runs, key, digits = 1) => {
  const values = runs.map(run => run[key]);
  return `${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)}`;
};
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const ratio = (a, b) => (mean(a) / mean(b)).toFixed(1);
const short = ['Accounts & notes', 'Pin', 'Tags', 'Share', 'Notify', 'Plan & quota', 'Remind'];

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
  probes: groupedColumns({
    id: 'chart-probes',
    title: 'Files a developer would edit for each change request, mean of each arm’s trees',
    unit: 'files',
    categories: ['Titles up to 200 chars', 'Case-insensitive tags', 'Email a due reminder'],
    series: ['A', 'D', 'P'].map(arm => ({ arm, values: reading.probes[arm] })),
  }),
};

const tables = {
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
<p class="dek">We built a reference implementation of Clean Architecture and Domain-Driven Design whose rules are data, a tool that holds code to them, and a flow that lets several agents build features in parallel. Then we measured whether any of it helps an agent deliver. On our benchmark, it did not.</p>
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
<p><strong>The limits of this answer:</strong> it is one model, one small backlog, in-memory infrastructure, a handful of runs, and graders who are agents.</p>
</div>

<div class="stats">
<div class="stat"><div class="figure">${A.length + D.length + P.length + Cp.length}</div><div class="what">backlog runs graded, every one passing all 7 features</div></div>
<div class="stat"><div class="figure">${ratio(
  A.map(r => r.usd),
  P.map(r => r.usd),
)}×</div><div class="what">what the architecture with tooling cost over a plain project</div></div>
<div class="stat"><div class="figure">0</div><div class="what">differences in reviewed quality the readers could show between arms</div></div>
<div class="stat"><div class="figure">${f8.P.minutes.toFixed(1)} min</div><div class="what">for the six-context feature on the plain tree, against ${f8.A.minutes.toFixed(1)} on the architecture</div></div>
</div>

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
<li>One layered tree answered a missing field with a 400 instead of a refusal.</li>
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
<li><strong>It holds the architecture exactly.</strong> No production import crossed a boundary in any A tree. Without the tool, D's two trees had 0 and 20 refusals, all of the 20 in tests or in the form of an import, none in production code. A strong model, told the rules in prose, kept them nearly as well. The enforcement was real; what it prevented here was small.</li>
<li><strong>Its storms and context map are ceremony a single agent pays for.</strong> In A's transcripts, most of what the tool caught was its own bookkeeping: a storm not marked done, a document to regenerate, a context missing from the map. It caught one substantive thing: a later feature reshaped an earlier command, and the storm check said so.</li>
<li><strong>It made a parallel fan-out work.</strong> Naive parallel agents lost three of seven features to conflicts in one context. With the context as the conflict key, a frozen contract and one integrating writer, every feature landed. On the six-context feature, that fan-out was 21% sooner than one agent on the architecture, at 1.7 times the cost. It was still slower than one agent on a plain project.</li>
<li><strong>Its strategy command</strong> recommends one agent unless a feature is wide and its time matters more than its cost. That rule is right as far as it goes. It should now also say that a small backlog does not need the architecture at all.</li>
</ul>
<p><strong>Our verdict:</strong> on work like this backlog, the tool is relevant as a coordination layer for several agents and as an enforcement layer for teams that have already chosen this architecture. It is not a productivity aid for a single strong agent, and choosing Clean Architecture with DDD for an AI agent's sake is not supported by these results.</p>

<h2>7. How this fits what others found</h2>
<p>The results agree with most of the literature we reviewed (${link('docs/research/related-work.md', 'related work')}):</p>
<ul>
<li>Strong models conform to an architecture given as prose: a hexagonal pilot found 0% forbidden imports for a frontier model, against 80% for a small one.</li>
<li>Stacking Clean Architecture constraints on agents costs correctness points rather than adding them.</li>
<li>Repository instruction files are followed but rarely raise task success.</li>
<li>Multi-agent systems beat a strong single agent only on work that decomposes cleanly.</li>
</ul>
<p>Our contribution is the control: the same backlog, the same model and the same hidden tests, with and without the architecture, and with and without the tool that enforces it.</p>

<h2>8. What this does not show</h2>
<ul>
<li><strong>A long horizon.</strong> Eight features and about four thousand lines are small. Architectural decay grows with code size, and this backlog never got big enough to suffer from it.</li>
<li><strong>Real infrastructure.</strong> Every adapter was in memory. The transactional outbox, optimistic concurrency and retries the architecture provides were never exercised.</li>
<li><strong>Weaker models</strong>, for which architecture documentation helps most.</li>
<li><strong>People.</strong> Agents read the code here, not developers who must maintain it for years.</li>
<li><strong>Independence.</strong> One person designed the architecture, the benchmark and the rubric, and agents graded the trees. The API's asynchronous protocol came from the architecture, which, if anything, favoured it.</li>
<li><strong>Sample size.</strong> Three runs of A and P, two of D, and one per arm on feature 8.</li>
</ul>
<p>Any of these could change the answer. They are the next experiments: a backlog of fifty features, real persistence, a weaker model, and a human maintainer timed on the change probes.</p>

<h2>Reproduce it</h2>
<p>Everything is in the repository:</p>
<ul>
<li>the kits, written before the runs: ${link('docs/evaluations/benchmark', 'benchmark/')};</li>
<li>the drivers and the grader: ${link('.claude/flow', '.claude/flow/')};</li>
<li>the records: ${link('docs/evaluations/2026-10-30-flow-phase-4-pilot.md', 'the pilot')}, ${link('docs/evaluations/2026-10-30-flow-phase-4-campaign.md', 'the campaign')} and ${link('docs/evaluations/2026-10-30-flow-control.md', 'the control')};</li>
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
      'Does Clean Architecture and DDD help an AI coding agent? A controlled benchmark with and without the architecture.',
    body,
  }),
);
process.stdout.write('site/index.html written\n');
