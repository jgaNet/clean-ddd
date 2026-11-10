/** The article in English: the first benchmark, on the notes application. Its prose around the figures build.mjs computes. */
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
<h1>Does Clean Architecture help an AI agent write software?</h1>
<p class="dek">We built a reference implementation of Clean Architecture and Domain-Driven Design whose rules are data, a tool that holds code to them, and a flow that lets several agents build features in parallel. Then we measured whether any of it helps an agent deliver, including where it should help most: a weaker model, a growing codebase, a change of storage. On our benchmark, it did not. It did keep changes in their place, and only the tool kept the structure from drifting. A second, larger benchmark, a lodging marketplace with money and a database migration, said the same for fifty features and showed where the architecture does pay: in what the tests cannot see. Toward a hundred, every tree stopped, each on a rule nobody had written down.</p>
<p class="byline">30 October 2026, updated 4 November 2026 with OpenStay's first fifty features, and 8 November 2026 with its fifth checkpoint, provisional · The <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> experiments · Every number below is read from the records in the repository.</p>
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
<p><strong>Then we tested where the architecture should pay.</strong> Four more experiments, written down before they ran, each took a condition the first answer could not rule out (<a href="${hrefs.extensions}">their article</a>):</p>
<ul>
<li><strong>A weaker model.</strong> The plain project still delivered everything, and the architecture did not help.</li>
<li><strong>Five more features</strong> on grown trees. Every arm kept delivering, and the plain project stayed the soonest.</li>
<li><strong>A move to real storage.</strong> In the architecture trees the change stayed out of the domain, as promised, yet it still took twice as long as in the plain project.</li>
<li><strong>The fan-out's contract given to one agent.</strong> It did not make that agent sooner: the fan-out's speed is its parallelism.</li>
</ul>
<p><strong>Then a larger application, built for longer</strong> (<a href="${hrefs.openstay}">its article</a>)<strong>.</strong> OpenStay, a lodging marketplace, has now taken fifty features in three checkpoints, on three plain trees and three Clean DDD trees, each feature from the smallest model up. Its money goes through a payment provider the tests play, and its storage moved to PostgreSQL without notice. Every tree delivered every feature and passes all 51 hidden test files. The plain trees never needed more than the smallest model; the Clean DDD trees needed a larger one for ${osEscalated('clean')} features in ${osDelivered('clean')}. The plain arm stayed ${cheaper(osJ4)} times cheaper at features 26 to 50. Where the Clean DDD trees were better is what the tests cannot see: the storage change touched no rule there and about twenty rule files in each plain tree, and an independent reading found a double payout possible in one plain tree and no money defect in any Clean DDD tree (<a href="${hrefs.openstay}#reading">the reading</a>). Toward a hundred features, every tree stopped: the plain trees at 66, 73 and 73, the Clean DDD trees at 51, 64 and 64, each where a rule was implicit. Stating two of those rules let the Clean DDD trees through (<a href="${hrefs.openstay}#j5">J5</a>).</p>
<p>In every experiment on the notes application that had a plain arm, the architecture arms took ${span(allTimes)} times the plain project's time and ${span(allCosts)} times its cost. What the architecture did buy is now measured: changes kept in their layer, and, with our tool only, a structure that does not drift as the code grows.</p>
<p><strong>The limits of this answer:</strong> one model family, two applications (twelve features, then fifty), a handful of runs or three trees per arm, and graders who are agents.</p>
</div>

<div class="stats">
<div class="stat"><div class="figure">${graded}</div><div class="what">agent runs graded against hidden tests, in six experiments</div></div>
<div class="stat"><div class="figure">${span(allTimes)}×</div><div class="what">the plain project’s time, taken by the architecture arms in each experiment</div></div>
<div class="stat"><div class="figure">0</div><div class="what">experiments in which the architecture delivered more, sooner or cheaper</div></div>
<div class="stat"><div class="figure">${quotes.sqliteDomainFiles.value}</div><div class="what">domain files the move to SQLite touched in the architecture trees</div></div>
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

<h2>8. What this still does not show</h2>
<ul>
<li><strong>Where the architecture should pay.</strong> A weaker model, a growing codebase, a change of storage, the fan-out's contract given to one agent: each was tested after this benchmark, in <a href="${hrefs.extensions}">four more experiments</a>.</li>
<li><strong>A product's lifetime.</strong> Twelve features is a small application. <a href="${hrefs.openstay}">OpenStay</a> built a lodging marketplace to fifty features and toward a hundred, and is where the architecture's price and its return are read on a larger scale.</li>
<li><strong>People.</strong> Agents read the code here, not developers who must maintain it for years. The locality of a change matters to a reviewer; we did not price it.</li>
<li><strong>Another model family.</strong> One family of models, and in this benchmark its strongest member.</li>
<li><strong>Independence.</strong> One person designed the architecture, the benchmark and the rubric, and agents graded the trees. The API's asynchronous protocol came from the architecture, which, if anything, favoured it.</li>
<li><strong>Sample size.</strong> Two or three runs per arm, and one tree per arm on feature 8.</li>
</ul>

<h2>Reproduce it</h2>
<p>Everything is in the repository:</p>
<ul>
<li>the kits, written before the runs: ${link('docs/evaluations/benchmark', 'benchmark/')};</li>
<li>the drivers and the grader: ${link('.claude/flow', '.claude/flow/')};</li>
<li>the records: ${link('docs/evaluations/2026-10-30-flow-phase-4-pilot.md', 'the pilot')}, ${link('docs/evaluations/2026-10-30-flow-phase-4-campaign.md', 'the campaign')} and ${link('docs/evaluations/2026-10-30-flow-control.md', 'the control')};</li>
<li>the logs, grades and readings: ${link('docs/evaluations/flow', 'flow/')}.</li>
</ul>
<p>The figures on this page are read from those files by ${link('site/collect.mjs', 'site/collect.mjs')}; the summary charts also read the four experiments that followed and quote OpenStay's records.</p>

<footer>clean-ddd · experiments run and written up with an AI assistant. Corrections welcome as issues on the repository.</footer>
`;
};
