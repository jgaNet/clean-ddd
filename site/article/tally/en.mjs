/** The article in English: J6 on Tally, three arms out of sample. Its prose around the figures build.mjs computes. */
export const body = ctx => {
  const { T, charts, tables, link, usd, fix, home, list, listLabel, hrefs, other, median } = ctx;
  const counted = arm => T.trees.filter(tree => tree.arm === arm).map(tree => tree.counted);
  const med = arm => median(counted(arm));
  const low = arm => Math.min(...counted(arm));
  const high = arm => Math.max(...counted(arm));
  const perRequest = arm => median(T.arms[arm].perRequest);
  const change = n => T.changes.find(c => c.n === n);
  const pct = count => Math.round((count / 120) * 100);
  return `
<header class="title">
<p class="home"><span class="crumbs"><a href="${home}">← CLEAN-DDD</a><span aria-hidden="true">·</span><a href="${list}">${listLabel}</a></span><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
<h1>Three arms on Tally: what the architecture buys, and what it costs</h1>
<p class="dek">For thirty years we have said that a good architecture costs at first and pays later. We say it; we rarely measure it, because the experiment is out of reach: the same application written several times, in several shapes, by comparable teams, then changed under the same requests. Coding agents make it affordable. J6 ran it: nine agent-built applications, three architectures, forty requests none of them was tuned on, 360 deliveries, ${usd(T.usd.spent.toFixed(2))}.</p>
<p class="byline">19 November 2026 · The <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> experiments · Every number below is copied from ${link(T.records.run, "the run's record")}, read against ${link(T.records.registration, 'the bands registered before it')}.</p>
</header>

<div class="answer">
<p><strong>The short answer.</strong> Every tree delivered the forty requests: ${T.delivered} of ${T.delivered}, in every arm.</p>
<ul>
<li><strong>The architecture did not buy correctness.</strong> The smallest model delivered ${pct(T.arms.S.firstStep)}% of the plain arm's requests at the first step, ${pct(T.arms.L.firstStep)}% of Lite's and ${pct(T.arms.F.firstStep)}% of Full's. A flat tree of 7,000 lines and a Full tree of 20,000 ended in the same place.</li>
<li><strong>It changed the kind of error.</strong> The plain trees failed, systematically, on a rule carried from an earlier request; the structured trees never did. They failed on mechanics instead: a restart, a move of the storage, an audit moved with a merge.</li>
<li><strong>It was paid for, and had not paid back by request 40.</strong> Full cost ${fix(med('F') / med('S'), 1)} times the plain arm per tree (${usd(med('F').toFixed(2))} against ${usd(med('S').toFixed(2))}, medians), and the four changes nobody announced cost it more, not less.</li>
<li><strong>Lite did not find its place.</strong> It converged on Full's shape within a few requests and cost ${Math.round((perRequest('L') / perRequest('F')) * 100)}% of Full per delivered request, with the same errors and more regressions.</li>
</ul>
<p>Where the question came from is <a href="${hrefs.j5b}">OpenStay to a hundred</a>; before it, <a href="${hrefs.openstay}">OpenStay</a>, <a href="${hrefs.extensions}">four more experiments</a> and <a href="${hrefs.control}">the control</a>.</p>
</div>

<h2>The protocol</h2>
<p>${link(T.records.protocol, 'The protocol')} and ${link(T.records.registration, 'its registration')} were written, and the hypotheses with their bands of reading committed, before any run. Nobody could move the finish line after the race.</p>
<ul>
<li><strong>One application, Tally:</strong> a group of people sharing expenses. Groups, a ledger, balances, settlements in cash or through a payment provider, currencies, recurring expenses, receipts, an audit, merging groups, deleting an account. Its domain is in none of the arms' guides, and its requests were written after their rules: no arm was tuned on the exam it sat (${link(T.records.kit, 'the kit')}).</li>
<li><strong>Forty requests,</strong> delivered one at a time in order, each with its API fragment and, for the structured arms, an event storm of the expected model. Each has its hidden tests, written and reviewed before the run, which the agent never sees; they demand concurrency (twenty expenses sent to two servers at once) and durability (a server killed between a commit and a publication) from the first checkpoint. Four requests, 10, 20, 30 and 40, are changes announced to nobody: a remainder split otherwise, leaving with a balance, SQLite to PostgreSQL, a currency precision that changes.</li>
<li><strong>Three arms,</strong> in the clinical sense: three groups, each given one treatment and compared to the others; the treatment is the architecture the agent is handed, and everything else is the same. <strong>Plain</strong>: an ordinary TypeScript project and a guide, held by its own checks. <strong>Full</strong>: an application <code>clean-ddd create</code> made, with its bounded contexts, aggregates, transactional outbox, integration events, owned ports and wiring as data, held by a gate that refuses a delivery outside the contract. <strong>Lite</strong>: Full's boundaries without the ceremony inside a context; use cases as pure functions, and the aggregate, the outbox or the reaction brought in only when a trigger calls for it.</li>
<li><strong>Three trees an arm,</strong> nine in all, three at a time on one machine. Each request is tried first by the smallest model, then the next one up when the hidden tests fail, then the strongest. The same ladder, the same judge, the same budgets, the same kit amendments for every arm.</li>
</ul>

<h2 id="correctness">The architecture did not buy correctness</h2>
<p>The nine trees delivered the forty requests. No tree stopped: the two stops the judge called were defects of the kit, found by replaying the failing test on the tree's own branch, and revoked for every arm.</p>
<p>More striking: the smallest model, with a good kit, delivered almost everything in every tree. A plain tree of about ${T.arms.S.source.toLocaleString('en-US')} source lines and a Full tree of about ${T.arms.F.source.toLocaleString('en-US')} finished at the same place. At this size, structure is not what makes an agent succeed, and that is the first thing the reference must stop implying.</p>

<h2 id="errors">It changed the kind of error</h2>
<p>The failures do not look alike.</p>
<ul>
<li><strong>The plain trees failed on the same requests, for the same reason:</strong> a rule set by an earlier request and forgotten by a later one. Request 18 (a payment that is waiting counts as paid) took two trees of three up to the strongest model; request 23 (a member who left ends the recurring expense) took all three up a step. These are errors of business logic, the kind a client finds in production.</li>
<li><strong>The six Lite and Full trees passed 18 and 23 at the first step.</strong> Their failures are elsewhere, scattered, and about mechanics: durability across a restart (17, 24), the move to PostgreSQL (30), an audit moved with a merge (31). These are errors a test catches.</li>
</ul>
<p>That is the measurable promise J6 brings out, and it could become the reference's central argument: <strong>structure moves the errors from the logic, where a client finds them, to the mechanics, where a test does.</strong> With the reservation that the counts are small and that one reader, the operator, classified them.</p>

<h2 id="cost">It was paid for, and had not paid back by request 40</h2>
${charts.tallyCost}
${tables.tallyTrees}
<p class="note">The cost counted per tree sets aside the attempts a kit defect cancelled; the record gives both. An escalation is a request the smallest model did not deliver, with the model that did.</p>
<ul>
<li><strong>Per tree,</strong> the plain arm's median is ${usd(med('S').toFixed(2))} (${usd(low('S').toFixed(2))} to ${usd(high('S').toFixed(2))}), Lite's ${usd(med('L').toFixed(2))} (${usd(low('L').toFixed(2))} to ${usd(high('L').toFixed(2))}), Full's ${usd(med('F').toFixed(2))} (${usd(low('F').toFixed(2))} to ${usd(high('F').toFixed(2))}).</li>
<li><strong>The gap closes as the application grows, and never inverts.</strong> The plain-to-Full ratio goes from 1 to ${fix(T.arms.F.checkpoints[0] / T.arms.S.checkpoints[0], 0)} at the first checkpoint to 1 to ${fix(T.arms.F.checkpoints[3] / T.arms.S.checkpoints[3], 1)} at the fourth. Full's slopes of cost per request are not flatter: two of its three trees climb faster than the steepest plain tree.</li>
</ul>
${charts.tallyCheckpoints}
<p>The changes nobody announced cut sharper. The registered hypothesis said structure pays at the moment of change. It cost more:</p>
${charts.tallyChange}
${tables.tallyChange}
<ul>
<li><strong>Request 30, the move to PostgreSQL,</strong> cost Full ${usd(change(30).F.toFixed(2))} a tree on average against the plain arm's ${usd(change(30).S.toFixed(2))}; the three plain trees passed it at the first step, Full once at the first step, once at the second and once at the third.</li>
<li><strong>Request 40, the currency precision,</strong> ${usd(change(40).F.toFixed(2))} against ${usd(change(40).S.toFixed(2))}; request 20, ${usd(change(20).F.toFixed(2))} against ${usd(change(20).S.toFixed(2))}.</li>
</ul>
<p>On this kit and at this size, the hypothesis is not confirmed. Either it is wrong, or it needs a larger application or changes more transversal than these. Either way the reference should stop asserting it without that reservation. One more caution: the spread between two trees of one arm (Full from ${usd(low('F').toFixed(2))} to ${usd(high('F').toFixed(2))}) is as wide as the spread between arms. Three trees an arm give a direction, not a verdict.</p>

<h2 id="lite">Lite did not find its place</h2>
<p>Lite was to be a lighter Full, bringing the aggregate and the outbox in only when the pressure calls for them. On Tally the pressure comes at request 5. The triggers fired almost at once, and the three Lite trees converged on Full's shape within a few requests: ${T.arms.L.aggregates[0]} or ${T.arms.L.aggregates[1]} aggregates, as Full, and ${T.arms.L.source[0].toLocaleString('en-US')} to ${T.arms.L.source[1].toLocaleString('en-US')} source lines against Full's ${T.arms.F.source.toLocaleString('en-US')}.</p>
<ul>
<li><strong>It cost ${Math.round((perRequest('L') / perRequest('F')) * 100)}% of Full per delivered request</strong> (${usd(perRequest('L').toFixed(2))} against ${usd(perRequest('F').toFixed(2))}, medians of the trees), with the ranges overlapping, the same signature of errors, and more real regressions (3 against 1). The registered band called Lite supported at 0.6 times Full with no overlap; it reads <em>not supported</em>, and the trend does not run toward it.</li>
<li><strong>It has one quality of its own:</strong> it was the steadiest arm, with no recourse to the strongest model in 120 delivered requests.</li>
</ul>
<p>Two ways remain: drop Lite as a profile and keep it as the way in (start with use cases; the gate says when the aggregate is due), or redefine it with a trigger that fires far later. As it stands, it is two profiles measuring one thing. The decision is the maintainer's, with the record as its evidence.</p>

<h2 id="bench">What the run cost the exam itself</h2>
<p>An honest protocol reports its own defects. The trees found ${T.bench.kitDefects} in the kit: request 18 named an interval only in request 1's prose, and request 35's hidden test called a route that request 36 introduces. Both were diagnosed by replay, amended for every arm, and the attempts set aside carry a <code>revoked</code> mark in the logs. One rule of the harness was amended: an agent reading the text of its own request is not leaking. ${T.bench.restarts} container restarts were absorbed, a slot race fixed, and the disk filled twice with test databases the trees had left behind, ${T.bench.databasesInAnHour.toLocaleString('en-US')} of them in an hour.</p>
<p>All of it for ${usd(T.usd.spent.toFixed(2))} spent, ${usd(T.usd.counted.toFixed(2))} counted, of the ${usd(T.usd.allowed.toLocaleString('en-US'))} the plans allowed.</p>

<h2 id="reference">What came out of it for clean-ddd</h2>
<p>The failures Lite and Full shared pointed at three absences of the skeleton, not three architectural decisions:</p>
<ul>
<li><strong>No test killed and restarted the server:</strong> nothing held the outbox's promise across a crash before request 17.</li>
<li><strong>No PostgreSQL adapter,</strong> nor a unit of work that gives the adapters the transaction's connection and a lock per key for a rule that spans several aggregates. Request 30 cost Full ${usd(change(30).F.toFixed(2))} against the plain arm's ${usd(change(30).S.toFixed(2))}.</li>
<li><strong>No test helper</strong> that creates and drops its own database.</li>
</ul>
<p>The three were added within two days, in the building blocks, with ${link(T.records.adr47, 'a decision record')} that says where they came from.</p>
<p><strong>In one sentence:</strong> clean-ddd keeps its promise as a model, the rules are carried from one request to the next and the errors become mechanical and testable; it does not yet keep its economic one, at forty requests the structure costs more than twice as much and the changes were not cheaper. The next version should assert the first, bound the second, decide Lite, and has already filled the three gaps.</p>

<h2>What this still does not show</h2>
<ul>
<li><strong>One kit, three trees an arm, one model at the first step.</strong> The operator was the only reader of the gradings and the author of the kit.</li>
<li><strong>No chaos suite, no independent reading of maintainability, no measure of Lite's decisions:</strong> those scores were struck for Tally.</li>
<li><strong>One cell of the table.</strong> What J6 establishes holds for a shared-expenses application of forty requests, written by agents on a three-step ladder. It says which cell. The rest of the table waits for other runs.</li>
</ul>

<h2>Reproduce it</h2>
<ul>
<li>${link(T.records.protocol, 'The protocol')}, ${link(T.records.registration, 'the registration')} and ${link(T.records.kit, 'the kit')}: the forty requests, their API fragments, their storms and their hidden tests;</li>
<li>${link(T.records.run, 'the record')}, checkpoint by checkpoint, with every amendment dated;</li>
<li>the nine trees and their logs, in <a href="${T.records.trees}">Tally's own repository</a> (<code>trees/&lt;tree&gt;</code>, <code>logs/&lt;tree&gt;</code>).</li>
</ul>
<p>The figures on this page are copied from the record into ${link('site/tally.mjs', 'site/tally.mjs')}.</p>

<footer>clean-ddd · experiments run and written up with an AI assistant. Corrections welcome as issues on the repository.</footer>
`;
};
