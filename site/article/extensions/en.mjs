/** The article in English: the four experiments after it. Its prose around the figures build.mjs computes. */
export const body = ctx => {
  const {
    A,
    D,
    P,
    Cp,
    f8,
    X,
    O,
    charts,
    tables,
    legend,
    link,
    ratio,
    range,
    span,
    graded,
    quotes,
    allTimes,
    allCosts,
    osEscalated,
    osDelivered,
    cheaper,
    osJ4,
    lowHigh,
    growth,
    readingRows,
    home,
    list,
    listLabel,
    hrefs,
    other,
  } = ctx;
  return `
<header class="title">
<p class="home"><span class="crumbs"><a href="${home}">← CLEAN-DDD</a><span aria-hidden="true">·</span><a href="${list}">${listLabel}</a></span><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
<h1>Where the architecture should pay: four more experiments</h1>
<p class="dek">The first benchmark said that Clean Architecture and DDD did not help an AI agent deliver a small application, and named what it could not show. Four experiments, each written down with its prediction before it ran, took one condition the architecture is claimed to pay under: a weaker model, a growing codebase, a change of storage, and the fan-out's contract given to a single agent.</p>
<p class="byline">30 October 2026 · The <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> experiments · Every number below is read from the records in the repository.</p>
</header>

<div class="answer">
<p><strong>The short answer.</strong> None of the four conditions turned the first answer around. The plain project still delivered everything with a weaker model, stayed the soonest as the trees grew, and took the move to real storage in half the architecture's time. The fan-out's contract, given to one agent, did not make it sooner: the fan-out's gain is its parallelism. What the architecture did buy is measured here: the storage change stayed out of the domain, and only the tool kept the structure from drifting.</p>
<p>The arms, the hidden tests and the grader are those of <a href="${hrefs.control}">the first benchmark</a>: A is the architecture with our tool, D the architecture as prose, P a plain TypeScript project, C′ the fan-out by context.</p>
</div>

<h2>The protocol</h2>
<p><a href="${hrefs.control}">The control</a> named what it could not show. We wrote four more experiments, with their predictions, before running them (${link('docs/evaluations/benchmark/extensions/README.md', 'the protocol')}). Same driver, same grader, hidden tests no agent saw. Grading found three defects in our own kit, all recorded as amendments and applied to every tree alike.</p>

<h2>E1. A weaker model</h2>
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

<h2>E2. Was the fan-out's speed its contract?</h2>
<p>On feature 8, the fan-out C′ was 21% sooner than one agent. But C′ also had a contract stage: a plan per context, frozen events and read models, and the acceptance test. We gave one agent all of it, from the same commit.</p>
${charts.e2}
${tables.e2}
<p>With the whole contract, one agent took ${range(X.E2, 'minutes')} minutes, as long as without it. <strong>The fan-out's gain was parallelism, not the contract.</strong> The contract is what makes the parallelism safe; on its own it bought nothing measurable.</p>

<h2>E3. Five more features</h2>
<p>Architectural decay is said to grow with code size. One finished tree per arm took five more features that change what exists: comments, a note's history with a restore, editors on a shared note, deleting an account and everything it owns, and search.</p>
${charts.e3features}
${charts.e3growth}
${tables.e3}
<p>Every arm passed every new test, with no regression. Feature 11 changed a rule of feature 4 on purpose, and only the old assertion of that rule failed. P was the soonest on four of five features. Its time per feature grew by ${growth('P')}%, and D's by ${growth('D')}%, while A's moved ${growth('A')}%. That is the shape the hypothesis predicted for the plain tree, but D shows it too, and each arm has one tree. <strong>It is a direction to measure over a longer horizon, not a result.</strong></p>
<p>Without the tool, the structure drifted as the code grew: D's tree went from 20 refusals of the generated import rules in 10 files to ${X.E3.D.drift.refusals} in ${X.E3.D.drift.files}. A's tree cannot drift, since the tool refuses the violation.</p>

<h2>E4. Real storage</h2>
<p>Ports and adapters exist so that storage can change in one place. One fresh agent per tree moved everything to SQLite. A hidden test then restarted the server on the same file and read everything back.</p>
${charts.e4time}
${charts.e4lines}
${tables.e4}
<p>All six trees passed, with no regression. <strong>The prediction on where the change lands held:</strong> no architecture run touched a context's domain or use cases, only adapters, wiring and the building blocks. The plain runs changed every module, since storage is not apart from the rules there. <strong>It did not make the change cheaper.</strong> P took ${range(X.E4.P, 'minutes')} minutes, against ${range(X.E4.A, 'minutes')} for A and ${range(X.E4.D, 'minutes')} for D. Within the architecture arms, the size of the change followed a design choice, a table per aggregate or one document each, and not the arm.</p>

<h2>What the four add to the first answer</h2>
<p>On a small application, the architecture costs more under every condition where it was claimed to pay, and delivers no more. Two of its promises hold and are now measured: a change of storage stays out of the domain, and the structure does not drift when the tool holds it. Whether that return grows with the code is what <a href="${hrefs.openstay}">OpenStay</a>, a larger application built for longer, was then run to see.</p>

<h2>What this still does not show</h2>
<ul>
<li><strong>A longer horizon.</strong> Five more features on one tree per arm show a direction, not a result; OpenStay takes the same question past fifty features.</li>
<li><strong>Another model family.</strong> The weaker model was the smallest of the same family.</li>
<li><strong>Sample size.</strong> Two runs per arm in E1 and E4, one tree per arm in E3, two in E2.</li>
</ul>

<h2>Reproduce it</h2>
<p>Everything is in the repository:</p>
<ul>
<li>the protocol and its predictions, written before the runs: ${link('docs/evaluations/benchmark/extensions/README.md', 'extensions/')};</li>
<li>the drivers and the grader: ${link('.claude/flow', '.claude/flow/')};</li>
<li>the record: ${link(X.source, 'the four experiments')};</li>
<li>the logs, grades and readings: ${link('docs/evaluations/flow/extensions', 'flow/extensions/')}.</li>
</ul>
<p>The figures on this page are read from those files by ${link('site/collect.mjs', 'site/collect.mjs')}.</p>

<footer>clean-ddd · experiments run and written up with an AI assistant. Corrections welcome as issues on the repository.</footer>
`;
};
