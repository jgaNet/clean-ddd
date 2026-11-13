/** The article in English: OpenStay, fifty features then toward a hundred. Its prose around the figures build.mjs computes. */
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
<h1>OpenStay: fifty features, then toward a hundred</h1>
<p class="dek">Twelve features of a notes application left the main question open: does Clean Architecture start to pay once the code no longer fits in an agent's head? OpenStay is the longer test: a lodging marketplace, with money through a payment provider and a change of database not announced in advance, built feature by feature by agents on three plain trees and three Clean DDD trees, each feature from the smallest model up.</p>
<p class="byline">4 November 2026, updated 8 November 2026 with the fifth checkpoint, and 10 November 2026 closing it · The <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> experiments · Every number below is copied from the checkpoints' records in the repository.</p>
</header>

<div class="answer">
<p><strong>The short answer.</strong> At fifty features, every tree delivered every feature. The plain trees never needed more than the smallest model and stayed ${cheaper(osJ4)} times cheaper; the Clean DDD trees needed a larger model for ${osEscalated('clean')} features of ${osDelivered('clean')}. Where the Clean DDD trees were better is what the tests cannot see: the move to PostgreSQL touched no rule there, an independent reading found a double payout possible in one plain tree and no money defect in any Clean DDD tree, and their contexts stayed apart. Toward a hundred, every tree stopped, each on a rule nobody had written down; stating two of those rules let the Clean DDD trees through.</p>
<p>The first benchmark, on the notes application, is <a href="${hrefs.control}">its own article</a>; the four experiments between the two are <a href="${hrefs.extensions}">another</a>.</p>
</div>

<h2>The protocol</h2>
<p>${link(O.records.protocol, 'OpenStay')} is a lodging marketplace, from ${link(O.records.brief, 'a brief')} with rules about nights, money and permissions, built feature by feature in checkpoints of ten to twenty-five features.</p>
<ul>
<li><strong>Two arms, three trees each.</strong> The simple arm is a plain TypeScript project held to <code>yarn verify</code>. The Clean DDD arm is a project our tool created, held to the gate, with each feature's event storm decided with the maintainer before it runs.</li>
<li><strong>A ladder of models.</strong> Each feature starts with the smallest model of the family, and goes one step up only when its attempt fails: the gate or <code>yarn verify</code>, the feature's hidden tests, or any earlier feature's. A failing hidden test is replayed alone before it counts, so that machine load does not pass for a defect.</li>
<li><strong>The hypothesis, written before any run:</strong> as the trees grow, the simple arm needs the larger models sooner than the Clean DDD arm.</li>
</ul>
<h2 id="fifty">Fifty features, in three checkpoints</h2>
<p>Three checkpoints have run: the ${link(O.records.pilot, 'pilot')} (features 1–10: listings, search, quotes, bookings), ${link(O.records.j3, 'J3')} (11–25, with a change of permissions not announced in advance) and ${link(O.records.j4, 'J4')} (26–50: payments, refunds and payouts through a provider the tests play, webhooks late, twice or out of order, and storage moved to PostgreSQL without notice).</p>
${charts.openstayCost}
${tables.openstay}
<p class="note">Each dot is a tree. "Above the smallest model" counts the escalations that reproduced; the others were machine load or a defect of the kit, each checked and recorded. J3's clean-1 is counted once, as J4's record corrects it.</p>
<p><strong>Everyone delivered, again.</strong> At J4, graded again one tree at a time on a quiet machine, every tree passes all 51 hidden test files, 306 of 306, and every Clean DDD tree passes its gate. The strongest model was never needed in either arm.</p>
<p><strong>The hypothesis is not supported at fifty features, and J4 points the other way.</strong> The simple trees, 8,000 to 9,000 source lines, still fit in an agent's context, and needed nothing above the smallest model in 150 features of 150. The Clean DDD trees, three times larger (${O.source.clean[0].toLocaleString('en-US')}–${O.source.clean[1].toLocaleString('en-US')} lines), needed a larger model for ${osEscalated('clean')} features of ${osDelivered('clean')}, six of them at J4. Each was a defect of the attempt: a storm's command named otherwise, a failed payout reused instead of replaced, a webhook about something unknown refused.</p>
<p><strong>The cost gap narrowed after the pilot, then held.</strong> The simple arm was ${cheaper(O.checkpoints[0])} times cheaper over the first ten features, ${cheaper(O.checkpoints[1])} times over the next fifteen, and ${cheaper(osJ4)} times over J4's twenty-five. At J4, its median attempt cost $0.28–0.43, against $0.82–1.08.</p>
<p><strong>The change not announced in advance landed where the architecture said it would.</strong> All six trees moved to PostgreSQL at the smallest model.</p>
<ul>
<li><strong>In the Clean DDD trees, no aggregate and no rule moved,</strong> of ${O.postgres.clean.files.join(', ')} files changed: the contexts' infrastructure and the building blocks took it. The one Application change was a port's signature, in two trees.</li>
<li><strong>In the simple trees, the rules query the database directly,</strong> and the new driver is asynchronous: about ${O.postgres.simple.ruleFiles.join(', ')} rule files were rewritten, of ${O.postgres.simple.files.join(', ')} changed.</li>
<li><strong>It did not make the change cheaper:</strong> $${lowHigh(O.postgres.simple.usd)} in the simple arm, $${lowHigh(O.postgres.clean.usd)} in the Clean DDD arm. A small model rewrites forty files mechanically for little, and the reader found no rule that changed meaning in any rewrite.</li>
</ul>
<h2 id="reading">What the tests cannot see</h2>
<p><strong>What the tests cannot see is where the arms differ.</strong> Three fresh agents read the six final trees against ${link('docs/evaluations/benchmark/openstay/j4/reading.md', 'a rubric')} written before any tree was read.</p>
<ul>
<li><strong>Money.</strong> One simple tree can pay a host twice: two servers running the payout job at the same moment each write a payout, and nothing refuses the second. It passes every hidden test, which run one server's job at a time. We read the code, and the claim holds. No Clean DDD tree fails an item of money.</li>
<li><strong>Parts apart.</strong> The Clean DDD trees keep their contexts apart, in all three trees; the simple trees partly.</li>
<li><strong>Rules stated once</strong> is no better in either arm. The simple trees repeat what is still refundable and what a payout owes; the Clean DDD trees repeat who may act on a listing, once per context.</li>
<li><strong>The cost of a change, read rather than made.</strong> For three change requests, the readers named every file a developer would edit. A change touches 2 to 3 times as many files in a Clean DDD tree, and takes 2 to 4 times fewer lines to find.</li>
</ul>
<p><strong>What this adds to the first answer.</strong> At fifty features, on precise requests, with one agent writing the whole tree, the architecture still costs more and delivers no more. What it buys is now seen on a larger application: a change of storage kept out of the rules, no defect in the money where a plain tree could pay twice, and contexts that stay apart. A fifth checkpoint took the trees toward a hundred features (<a href="#j5">below</a>). Beside it, eight side experiments were planned, each removing one condition that favours the plain arm: a limited context, vague requests, chaos on the money, a fresh maintainer, injected defects to debug, and pull requests to review, plus a fan-out by context and generated boilerplate for the Clean DDD arm. Only a probe of two developers on one request ran before J5 was closed.</p>

<h2 id="j5">J5: toward a hundred features, every tree stopped</h2>
<p>${link(O.records.j5, 'J5')} took the six trees toward request 100: messaging, reviews, moderation, claims after a stay, proofs of a direct payment, support, then languages, currencies and taxes. A tree now stops at the first feature the strongest model also fails, once ${link('docs/evaluations/benchmark/openstay/j5/triage.md', 'a triage rule')}, written before the failures it judged, has said the failure is the tree's and not the kit's.</p>
${tables.openstayJ5}
<p class="note"><code>0</code>, <code>1</code> and <code>2</code> are the smallest, intermediate and strongest model; <code>F</code> is the triaged failure. Three features failed for the kit or the harness, not the attempt; they were credited, and the cost of their extra steps is set apart, as the record lists.</p>
<p><strong>No tree reached a hundred, and the plain trees went further:</strong> 59 features in all, against 26. Each failure fell on a seam where a rule the application needed was implicit, and the code had already settled it otherwise.</p>
<ul>
<li><strong>The Clean DDD trees failed where two contexts meet,</strong> following the architecture's own rules read literally.
<ul>
<li>Two trees took up a reported message in Moderation under a new id, since "an aggregate generates its own identity", and the client could not find its report.</li>
<li>The third answered an anonymous command <code>202</code>, as the architecture's grammar says, where the product said <code>401</code>.</li>
</ul></li>
<li><strong>The plain trees failed where a shortcut taken early met a rule stated later.</strong>
<ul>
<li>Two trees lapsed an unpaid booking whenever someone read it, from request 30 on, and request 73 said it lapses at the next sweep.</li>
<li>The third refunded nothing where something was left.</li>
</ul></li>
</ul>
<p><strong>Stating the rule let the Clean DDD trees through.</strong> The maintainer kept J5's verdicts and ran copies of the three Clean DDD trees, each from where it stopped, on a kit that says what J5 found:</p>
<ul>
<li>identity is born once;</li>
<li>a relationship two contexts share is tested end to end;</li>
<li>the transport refuses a missing caller at once.</li>
</ul>
${tables.openstayFullplus}
<p class="note">The steps and costs after 8 November were in the lost logs; only the deliveries and the stops are known.</p>
<ul>
<li><strong>Both trees that had stopped at 64 passed it.</strong> They then delivered nearly every request with the smallest model, 73 included, where every plain tree failed.</li>
<li><strong>The third stopped at 61,</strong> on the next seam.</li>
<li><strong>clean-1 stopped at 80,</strong> on the same refusal as the plain tree simple-3. Both answered <code>503</code> for a donation without a provider, a convention each took at request 26; request 1 says a refusal is a <code>4xx</code> or an operation that ends in <code>ERROR</code>.</li>
<li><strong>clean-3 reached 85,</strong> and was last seen at 86.</li>
<li><strong>The wording mattered.</strong> With the gate's message "find it by the id the upstream answered", the smallest model kept the wrong id. With "the id that very request answered: a report of a message is found by the report's id", it delivered.</li>
<li><strong>What became of the three rules.</strong> Identity born once and the relationship test are now ${link('docs/adr/0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md', 'ADR 33')}. Refusing a missing caller at once changes what every server answers, so it is ${link('docs/rfc/0003-who-reaches-a-command.md', 'an RFC')} first.</li>
</ul>
<p><strong>A rule given late reaches new code only.</strong> One sentence was added to two plain trees' guide at request 72: "a read never changes what is stored".</p>
<ul>
<li>With the smaller models it changed nothing: they applied it to the code they wrote, and left the reads that lapse in place.</li>
<li>Only the strongest model carried it to the code already there, and one of the two trees still left an earlier test of its own behind.</li>
<li>The sentence goes into the plain arm's starting guide for the next campaign.</li>
</ul>
<p>The two trees then went on as a separate arm, Simple+:</p>
<ul>
<li><strong>simple-3 delivered 74 to 79 and stopped at 80,</strong> on the same <code>503</code> as Full+ clean-1.</li>
<li><strong>simple-1 failed 73 again.</strong> The sentence said what a read must not do, not that a read still shows what time has changed.</li>
<li><strong>simple-2 was not continued.</strong></li>
</ul>
<p><strong>One repair per triaged failure.</strong> The two follow-on arms had not been treated alike: three corrections for Full+, one sentence for Simple+. From 9 November, every tree of both arms was repaired once after a triaged failure (${link('docs/evaluations/benchmark/openstay/j5/repairs.md', 'the rule and its corrections')}):</p>
<ul>
<li>the earlier request whose rule the tree broke is named;</li>
<li>a section of the tree's guide states that rule for every feature, never a test's answer;</li>
<li>the tree replays the request it failed, and the replay is the correction's probe.</li>
</ul>
<p>What it gave:</p>
<ul>
<li><strong>Every correction tried held on its first wording:</strong> the refusal on both arms, time and reads on the plain arm.</li>
<li><strong>The furthest tree of each arm reached 85:</strong> simple-3 after its repair, Full+ clean-3 without needing one. simple-3 replayed 80 with the smallest model and reached 85; clean-1 replayed 80 and was last seen on 84; simple-1 replayed 73 and was held at 77 for a slot.</li>
<li><strong>None reached a hundred, and two repairs never ran,</strong> those of Full+ clean-2 and simple-2.</li>
<li><strong>Each failure repaired was a rule a request had decided and the tree had not kept,</strong> in both arms. Saying the rule once fixed it, not a larger model.</li>
</ul>
<p><strong>Two developers on one request.</strong> Request 64 was split between two agents, one per owner of the contexts it crosses (${link('docs/evaluations/benchmark/openstay/j5/side/two-developers/results.md', 'the results')}). It was delivered:</p>
<ul>
<li>${O.j5.twoDevelopers.old[0]} of ${O.j5.twoDevelopers.old[1]} times on the old kit;</li>
<li>${O.j5.twoDevelopers.fullplus[0]} of ${O.j5.twoDevelopers.fullplus[1]} on the new one;</li>
<li>${O.j5.twoDevelopers.integrator[0]} of ${O.j5.twoDevelopers.integrator[1]} with an integrator, who runs the gate on the merged code and hands each failure to its owner.</li>
</ul>
<p>The rule made the seam visible every time. Without the integrator, the request that would have fixed it reached an agent whose session had ended.</p>
<p><strong>What J5 adds.</strong> On a larger application, the question is no longer which arm needs a larger model, but which one stops, and where. Both stop where a rule was never written, and at two seams the architecture's rules, read literally, chose the wrong answer. Written down, they let the smallest model through.</p>
<p><strong>J5 is closed on what is known.</strong> On 10 November the session's machine was replaced, and the trees and their logs went with it (${link('docs/evaluations/benchmark/openstay/j5/lost-on-10-november.md', 'what was lost')}).</p>
<ul>
<li>The results up to 8 November are read from the logs.</li>
<li>What came after comes from the session's notes, and cannot be checked.</li>
<li>The follow-on arms did not reach 100; the second grading, the reading and the other side experiments did not run.</li>
</ul>
<p><strong>J5b took one tree of each arm to a hundred,</strong> with every rule J5 found written down from the first request: <a href="${hrefs.j5b}">the next article</a>.</p>

<h2>What this still does not show</h2>
<ul>
<li><strong>A product's lifetime.</strong> No OpenStay tree reached a hundred features in J5, on the kit as registered or in the follow-on arms; the furthest reached 85. J5b took one tree per arm there, in sample (<a href="${hrefs.j5b}">its article</a>). J5 closed on what is known after the machine and its trees were lost, and what came after 8 November comes from the session's notes and cannot be checked.</li>
<li><strong>Concurrency and crashes under test.</strong> OpenStay's hidden tests now kill servers, run two at once and replay webhooks, and still missed a double payout a reader found. The chaos suite planned at the fifth checkpoint, money under failure on every final tree, did not run.</li>
<li><strong>People.</strong> Agents read the code here, not developers who must maintain it for years. A change touches more files in a Clean DDD tree and takes fewer lines to find; what that costs a reviewer, we did not price.</li>
<li><strong>Independence.</strong> One person designed the architecture, the benchmark and the rubric, and agents graded the trees.</li>
<li><strong>Sample size.</strong> Three trees per arm.</li>
</ul>

<h2>Reproduce it</h2>
<p>Everything is in the repository:</p>
<ul>
<li>${link(O.records.protocol, 'the protocol and the kits')}, written before the runs, and ${link('docs/evaluations/benchmark/openstay/j5/triage.md', "J5's triage rule")};</li>
<li>the records of ${link(O.records.pilot, 'the pilot')}, ${link(O.records.j3, 'J3')}, ${link(O.records.j4, 'J4')} and ${link(O.records.j5, 'J5')}, and ${link('docs/evaluations/benchmark/openstay/j4/reading.md', "the reading's rubric")};</li>
<li>the six trees up to J4, in their own repository, one branch per tree and checkpoint (J5's trees were lost).</li>
</ul>
<p>The figures on this page are copied from the records' tables into ${link('site/openstay.mjs', 'site/openstay.mjs')}, each with the record it comes from.</p>

<footer>clean-ddd · experiments run and written up with an AI assistant. Corrections welcome as issues on the repository.</footer>
`;
};
