# J6's registration: Simple, Lite and Full on Tally, after the calibration

**Status: proposed, for the maintainer's review.** Nothing of J6 has run: no agent, no ladder. The maintainer approves
this registration, or changes it, before any run; until then the trees, the plans and the servers below are prepared
and idle. Five findings below ([what blocks a run](#what-blocks-a-run)) need a decision before the first ladder
starts, and three of them need a change outside this file (the flow, the kit), which the operator did not make.

Prepared on 14 November by the operator, with no agent, following the maintainer's decisions of 13 and 14 November
([the protocol](README.md), [the kit's last section](app/README.md#decided-by-the-maintainer-before-registration-14-november)).

## What is registered

| | Value |
| --- | --- |
| The repository | `924901cce8cd12ffa418cec20928eeb910aeac23` (*The tooling's version follows the repository's tags: 3.2.0*); the ladders run from a checkout of it: [`run-ladder.mjs`](../../../../.claude/flow/run-ladder.mjs), [`grade.mjs`](../../../../.claude/flow/grade.mjs), [`machine.mjs`](../../../../.claude/flow/machine.mjs), [`resume.mjs`](../../../../.claude/flow/resume.mjs) |
| The package | `/var/tmp/j6/clean-ddd-3.2.0.tgz`, packed from `924901c`, sha256 `72477f7314e06c4894563de281f290d891911258c6debe93bafe0a433269708e` (checked, not repacked); vendored in every Lite and Full tree as `vendor/clean-ddd-3.2.0.tgz` (`"clean-ddd": "file:vendor/clean-ddd-3.2.0.tgz"`: the version is not on the npm registry) and given to the grader as `tooling` |
| The kit, Tally | [`app/`](app/README.md) at `924901c`: git tree `2814e037f9fd8887d16bf53ad6e38929a1fc3266`; files sha256 `c507d84107a1f1b4b8014d763166a1d89a138fde032f9471b781f44deb539ff7` |
| The kit, the calibration | [`calibration/`](calibration/README.md) at `924901c`: git tree `e3f07127a453323a0c0aaec0d17d24c807d460ae`; files sha256 `0ed50242d9dc530c9f5d4c42fd42aa0edc855dc3bfec3afba2a350f1cc3029a4` |
| Lite's profile data (RFC 0002) | sha256 `1acf5a1ae779acced056dbc8709a3a10bc89d370c32aef9edfe2383f4dfd128f`, at `924901c` (after ADR 43, as RFC 0005's D1 asks) |
| Full's profile data | sha256 `cdf42672de0a27b3de077892dd7b05776ed18fcb62643c8651878f650ebdef31` |
| The floor every profile keeps | sha256 `cf1e2022e14a7964a463c3f38a382cc83e2dff7a35414c3fcde1681eb5bb5019` |
| The simple arm's guide | `CLAUDE.md` of the plain trees: Tally sha256 `32a34a2a135d047a3126972ad935c38d2aa00ba236ff351534478ea040ce6df3`, the calibration's `77ef79452c400d5e8f4a6071b788d077d48e02ce9eb30039c0b7e2ef6a43154d` (they differ by the application's name only) |

**How each hash is taken,** so that anyone recomputes it ([`hashes.mjs`](#where-everything-is), run with Node 24):
- *a kit's files:* every file under the directory, its path relative to it, sorted; one line `<sha256 of the file>  <path>` each; the sha256 of those lines. The git tree id is `git rev-parse 924901c:docs/evaluations/benchmark/three-arms/<kit>`. The copies the plans read, `/home/user/j6/kit/{app,calibration}` (`git archive 924901c`), give the same file hash.
- *a profile's data:* the sha256 of the canonical JSON (keys sorted at every depth) of `{ contract: profiles.<profile> of conventions/architecture.yaml, binding: profiles_held.<profile> of conventions/typescript.yaml }` at `924901c`; the floor, of `floor` in `conventions/architecture.yaml`. Read from the starting trees, Full's is the same (`cdf42672…`); Lite's is `29d19f87cacbefa10007430af8300b3e494708c8ce3621879aeb5e889f482ac8`, since `create --profile lite` writes the binding's Lite checklists without the rule register's line (no `--rules`) and without the reference's `shows` and `create` entries; the contract's Lite profile is the same in both.

## The split's estimate (step 1)

Correction 14 of [the next campaign](../openstay/j5/next-campaign.md) registers features above the estimate's
break-even; the maintainer decided (14 November, 5) that the requests registered split are those the estimate puts above
it. The estimate is `clean-ddd strategy` ([`tools/src/strategy.ts`](../../../../tools/src/strategy.ts), what the ladder
asks with `fanOut.split: recommended`), run with the 3.2.0 package on the four [S] storms, from a copy of `full-1` with
the declarations of their checkpoint applied (request 13: checkpoint 2's session; 31, 32 and 35: checkpoints 2 and 4's,
and request 20's relationship), with both priorities:

| Request | The storm's contexts (stickies) | Outside the largest | Break-even | One agent | Fan-out | Recommended (`time` and `cost`) |
| --- | --- | --- | --- | --- | --- | --- |
| 13 Pay through the provider | Settlements (2) | 0 | none: one context | 3.5 min | — | one agent |
| 31 Merge two groups | Groups (2), Ledger (1), Settlements (1) | 2 | 8.6 | 4.5 min | 7.8 min | one agent |
| 32 Net debts across groups | Settlements (2) | 0 | none: one context | 3.5 min | — | one agent |
| 35 Delete an account | Groups (1) | 0 | none: one context | 3 min | — | one agent |

**None is above the break-even, so none is registered split.** The tool ran on every storm; none was refused. Three of
the four storms list one context: their other contexts are crossed by the links (owned ports), which the estimate does
not count, and which the ladder does not split on either (`ownersOf` reads the storm's `contexts`), so not even
`split: always` could split 13, 32 or 35. Request 31 has two stickies outside its largest context, against a
break-even of 8.6 (the contract stage counted at 0.6 minutes per context; with none at all, it would be 5). Run on all
forty storms, the estimate recommends one agent everywhere: 36 storms list one context, and the most any has outside
its largest is 2 (31), against 7.4 or more. **The brief's [S] marks are not borne out by the storms as written, and
correction 14's measure cannot be made on Tally** (a decision below).

## The starting trees (step 3)

Each tree is a git repository of its own, with no remote, on `main`, made by
[`make-tree.sh`](#where-everything-is) with fixed authors and dates, so that making it again gives the same commit; the
three trees of an arm were each made, not copied, and are the same commit.

| Arm | How it is made | Trees | Starting commit (`main`) | Its own checks |
| --- | --- | --- | --- | --- |
| Simple | OpenStay's `created: plain` (`08b94b0`, where `trees/simple-w` starts), named `tally` (`package.json`, the guide's title, as the kit's rehearsal witness `tally-w` was); then the guide's two sentences of J5's corrections 4 and 3: *A read never changes what is stored…* (correction 4's text) and *When a request fixes what the API answers, its shape wins over the code's own habit…* (R3's first sentence, without its `"<NAME>"`, which Tally's request 1 does not say) | `plain-1`, `plain-2`, `plain-3` | `47b6ebe87263f29b63f6e8f2c83f8e9541dcbb28` (on `30bc83e`, *created: plain*) | `yarn verify`: pass, ×3 |
| Lite | `clean-ddd create --name tally --profile lite` (3.2.0), then the strategic session of checkpoint 1 | `lite-1`, `lite-2`, `lite-3` | `02aa404f01460d0f290515947b4d206b36308888` (on `9a1e71c`, *created: lite*) | the six of its guide (`check:conventions`, `format:check`, `lint`, `typecheck`, `test:units`, `test:e2e`) pass, ×3; the gate (`gate --base HEAD --mode architecture`) on the same commit: pass |
| Full | `clean-ddd create --name tally` (3.2.0), then the same session | `full-1`, `full-2`, `full-3` | `86d20e8aa618d5488d4835dab2999f922003801b` (on `6a67e5d`, *created: full*) | the same: pass, ×3 |

**The session's commit** (Lite and Full alike, [`declare.py`](#where-everything-is) with `tally-cp1.json`): Groups and
Ledger declared in the binding and described in the domain map (purpose, subdomain, language), each an empty
`module.local.ts` registered in the composition root (the conventions check refuses a declared context with no folder),
the two relationships of [checkpoint 1's session](app/storms/README.md#the-strategic-session-the-contexts-and-how-they-relate)
declared `planned` (Groups → Ledger and Ledger → Groups, owned ports), and ADR 1, which records T1 to T5. Nothing else:
no `--rules`, no rule register, no knowledge query in the guide, no file of the kit. On Full, the ten storms of
checkpoint 1 are *legal against the contract and the map; not in the code yet*; on Lite, see
[what blocks a run](#what-blocks-a-run), 2.

**The later sessions are prepared, not applied:** `tally-cp2.json` (Settlements and Notifications, five relationships,
ADR 2) and `tally-cp4.json` (Groups → Ledger and Groups → Settlements over an integration event, its ADR), as
[the storms' README](app/storms/README.md) decides them; checkpoint 3 declares nothing, and request 20's relationship is
the arm's, with its storm. Applied to copies of `full-1` and `lite-1` (request 20's relationship added as its storm would),
each passes the conventions check, and the forty storms are legal on Full, with request 20's refused before its
relationship, as the storms' README says.

**The calibration's trees.** The protocol runs the calibration on the same machine, by the three arms, before Tally; its
requests are another application's, so it needs trees of its own, made the same way: `cal-plain` (OpenStay's
`created: plain` and the same guide, `0932e48ebfee36bdc1aa9c7999bd3c6ae7ce6804`), `cal-lite`
(`5a386f7f042e2fe3b963d0e8a3c915d8fb1165b3`) and `cal-full` (`1c90a209f3df8d44cb9f780d3c99c44e871e5e20`), the two
last with [the calibration's session](calibration/storms/README.md#the-strategic-session-the-contexts-and-how-they-relate)
(Accounts, Listings, Booking, Notifications, the four relationships `planned`, the pilot's ADR 1, as OpenStay's
`ccf7f75` did). Their own checks pass. On `cal-full` the ten storms are legal. **One tree per arm** is prepared: the
protocol says the calibration shows the machine, the harness and the budgets treat the arms alike, and one ladder per
arm at once is that; three per arm would be the maintainer's call (a decision below).

## PostgreSQL (step 4)

One PostgreSQL 16 server per Tally tree, run as the `postgres` user, its data under `/var/lib/postgresql/j6/<tree>`,
listening on 127.0.0.1 only, on its own port: `plain-1..3` 55481–55483, `lite-1..3` 55484–55486, `full-1..3`
55487–55489 (away from 55432 and from K4's 55471–55472). [`pg.sh`](#where-everything-is) `start|stop|status <tree>`
makes the cluster on its first start and is idempotent; each plan's `services.start` is `pg.sh start <tree>`, and its
`envFile` (`/home/user/j6/<tree>.env`) names the server to the kit, `TALLY_POSTGRES=postgresql://postgres@127.0.0.1:<port>`
(the only variable `tally.ts` reads besides those the grader sets), and puts Node 24, yarn and `psql` on the `PATH`. The
nine were each started and stopped once; `full-1` was shown to start, take a `CREATE DATABASE` through
`TALLY_POSTGRES`, and stop (`status` then exits 3). The calibration needs none: OpenStay's requests 1 to 10 keep a
SQLite file. All nine are stopped now.

## The witness that answers later (step 5)

**On Full only:** a Lite command is answered at once ([ADR 43](../../../adr/0043-a-lite-use-case-calls-a-pure-decision-and-says-who-may-call-it.md)),
so Lite has no `202` to rehearse. The witness (`/home/user/j6/witness/full-w`, `afad853` on `86d20e8`) solves Tally's
requests 1 to 6 by hand from their text, every command answered `202 { operationId }` through Full's own
`acceptCommand` and the Tracker (served at `/v1/operations/{id}` as well), on `node:sqlite` with one write lock per
transaction; requests 7 to 10 are not solved. Graded by [`grade.mjs`](../../../../.claude/flow/grade.mjs) up to 6, with the
composed API in force, `--gate false`, two workers:

- **On the witness: all six files pass, 32 of 32 tests, at the first run.** Tests 1, 2 and 6 ran their operation's half:
  sign-ups refused later with `error: { type, message }` (`EmailAlreadyUsed`, `PasswordTooShort`, `InvalidEmail`,
  `InvalidName`); a member's operation read `401` without a token and `404` with another's; the stale edit and the
  edit by a member who is neither payer nor owner refused under two names (`ExpenseChangedSinceRead`,
  `NotPayerOrOwner`); and six rounds of two edits at once, through one server and two on the same file, one kept, the
  loser refused by the stale edit's name after the base handler re-read it (CONC-OPTIMISTIC).
- **On the starting tree (`86d20e8`): all six fail,** every test.
- **They discriminate where it matters:** a variant whose lost race is not re-decided (`CONFLICT_ATTEMPTS = 1`, the
  loser named `ConcurrencyConflict`) fails test 6's race alone; a variant whose refusal is named `password-too-short`
  with an empty message fails three of test 1's cases, among them *names the refused rule*.
- **Nothing failed, so nothing is the kit's or the witness's to report.** What it cannot show: the reactions of
  checkpoints 2 to 4 behind a `202` (T22's `GroupsMerged`, T23's netting, T25's scrubbing), which need a witness that
  far.

The calibration's README asks for its rehearsal on the arms' own starting trees and on trees solved to the kit, not for
a new `202` witness: the pilot's `clean-w`, which answers sign-ups later, was its `202` witness on 13 November.
[The rehearsals below](#the-rehearsals-on-the-arms-own-trees) are on the arms' own trees.

## The rehearsals on the arms' own trees

[`dry-run.mjs`](../../../../.claude/flow/dry-run.mjs) at `924901c`, with the composed API in force, on the frozen kits
(the plans and reports are in `/home/user/j6/rehearsal`; neither report is committed, since the kit is not the
operator's to change):

- **Tally** (`tally.json`, sha256 `588f5ecff1c4d4d9aaf66b48f0b2458a0160c3ebe08a70631a008c8c2b5c166f`), on `plain-1`,
  `lite-1` and `full-1` before, and on the witness before and solved, graded whole, with `full-1`'s server for the tests
  from request 30. **Discrimination:** all forty files fail on every starting tree. **Solvability:** on the witness,
  graded whole, requests 1 to 3 pass and 4 to 40 fail, all *read*, none a defect: the witness answers request 6's
  expense, and the API composed to request 40 requires what later requests add to it (`splitKind` from 7, `category`
  from 24), which is the witness's, not the kit's; graded up to 6, as the ladder grades it, its six files pass (above).
  **Hygiene: a defect, the kit's.** The kit's `tally.ts`, copied into a Lite or a Full tree, is refused by its linter's
  DOMAIN-ONE-CLOCK (`no-restricted-syntax`) at five lines that read the machine's time (77, 89, 91, 174, 614): the
  kit's README held its TypeScript to the plain tree's checks only, where the rule does not exist. **Verdict: defect.**
- **The calibration** (`calibration.json`, sha256 `6742719a57c41c37dc3af67a1c70e298f508fc80b1d4b005e09ca83534fc6341`), on
  `cal-plain`, `cal-lite` and `cal-full` before. **Discrimination:** all ten files fail on each. **Hygiene:** the same
  defect, in `openstay.ts` (lines 59, 71, 73, 102, 357), in `cal-lite` and `cal-full`. **Verdict: defect.**

Neither defect changes a grade the ladder gives: the ladder grades with `--gate false`, and the kit's files are only ever
in the grader's worktree, never in a tree an agent or a verdict checks. They do fail the kit standard's rule that a kit
passes its rehearsal before registration ([what blocks a run](#what-blocks-a-run), 5).

## The plans (step 6)

One plan per tree, `/home/user/j6/<tree>.plan.yaml`, in the format `run-ladder.mjs` reads. The same in every arm but
the arm, the tree's port, its server and the tooling:

| Field | Value |
| --- | --- |
| `arm` | `simple` (plain), `clean` (Lite and Full) |
| `kit` | `kit/app` (Tally) or `kit/calibration`: the frozen copies, relative to the plan |
| `base`, `of` | `main`; 40 (Tally) or 10 |
| `ladder` | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, as J5b |
| `agent`, `retry` | `claude-cli`, 90 minutes an attempt; sent back once |
| `budgetUsd`, `agentBudgetUsd` | $200 a Tally tree across its resumes, $60 a calibration tree; $12 an attempt |
| `dependencies`, `ports` | `copy`; 21100 to 21900 (Tally, by hundreds), 22000 to 22200 (calibration) |
| `machine` | `{ ladders: 3, jestCacheGb: 2 }` |
| `gradeTimeoutMinutes`, `gradeWorkers`, `regressionCheck` | 120; 2; `{ from: 2 }` |
| `triage` | `{ judge: claude-sonnet-5-5 }` |
| `tooling` | the tree's vendored package (Lite and Full) |
| `services`, `envFile` | `{ start: pg.sh start <tree> }` and `<tree>.env` (Tally); the calibration's `envFile` only |
| `fanOut` | none: no request is split (step 1) |
| `features` | Tally: checkpoint 1's ten; the calibration: all ten |

**Checkpoints.** A Tally plan lists checkpoint 1's ten requests. At each checkpoint, after the session's commit on
`main` (Lite and Full: checkpoint 2's before request 11, checkpoint 4's before 31), the operator adds the next ten ids
to `features` and resumes the same run (`--resume`). One run and one log per tree keep the commit each `upgrade`
request started from (10, 20, 30), which the ladder passes at every later grading; four runs would lose it. The plan's
hash at each checkpoint is recorded with the session's commit. Nothing else in a plan changes.

**Validated without starting:** `run-ladder.mjs` has no dry or check mode. [`check-plans.sh`](#where-everything-is) runs
the ladder's own code on each plan, cut just before its first side effect (`const flowDir`), so that every check a start
makes of a plan runs (the required keys, the arm, the ladder, the runner, `dependencies`, `gradeWorkers`, `fanOut`,
`regressionCheck`, the project's Node), and adds what the ladder accepts silently (a feature id not in the backlog, the
kit, the tooling, the `envFile`, the server's script, the base). **All twelve pass.**

| Plan | sha256 |
| --- | --- |
| `plain-1.plan.yaml` | `9b2953fddffa9b8db54127e0f81aa018616af5c0b2edd8408712ece104f11cd5` |
| `plain-2.plan.yaml` | `095930cb12a4a25e5e0989cde9b9709a732e5a8ec7843ce545d5a2436b654349` |
| `plain-3.plan.yaml` | `24ccdc473b5bd2b15b4036f89cc505a769ffc272457a705e3ebafea2052a4d85` |
| `lite-1.plan.yaml` | `df340563ee144f8f90ff52aee1df93ba6b0627f255c3718eb7cff87fd1ca5eb2` |
| `lite-2.plan.yaml` | `aa9e6e219645ca6a47c1e0a2e016356a757fb6050772ba17c4bbebbb7fc85bfa` |
| `lite-3.plan.yaml` | `e93513a4828ac228e854364bbb8889b2610b602d20043598dfa5f3a731990c05` |
| `full-1.plan.yaml` | `32f30d0edec88f390268821c5dd01120f9cc42d11b8e2e8aa7d777947350cee7` |
| `full-2.plan.yaml` | `0bad2a01746d1175a6c273a46678234446973be96fb48d33f061367def59f730` |
| `full-3.plan.yaml` | `46241c7a037623d337a33a8155a66ec1195e718ae92eca197cecd8817e2db1ef` |
| `cal-plain.plan.yaml` | `ae1549e0d01b4ac7b9fa825f2b7625a0dbb3988a13472c6843db8368c5ef8d04` |
| `cal-lite.plan.yaml` | `a2b76d96f7f7835a1f2029f098873c10f8e85ceafe3ef708157b7b1efda281e2` |
| `cal-full.plan.yaml` | `06f7e5a12acd0b338cb8b29b7949f7a38a0e41c17f6ba111b18d77dfffee750c` |

## The hypotheses and the scores

As [the protocol](README.md) and [RFC 0005](../../../rfc/0005-what-the-literature-and-j5b-say-before-j6.md) state them;
nothing here rewords one.

- **H1 (RFC 0005, P1):** Lite's share of logic errors among its failures is below Full's.
- **H2 (RFC 0005, P2 and D3):** with the specification as data, no triaged failure is a convention the specification
  states.
- **H3 (RFC 0005, P4):** Full's slope of cost per request is flatter than Simple's, and its change requests cost less
  than Simple's, even where its features cost more. If not, Full's structure does not pay for itself on this kind of
  application at this size.
- **The decision the campaign serves ([RFC 0002](../../../rfc/0002-architecture-profiles-lite-and-full.md), H8,
  unchanged):** Lite is "supported" only when its median cost per delivered feature is at most 0.6 times Full's, with
  no overlap of the ranges, it keeps Full's structural passes, and it has no more triaged failures or real regressions
  than Full; otherwise it is kept as an experiment or dropped, and the record says which, and why.

**The scores, kept apart, change first (D5):**
1. **The cost of change:** the four changes not announced in advance (requests 10, 20, 30 and 40), each by its agents'
   cost, the files and contexts it touched, and whether it was delivered at step 0; and the slope of each arm's cost
   per request against the request's index.
2. **Correctness:** the hidden tests, the triaged failures, where each tree stops.
3. **Cost:** tokens, dollars and agent time per delivered feature, the median and the range per arm; escalations, real
   or not.
4. **Robustness:** the chaos suite (concurrent servers, crashes between commit and publication, webhooks replayed).
5. **Maintainability:** an independent reading, blind to the arm where it can be, against a rubric written before.
6. **Lite's decisions:** how often a Lite feature brings a mechanism in, whether the trigger called for it, what the gate
   refused for a mechanism missing or added without its trigger.

The calibration is not counted.

## The stopping rules and the budgets

- **Per feature,** from the smallest model up: an attempt per model, sent back once on the driver's verdict, 90 minutes
  and $12 each; a failure of the hidden tests is graded again alone before it counts; an earlier test that fails is
  graded twice on the attempt's start before it counts as a regression (`regressionCheck`).
- **A feature the last model fails** stops the tree at `needs-triage`; it is judged by [J5's triage](../openstay/j5/triage.md),
  written before any run, with `claude-sonnet-5-5` as the judge: the kit's (amended for every arm alike and graded
  again) or FAILED, and the tree stops there.
- **A tree's budget** is its run's, across resumes, reserved before each agent starts: $200 a Tally tree, $60 a
  calibration tree, equal in every arm. Proposed so that no arm reaches it: J5b's clean-3 cost $156 for fifty requests,
  with a split that doubled its split requests' cost.
- **The machine:** at most three ladders at once (`machine.ladders`), each started through
  [`machine.mjs`](../../../../.claude/flow/machine.mjs) with Node 24 first on its `PATH`; a restart is resumed by
  [`resume.mjs`](../../../../.claude/flow/resume.mjs), which sources the plan's `envFile` and runs its `services.start`.

## The order of the runs

1. **The calibration,** first, not counted: `cal-plain`, `cal-lite` and `cal-full` at once, one ladder each.
2. **Tally, checkpoint by checkpoint,** one tree per arm at a time, three at once: `plain-1`, `lite-1` and `full-1`; then
   the `-2` trees; then the `-3` trees; then, after the maintainer's decision at the checkpoint and the session's commit
   on the Lite and Full trees, checkpoint 2 in the same order, and so on to checkpoint 4.

## What blocks a run

1. **The agents do not receive the API fragments (D3).** The ladder at `924901c` gives an agent the request's text
   (`backlog/<n>-<id>.md`) and, in Lite and Full, the storm; nothing gives it `api/<n>-<id>.yaml`
   (`run-ladder.mjs`, `brief`, reads `request(feature)` only; only `grade.mjs` reads `api/`). D3 says every arm's agents
   receive them, and the kit's README says so. **A change to the flow,** the same for every arm (the fragment appended
   to the brief, or copied into the tree), then a new repository commit for this registration. The package needs no
   change: the ladder runs from the repository.
2. **The kit's storms are refused on a Lite tree.** A storm's command under a profile that answers at once must say
   `answered: at-once`; none of the kit's does. `storm validate` refuses 6 of checkpoint 1's ten storms on `lite-1`, and
   7 of the calibration's ten on `cal-lite` (*Groups is held to Lite, whose commands are answered at once …*), and the
   ladder's clean verdict (`storm --expect`, which compares `answered`) would owe every command storm forever: no Lite
   attempt with a command could be delivered. With `answered: at-once` added to each command, mechanically, the forty
   storms are legal on a Lite tree with the sessions' declarations (shown on a copy of `lite-1`). **A change to the kit
   (Lite's rendering of each storm) or to the flow (rendering it when it copies the storm into a Lite worktree),** and
   the kit's hash taken again. A question with it: the storms name aggregates and recorded events, which `--expect`
   holds a Lite tree to as well, where Lite brings an aggregate and a domain event only on a trigger.
3. **Request 30 names `postgresql://postgres@127.0.0.1:55432/postgres`** for the agents, while each tree has its own
   server and the hidden tests reach it through `TALLY_POSTGRES`. Nothing serves 55432 now (the rehearsal's
   `/var/lib/postgresql/tally-j6` is stopped), and the operator was told to stay off it. From request 30, every tree's own
   tests and servers would meet on one shared server, or on none. **The maintainer decides:** one shared server on 55432
   for the agents' own tests, beside the per-tree servers of the hidden tests (the same for every arm); or a per-tree
   `DATABASE_URL` in the `envFile`, which every agent would see and the request does not name.
4. **The split cannot be measured on Tally** (step 1): no request is above the break-even, and three of the four [S]
   requests list one context. Registered as is, J6 splits nothing and correction 14 waits for another kit; a request
   registered split regardless could only be 31 (`split: always` on a plan that lists it).

5. **The kits fail their rehearsal's hygiene on the Lite and Full trees** (above): `tally.ts` and `openstay.ts` read
   the machine's time where the 3.2.0 linter's DOMAIN-ONE-CLOCK refuses it. No grade changes, but the kit standard
   asks for a clean rehearsal before registration. **A change to the kit,** or the maintainer's decision that the
   linter's rules of a created tree do not apply to the hidden tests' support.

## What is left for the maintainer to decide

- The five findings above, before any run.
- **The calibration's trees:** one per arm (prepared) or three.
- **The budgets** ($200 a Tally tree, $60 a calibration tree, $12 an attempt) and **the ladder's models**, as J5b's.
- **Repairs:** whether J5's [one repair per triaged failure](../openstay/j5/repairs.md) applies in J6, in each arm's
  medium; the protocol does not say.
- **The order** of the runs, checkpoint by checkpoint (proposed) or tree by tree.
- **The simple arm's guide:** correction 3's sentence as R3's first sentence, without its `"<NAME>"`.
- **Where the kit lives while agents run:** the plans read `/home/user/j6/kit`, a sibling of the trees, as J5b's read
  the repository's; an agent with a shell can reach either. The rehearsal's graded worktrees, which held the hidden
  tests beside the trees, were removed.
- Two things the kit's README asked for and this registration does not include: the dry run's report committed with
  the kit (it is the kit's to change), and a witness beyond request 6.

## Where everything is

Outside the repository, on this machine:

| Path | What it is |
| --- | --- |
| `/home/user/j6/<tree>/app` | the twelve trees: `plain-1..3`, `lite-1..3`, `full-1..3`, `cal-plain`, `cal-lite`, `cal-full` |
| `/home/user/j6/<tree>.plan.yaml`, `/home/user/j6/<tree>.env` | each tree's plan and environment |
| `/home/user/j6/kit/app`, `/home/user/j6/kit/calibration` | the kit at `924901c`, as the plans read it |
| `/home/user/j6/bin/make-tree.sh` | makes a tree (sha256 `47e979cc6ef954804634fe0907df59b29dd43e4f130588082994abaf718e1a23`) |
| `/home/user/j6/sessions/declare.py` and `*.json` | a session's commit (sha256 `50923825294b0de282c2271c3c23753d0220eb02efc549331aa4aca5bdfc689c`; `tally-cp1.json` `b8f7da9e…`, `tally-cp2.json` `bb4fff34…`, `tally-cp4.json` `602ca0e5…`, `openstay.json` `f99eb3bf…`) |
| `/home/user/j6/bin/pg.sh` | the servers (sha256 `f7aa13354f1927a0535db0142e233f9da3a69ab79f66b200c940257e42102858`); data under `/var/lib/postgresql/j6/<tree>` |
| `/home/user/j6/bin/checks.sh`, `check-all.sh`, `check-plans.sh`, `hashes.mjs` | the trees' own checks, the plans' validation, the hashes (`/home/user/j6/hashes.json`) |
| `/home/user/j6/witness/full-w`, `/home/user/j6/witness/grades` | the `202` witness, its variants and its gradings |
| `/home/user/j6/rehearsal` | the dry runs' plans, reports and logs |
