/** The article in English: OpenStay's J5b, both trees to a hundred. Its prose around the figures build.mjs computes. */
export const body = ctx => {
  const { O, charts, tables, link, usd, home, list, listLabel, hrefs, other } = ctx;
  const [simple, clean] = O.j5b.trees;
  const total = tree => tree.totalUsd;
  const S = O.j5b.split;
  return `
<header class="title">
<p class="home"><span class="crumbs"><a href="${home}">← CLEAN-DDD</a><span aria-hidden="true">·</span><a href="${list}">${listLabel}</a></span><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
<h1>OpenStay: to a hundred, and what it took</h1>
<p class="dek">No OpenStay tree had reached a hundred features: J5 stopped every one, each where a rule was implicit. J5b ran requests 51 to 100 again on one tree per arm, with every rule J5 had found written down from the first request, the Clean DDD tree split between one agent per context. Both trees reached a hundred. What that took, and what it cost, says more about where AI-written software breaks than about which architecture wins.</p>
<p class="byline">13 November 2026 · The <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> experiments · Every number below is copied from ${link(O.records.j5b, "J5b's record")} and its logs.</p>
</header>

<div class="answer">
<p><strong>The short answer.</strong> Both trees reached a hundred.</p>
<ul>
<li><strong>The plain tree was ${(total(clean) / total(simple)).toLocaleString('en-US', { maximumFractionDigits: 1 })} times cheaper:</strong> ${usd(total(simple).toFixed(2))} against ${usd(total(clean).toFixed(2))}.</li>
<li><strong>It also delivered more requests at the first step:</strong> ${simple.atStep[0]} of 50 against ${clean.atStep[0]}.</li>
<li><strong>Three requests failed at every step, and none failed on a boundary between contexts.</strong> Each failed where a request had set a rule that nothing executable held:
<ul>
<li>the shape of an error;</li>
<li><code>null</code> in a later state;</li>
<li>the time.</li>
</ul>
Stating the rule once, in the tree's guide, let each through.</li>
<li><strong>Splitting the Clean DDD tree's requests between one agent per context was safe, and bought nothing</strong> we could measure.</li>
</ul>
<p>Where the trees stood before is <a href="${hrefs.openstay}#j5">the OpenStay article</a>; the first benchmarks are <a href="${hrefs.control}">the control</a> and <a href="${hrefs.extensions}">four more experiments</a>.</p>
</div>

<h2>Where J5 left it</h2>
<p>${link(O.records.j5, 'J5')} took six trees, three per arm, toward request 100. Every tree stopped, at 51 to 73, each on a seam where a rule the application needed was implicit:</p>
<ul>
<li>an id given again in the next context;</li>
<li>an anonymous command answered <code>202</code>;</li>
<li>a read that lapsed what it read;</li>
<li>a refusal answered <code>503</code>.</li>
</ul>
<p>Stating each rule let the trees through; the furthest of each arm reached 85, and none a hundred. Then the machine and its trees were lost.</p>

<h2>The protocol</h2>
<p>${link(O.records.j5bProtocol, "J5b's protocol")} was written before any run.</p>
<ul>
<li><strong>One tree per arm,</strong> the two that went furthest: simple-3 (a plain TypeScript project) and clean-3 (a project our tool created, held to its gate). Both started from their heads at request 50.</li>
<li><strong>Every rule J5 found, from the first request,</strong> as sections of each tree's guide. The Clean DDD tree also had the kit J5 ended with: identity born once, a relationship between two contexts tested end to end, and the caller refused at once.</li>
<li><strong>The ladder:</strong> each request starts with the smallest model and goes one step up when its hidden tests or its checks fail. A failure is replayed alone before it counts.</li>
<li><strong>One repair per failure.</strong> When a request fails at every step, its failure is judged against the requests. The tree's guide then gains one section stating the rule it broke, never a test's answer, and the request is replayed. The section can be reworded once; a second failure after that stops the tree.</li>
<li><strong>The Clean DDD tree's 14 requests that cross contexts were split:</strong> one agent per context, the upstream one writing the contract first, and an integrator that merges, runs the gate on the result and hands each failure to its owner.</li>
</ul>
<p><strong>What it cannot show:</strong></p>
<ul>
<li>It is in sample: every rule was written after seeing failures on these same requests.</li>
<li>It has one tree per arm.</li>
<li>The Clean DDD tree is both the architecture and the split.</li>
</ul>

<h2 id="hundred">Both trees at a hundred</h2>
${charts.j5bCost}
${tables.j5bTrees}
<p class="note"><code>0</code>, <code>1</code> and <code>2</code> are the step a request was delivered at: the smallest, intermediate and strongest model. <code>R</code> is a request that failed at every step, was repaired once and then delivered. Each tree ran three times: once, then once after each repair.</p>
<ul>
<li><strong>The plain tree finished first and cheaper:</strong>
<ul>
<li>on 12 November, ${simple.hours} hours after it started, at ${usd(total(simple).toFixed(2))};</li>
<li>a request took ${simple.meanMinutes} minutes on average, from the moment it was given to its delivery.</li>
</ul></li>
<li><strong>The Clean DDD tree finished a day later:</strong>
<ul>
<li>at ${usd(total(clean).toFixed(2))}, ${clean.meanMinutes} minutes a request;</li>
<li>at a hundred, ${clean.source.toLocaleString('en-US')} source lines against ${simple.source.toLocaleString('en-US')};</li>
<li>${clean.contexts} contexts kept apart, and ${clean.adrFiles} decision records written along the way.</li>
</ul></li>
<li><strong>The gap is mostly the cost of failing, not of writing.</strong> On a first attempt with the smallest model and one agent, the Clean DDD tree cost ${usd(O.j5b.firstAttempt.clean.usd)} against ${usd(O.j5b.firstAttempt.simple.usd)}, about 35% more. The rest of the gap comes from what follows a failure: an escalation to a larger model, a split, a request failed at every step.</li>
<li><strong>One request took both trees to the strongest model,</strong> on the same hidden test: a calendar import must leave the host's own blocks apart and take nothing from a booking.</li>
</ul>

<h2 id="seams">Three failures, three seams</h2>
<p>As ${link(O.records.j5bRepairs, "J5b's repairs")} record them:</p>
<ul>
<li><strong>clean-3, request 61.</strong>
<ul>
<li><em>The failure:</em> an operation's error read <code>{ type, message }</code>, the shape the reference architecture gives it. The request says <code>"&lt;NAME&gt;"</code>, the rule's name alone.</li>
<li><em>The repair:</em> a section saying that the shape a request gives wins over the code's habit. It held once reworded.</li>
</ul></li>
<li><strong>simple-3, request 73.</strong>
<ul>
<li><em>The failure:</em> a lapsed booking's payment read <code>null</code>, where an earlier request makes it <code>null</code> only for a booking still waiting.</li>
<li><em>The repair:</em> a section on what <code>null</code> means. The first wording failed; the second held.</li>
</ul></li>
<li><strong>clean-3, request 73.</strong>
<ul>
<li><em>The failure:</em> the sweep that lapses unpaid bookings took the machine's time. The rest of the tree took the clock the tests move, so the sweep saw no deadline passed.</li>
<li><em>The repair:</em> a section saying the application has one now. It held at the first wording.</li>
</ul></li>
</ul>
<p><strong>None of the three is a boundary crossed.</strong> In both arms, a request set a rule early; nothing executable held it where it was born; a late request needed it. That is J5's pattern again, at the seams J5's rules had not named.</p>
<p>The architecture took two of them in:</p>
<ul>
<li>an operation's shape when read is now in its contract (${link('docs/adr/0041-an-operation-read-is-in-the-contract.md', 'ADR 41')});</li>
<li>one clock, passed from the wiring, is a rule its linter holds in four languages (${link('docs/adr/0042-an-application-has-one-clock.md', 'ADR 42')}).</li>
</ul>

<h2 id="split">One agent per context: safe, and no faster</h2>
<p>clean-3's ${S.requests} requests that cross contexts were written by one agent per context, with an integrator.</p>
${tables.j5bSplit}
<ul>
<li><strong>It was safe.</strong> The integrator passed ${S.integrated[0]} merged results of ${S.integrated[1]}, in ${S.rounds} rounds.</li>
<li><strong>Where the split failed at every step, one agent with the strongest model failed too,</strong> on the same rule (${S.controls[0]} of ${S.controls[1]} delivered).</li>
<li><strong>It cost more and took longer:</strong> ${usd(S.usd[0])} a request against ${usd(S.usd[1])}, and still ${usd(S.usdWithoutCostliest)} without its three costliest requests. The owners' agents cost ${usd(S.ownersUsd.toFixed(2))}, half the tree's total, for 14 requests of 50.</li>
<li><strong>Half the owners' own verdicts failed</strong> (${S.ownerVerdicts[0]} of ${S.ownerVerdicts[1]}), most of them because the other owner had not yet written its part. Each sent an agent back for a turn that could not fix it.</li>
<li><strong>The ladder's own estimate recommended one agent</strong> on all ${S.estimate.asked} requests it was asked about. These requests were small, under the size where writing in parallel saves more than the contract and the integration cost.</li>
</ul>
<p>Nothing here measures the split on a feature large enough to pay. The ladder now splits only where its estimate recommends it.</p>

<h2 id="bench">The bench</h2>
<p><strong>Grading had grown as long as writing.</strong> Each request's hidden tests and every earlier request's ran one file at a time, 25 to 40 minutes by request 80. A parallel grader runs them in one process, two at a time, and runs a file that fails there again alone. It was validated on both trees before it was used:</p>
${tables.j5bGrading}
<p>clean-3 was graded that way from request 86 on: 10 to 11 minutes a grading, no file run again alone. The plan records the change, and the record reports clean-3's times in two parts.</p>
<p><strong>The machine intervened, and changed no verdict</strong> (${link(O.records.j5bIncidents, 'the incident log')}):</p>
<ul>
<li>${O.j5b.restarts} container restarts, each costing one attempt;</li>
<li>a resumed run that waited ${O.j5b.staleSlotHours} hours for a machine slot its own reused process id held, now fixed in the harness;</li>
<li>a disk down to 1.4 GB;</li>
<li>one escalation on formatting alone, the kind of bookkeeping a tool should do instead of an agent.</li>
</ul>

<h2>What J5b adds</h2>
<ul>
<li><strong>With the rules written down from the start, both arms reach a hundred.</strong> What stopped J5's trees was not the size of the code. It was rules no one had written, and those can be.</li>
<li><strong>The failures that remain are at the specification, in both arms.</strong> A shape, a meaning, a time: things a request decides, that tests and contracts could hold where they are born. More layers would not have held them.</li>
<li><strong>The architecture's cost is mostly the cost of its failures,</strong> not of its first attempts. A first attempt costs about a third more; escalations and splits make the rest.</li>
<li><strong>The architecture's benefits did not show here, because nothing tested them.</strong> Its contexts stayed apart, and no change came unannounced. That is the measure the next campaign makes its first.</li>
</ul>

<h2>What this still does not show</h2>
<ul>
<li><strong>Out of sample.</strong> Every rule was written after seeing these requests fail. The next campaign runs three arms (plain, a lighter Clean DDD profile, and the full one) on an application written before any run, which no rule was tuned on (${link('docs/evaluations/benchmark/three-arms/README.md', 'its protocol')}).</li>
<li><strong>Variance.</strong> One tree per arm; in J5, trees of one arm stopped 13 requests apart.</li>
<li><strong>Whether the structure pays on change.</strong> No change was unannounced in requests 51 to 100.</li>
<li><strong>Independence.</strong> One person designed the architecture, the benchmark and the repairs, with an AI assistant that also ran the bench and, for one night, judged clean-3's second failure as the maintainer had delegated it.</li>
</ul>

<h2>Reproduce it</h2>
<ul>
<li>${link(O.records.j5bProtocol, 'The protocol')}, ${link('docs/evaluations/benchmark/openstay/j5/triage.md', 'the triage rule')} and ${link(O.records.j5bRepairs, 'the repairs')};</li>
<li>${link(O.records.j5b, 'the record')} and ${link(O.records.j5bIncidents, 'the incident log')};</li>
<li>both trees at a hundred, in OpenStay's own repository (<code>j5b/simple-3</code>, <code>j5b/clean-3</code>), with their logs and gradings (<code>j5b-logs/…</code>).</li>
</ul>
<p>The figures on this page are copied from the record into ${link('site/openstay.mjs', 'site/openstay.mjs')}.</p>

<footer>clean-ddd · experiments run and written up with an AI assistant. Corrections welcome as issues on the repository.</footer>
`;
};
