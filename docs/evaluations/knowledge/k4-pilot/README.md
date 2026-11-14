# K4, the pilot: does the projection shorten an agent's exploring? (registered before any run)

RFC 0006's experiment ([§8](../../../rfc/0006-software-knowledge-as-a-projection.md#8-the-experiment)), as the
maintainer decided it on 13 November: **6 tasks, the three arms of §8, 3 runs each (54 runs)**, with §8's rejection
criteria, run while J6 is prepared and read before J6 starts; extended only if it is undecided. J6's arms are not
touched: they receive neither the register (K2) nor the query (K3).

This file, [`plan.yaml`](plan.yaml), [`prepare-arm.sh`](prepare-arm.sh) and [`tasks/`](tasks) are the registration:
the tasks, their hidden tests, their ground truth and the criteria are fixed before the first run. Nothing here has
been run against an agent.

**What it can show:** on one frozen tree, whether an agent given `clean-ddd knowledge` reaches the same outcomes as one
given the guide and the commands, with fewer tokens, and predicts an impact better; and whether it calls the query at
all (§9b: agents explore by reading files and searching text, and the architecture's commands were 8% of clean-3's
exploring).

**What it cannot show:**
- **One tree, in sample.** clean-3 is the tree whose failures shaped RFC 0006. simple-3 (question 9) is for the
  extension.
- **Six tasks, three runs.** One task of each kind §8 lists: a task stands for its kind, not for it.
- **One model, the smallest.** J5b's step 0. A larger model may explore differently.
- **The projection as K3 builds it.** clean-3 has no rule register (K2 came after it, and its application is created
  without one), so C's query has derived edges and the declarations clean-3 already holds (the domain map, the storms,
  the ADRs), and no declared rule register.

## The codebase

OpenStay's frozen J5b Full tree, at request 100, in OpenStay's repository:

| | Branch | Commit | Request |
| --- | --- | --- | --- |
| **clean-3** (the pilot's) | `j5b/clean-3` | `c1ac8da7a796bfd94f7793b6d1f48cd0b665eaa8`, "Feature 100: pausing payouts" | 100 |
| simple-3 (the extension's) | `j5b/simple-3` | `277d781fe1398fd48a1170108d74e6965fe5808a`, "Pause payouts: …" | 100 |

`trees/clean-3` and `trees/simple-3` are J4's heads, at request 50 (`38dc2da`, `1a39820`): the J5b record names
`c1ac8da` and `277d781` as the heads at a hundred, and so does the RFC (`j5b/clean-3`, `j5b/simple-3`). Every arm and
every run starts from the same commit; nothing is pushed to OpenStay's repository.

The tree runs on Node 24, against PostgreSQL 16: one cluster for the agents and one for the grading (`plan.yaml`), never
shared, since a tree's test run drops every `openstay_test_` database of its server when it ends (J4 lost a tree's
databases that way).

## The arms

Exactly as §8:

| Arm | The agent has |
| --- | --- |
| **A** | the source, text search, the standard tools; no guide, no Clean DDD commands or skills |
| **B** | A, with the guide, the Clean DDD commands and the skills, as clean-3 has them |
| **C** | B, with `clean-ddd knowledge <name>` (RFC 0006's K3) |

In C the agent calls the query itself: nobody chooses what it reads for it.

**How each arm's tree is prepared** ([`prepare-arm.sh`](prepare-arm.sh), one call per task and arm, mechanical):

1. **Every arm:** the tree of `c1ac8da`, as `git archive` gives it (tracked files only), becomes a new repository whose
   history is one commit, "OpenStay at request 100", with a fixed author and date.
   - A defect task's `inject.patch` is applied before that commit: the defect is in the start tree, and no diff in the
     history shows it.
   - The handoff task's `half-done.patch` is a second commit, "Messaging: archiving a conversation (work in progress)":
     the first developer's work, which the fresh agent may read like any commit.
   - The dependencies are the J5b tree's installed `node_modules` (`/home/user/j5b/clean-3/app/node_modules` on the
     J5b machine), copied, never linked.
2. **A** removes, from that tree, before its commit:
   - the guide and the documents the tooling renders: `CLAUDE.md`, `README.md`, `src/Contexts/README.md`,
     `src/SharedKernel/Application/IntegrationEvents/README.md`, `conventions/README.md`,
     `conventions/plans/README.md`, `conventions/storms/README.md`;
   - the agents' directory: `.claude/` (the skills `feature` and `storm`, the agent `feature-author`, the flow);
   - the Clean DDD commands: the scripts `check:conventions`, `conventions:write` and `architecture` of
     `package.json`, the `clean-ddd` dev dependency, `vendor/clean-ddd-0.2.0.tgz`, its `yarn.lock` entry, and
     `node_modules/clean-ddd` with `node_modules/.bin/clean-ddd`.

   It keeps the code and its tests, the linter (`eslint.config.js`, which reads `conventions/architecture.yaml` and
   `conventions/typescript.yaml`), the conventions' data and the decisions (`docs/adr/`): they are the project's, as a
   conventional repository has them. A's tree passes its own checks (below).
3. **B** is the tree as it is: `CLAUDE.md` (19.9 KB, with J5b's repair sections), the skills, `yarn architecture …`
   (clean-ddd 0.2.0) and `yarn check:conventions`.
4. **C** is B's tree, unchanged. Beside it, never in it: the K3 package (`npm pack` of the reference at the commit K3 is
   merged at, recorded in the run log), unpacked into `<repo>.k3/`, and a `clean-ddd` executable first on the agent's
   `PATH` that answers `knowledge` from it and hands every other command to the tree's own 0.2.0, so B's commands are
   the same in C.
   - **What C's agent is told about it,** appended to the prompt, the same sentence for every task: "This repository
     also answers `clean-ddd knowledge <name>`: given the name of a command, an event, a rule or an exception, it prints
     its context, its behaviours, its files, the rules it can refuse with, the tests that assert them, the decisions
     and storms that cite it and the contracts it crosses, each fact marked derived or declared."
   - **Before the first run,** the operator checks that the query answers on C's tree at the start commit, with names
     no task is about (`clean-ddd knowledge BookingConfirmedEvent`, `clean-ddd knowledge PayoutsPaused`), and records the
     package's commit, its lines of tooling and the time of one call.

**The agent, in every arm:** Claude Code headless, `claude-haiku-5-5`, with the project's settings only
(`--setting-sources project --strict-mcp-config`: no user-level guide, skill, plugin or MCP server reaches any arm), the
tools `Bash Read Edit Write Glob Grep`, plus `Skill` in B and C; A runs with `--disable-slash-commands`. The prompt is
[`plan.yaml`](plan.yaml)'s, the task's `task.md` verbatim inside it, and C's sentence after it in C only. $4 and 60
minutes a run, no retry, no escalation.

## The tasks

One of each kind §8 lists. Each `tasks/<n>-<id>/` holds `task.md` (what the agent is given, in product words, naming
no file), `acceptance/` (the hidden tests), `ground-truth.yaml` and the reference solution `solution.patch`; the defect
task has `inject.patch`, the handoff task `half-done.patch`.

| | Kind | The task | Where the knowledge is |
| --- | --- | --- | --- |
| [1](tasks/1-cancelled-stay-hides-contacts) | a defect injected into an existing rule | after a paid stay is cancelled, the conversation hides contact details again | the rule is decided in Booking's read side and asked through a port Messaging owns; none of the tree's 1,656 tests catches the defect |
| [2](tasks/2-phone-numbers-with-hyphens) | a change of behaviour no request announced | a phone number may be written with hyphens, wherever contact details are recognised | the rule is written twice, in Messaging (held back) and in Reviews (refused), with nothing linking the copies |
| [3](tasks/3-message-notice-names-the-listing) | a change that crosses two contexts | the notice of a new message carries `listingId` | Messaging's domain event, the integration event in the shared kernel, Notifications' notice and its storage |
| [4](tasks/4-review-window-impact) | predicting impact | before a 30-day review window replaces 14 days, list the rules, the tests and the files it touches | the window decides writing, publication, ratings, replies and reports; Support's claim window is also 14 days, another rule |
| [5](tasks/5-domain-time-is-given) | a refactoring with no change of behaviour | Messaging and Notifications take every time from the one clock; no default reads the machine | 11 reads of the machine's time in 7 files, and three callers that relied on a default |
| [6](tasks/6-archive-a-conversation) | a handoff of a half-done task to a fresh agent | finish archiving a conversation: the domain, storage and handler are written; the wiring, the route and the list are not | the half-done commit, the canonical per-reader command it copied, and a list read that the unread total shares |

**How the hidden tests are held** (the [kit standard](../../benchmark/kit-standard.md)'s practice, J5's client):
- In clean-3's kit style: black-box tests of the API through J5's support (`openstay.ts`, `provider.ts` of
  [`../../benchmark/openstay/j5/acceptance`](../../benchmark/openstay/j5/acceptance), unchanged), each starting the
  server as a process of its own on a database of its own. Task 5's is structural: it reads the two contexts' source
  from the tree's root.
- Outside the tree. They are copied into the graded tree only (`src/Bootstrap/Fastify/Acceptance/`), in the grading
  repository, never into the agent's.
- Formatted, linted and typechecked as the tree's own checks hold its files, as J5's kit is.

### The proof (13 and 14 November, the pilot's scratch copy of `c1ac8da`)

Every hidden test fails on the tree the agent starts from and passes with the reference solution; every reference
solution passes the tree's own checks and the J5 kit's files of the requests it touches.

| Task | Hidden tests on the start | With the reference solution | The tree's checks on the solved tree | The J5 kit's related files there |
| --- | --- | --- | --- | --- |
| 1 | 1 of 2 fails (the injected tree; the other case holds the rule's other side) | 2 of 2 pass | conventions, format, lint, types; 1,049 unit and 608 end-to-end tests pass | 51, 52, 53 pass |
| 2 | 3 of 3 fail | 3 of 3 pass | all pass; 1,051 and 607 | 53, 58, 60, 61 pass |
| 3 | 1 of 1 fails | passes | all pass; 1,049 and 607 | 10, 55, 75, 76, 97 pass |
| 4 | 1 of 1 fails | passes | all pass; 1,049 and 607 | 60, 61, 62 pass; 57 (2 cases), 58 (1) and 59 (1) fail: they hold the 14 days the change replaces |
| 5 | 1 of 1 fails (11 reads of the machine's time) | passes | all pass; 1,049 and 607 | 51 to 56 and 75 pass |
| 6 | 3 of 3 fail (the half-done tree) | 3 of 3 pass | all pass; 1,052 and 609 | 51, 52, 53, 55 pass |

- **The injected defect of task 1** fails no test of the tree's own (1,049 unit and 607 end-to-end tests pass on the
  injected tree); it fails the hidden case and the J5 kit's 53.
- **The half-done tree of task 6** passes every check of the tree's own (1,052 and 607): nothing in the tree says the
  feature is unfinished.
- **The reference solution of task 3** first missed one end-to-end assertion of the notice's body
  (`message-notices.e2e.spec.ts`); the proof found it, and `solution.patch` includes it.
- **The kit's 10** failed once on task 3's first proof (its timing case, under load) and passed on the second: the
  grading's run-alone rule (`grade.mjs --workers`) is what a run needs there.
- **A's tree** (`prepare-arm.sh A`, task 1) passes its own checks: format, lint, types, 1,049 and 607 tests.
- **The hidden tests' hygiene:** formatted by the tree's Prettier, typecheck and lint clean in the tree, beside J5's
  support (task 4's needed one `prefer-const`, fixed).

## Leakage

- **The projection is built from the task's start commit only.** C's query reads the agent's own working tree; it is
  never given the hidden tests, the kits, this directory or the ground truth, and any cache it keeps is built in that
  tree. The K3 package is unpacked beside the tree, not in it.
- **No task text names a file.** Task 4 asks for paths in the answer; it names none.
- **The hidden tests are outside the tree**, in this repository, and reach a tree only in the grading repository. The
  agent's repository has no history but the start (and, for task 6, the half-done commit): the injected defect is not a
  diff it can read.
- **Every transcript is scanned** for a path under `docs/evaluations/`, a file named `*.acceptance.ts`, OpenStay's
  repository or a J5b directory, or the K3 package's source: a run that read one is void, recorded as such, and run
  again under the next id.

## Measures

§8's measures, each computed from the run's log and its transcript (Claude Code's session file, kept beside the log),
with K1's method ([§9b](../../../rfc/0006-software-knowledge-as-a-projection.md#9b-k1-measured-13-november)):

| Measure | How |
| --- | --- |
| **Success** | Tasks 1, 2, 3, 5, 6: every hidden test passes, the tree's own checks pass (`format:check`, `lint`, `typecheck`, `test:units`, `test:e2e`), and no regression (below). Task 4: the answer parses, nothing in the tree changed, and the F1 of its `files` and `tests` together, against `expected`, is 0.6 or more. `check:conventions` is recorded apart for every arm (A cannot run it): it is not part of success. |
| **Tokens, cost, time** | As the runner reports them, never estimated: tokens are input + output + cache read + cache creation, summed over the models of `modelUsage`; cost is `total_cost_usd`; time is `duration_ms` and the wall clock. |
| **Exploring, in calls and in bytes** | Each tool call is classed as K1 classed J5b's: **explore** (Read, Grep, Glob; a Bash command whose verbs read or list: `cat`, `sed -n`, `head`, `tail`, `less`, `grep`, `rg`, `find`, `ls`, `tree`, `wc`, `git log/show/diff/grep/blame`, `yarn architecture …`, `npx clean-ddd …`, `clean-ddd knowledge …`), **edit** (Edit, Write; a Bash command that writes into the tree: a redirection, `sed -i`, `tee`, `git apply`, `patch`, `mv`, `cp`, `rm`, or a script that opens a file for writing), **verify** (the tests, the linter, the type checker, the formatter, the conventions check, the gate), **other**. The context a class brings in is the size in bytes of its results; the shares are of all tool results. `clean-ddd knowledge` is also counted on its own: calls, bytes, and whether it came before the first edit. |
| **Files read before the first edit** | Distinct tracked files read (a Read's `file_path`; a tracked path named by an explore Bash command that prints a file, not by a search) before the first edit call. |
| **Unnecessary files read** | Distinct tracked files read in the whole run that the run's diff does not change and the task's ground truth does not name (its reference changes, `lives_in`, `start_reads`, `half_done`, and task 4's `expected`, required and tolerated). |
| **Precision and recall of the impact** (task 4) | Over `files` and over `tests`, by exact path: a hit is a predicted path in `required`; a predicted path in `tolerated` is neither a hit nor a miss; precision is hits over predictions not tolerated, recall is hits over `required`. `rules` are matched by a judge (claude-sonnet-5-5, J5b's triage judge, given only the answer and `expected.rules`) to the required ids, a distractor, or nothing; the operator reads every match. |
| **Regressions** | The J5 kit's 101 files (requests 1 to 100 and 25.1) and the tree's own tests, on the result: a test that passes on the start and fails on the result. Graded with `grade.mjs --workers 2`, a file failing beside the others run again alone. |
| **The cost of the projection** | From K3's build, recorded once: its lines of tooling (source and tests), the time of a call on clean-3, and the check failures it causes there (clean-3 has no register, so K2's check adds none). |

## The rejection criteria (§8, unchanged)

The direction is dropped if either holds:
- C does not reach success with at least 20% fewer tokens than B, without a loss of success;
- C's recall of the impact is not better than B's with text search.

Read on the pilot as: **criterion 1** compares C's 18 runs with B's 18 (tokens summed over all of an arm's runs, failed
ones included, since a failed run is paid for; success counted in runs); **criterion 2** compares C's recall on task 4
(files and tests pooled, the mean of its 3 runs) with B's.

**When the pilot is undecided.** Three runs a task cannot separate small differences, so each criterion is read in one
of three ways, fixed now:

| | Holds (the direction is dropped) | Does not hold | Undecided |
| --- | --- | --- | --- |
| 1 | C's successes are 2 or more below B's, or C's tokens are 90% of B's or more | C's successes are at least B's, C's tokens are 70% of B's or less, and below 80% on at least 4 of the 6 tasks | anything else (tokens between 70% and 90%, or successes one apart) |
| 2 | C's mean recall is B's or lower | each of C's 3 recalls is above the highest of B's | anything else |

The pilot is decided when both criteria are; it then says "dropped" if either holds, "stands" otherwise. **If either is
undecided, the pilot is extended** as §8 sizes the experiment: about twelve tasks (the six here and six more, one of
each kind, written and reviewed before any run), 3 to 5 runs per task and arm, and simple-3 as a second codebase
(question 9), at the maintainer's decision, before or after J6.

A is read beside B and C, as §8's conventional baseline: it decides nothing on its own.

## What the runners lack

The [flow](../../../../.claude/flow/README.md)'s `claude-cli` runner (`runners.mjs`) runs one agent with a model, a
budget and a timeout, and Claude Code keeps each session's transcript. No driver fits a single task with a hidden test
and a transcript as it is; `run-feature.mjs` is the nearest, and lacks:

1. **A prompt of the run's own.** Its brief is fixed: it names `.claude/agents/feature-author.md`, `CLAUDE.md` and the
   gate, which A does not have and which would tell B and C more than the task. It needs the prompt passed verbatim.
2. **Tools and settings per arm.** Its tools are fixed to `Bash Read Edit Write Glob Grep` (so are `runners.mjs`'s):
   B and C need `Skill`; A needs `--disable-slash-commands`; every arm needs `--setting-sources project` and
   `--strict-mcp-config`.
3. **A run without the clean-ddd gate.** It runs `yarn architecture gate`, which A cannot run; K4 grades every arm the
   same way afterwards (`plan.yaml`, step 5).
4. **A budget.** It calls `claude` without `--max-budget-usd` (`runners.mjs` has it).
5. **The transcript.** It logs neither a session id nor where the transcript is: it needs `--session-id` and the
   session file copied beside the log.
6. **A scorer for task 4's answer** (the YAML block against `expected`), and a **kit composed per task** for
   `grade.mjs` (J5's backlog, acceptance and storms, with the task added as request 101 and its hidden test copied as
   `acceptance/101-<task id>.acceptance.ts`); `grade.mjs` itself fits.
7. **The transcript measures.** K1's scripts are in the operator's notes, not in this repository; the classes, the
   bytes, the reads before the first edit and the unnecessary reads above need a script that reads a session file and
   a ground truth.

Until they exist, `plan.yaml`'s `launch` is the procedure, by hand or by a script outside the flow.

## The choices this registration made that the RFC did not fix

- **Codebase branch:** `j5b/clean-3` at `c1ac8da`, not `trees/clean-3` (request 50).
- **Model:** `claude-haiku-5-5` for every run (J5b's step 0), no escalation, no retry.
- **Budget:** $4 and 60 minutes a run; $150 for the pilot; one run at a time.
- **History:** each arm's repository has one commit (two for the handoff); the 388 commits of clean-3 are not given to
  any arm, so a defect's injection is not in a diff, and git history is no arm's source of knowledge.
- **A's tree:** keeps `docs/adr/` and `conventions/` (the linter reads it; storms and plans are data); removes the
  guide, the rendered READMEs, `.claude/` and the tooling. The linter's architecture rules stay active in A.
- **C's tooling:** K3 beside the tree, through a `PATH` wrapper, so that B's commands are 0.2.0's in C too; C's sentence
  in the prompt, not in `CLAUDE.md`.
- **The prompt:** one for every arm, with no word of `CLAUDE.md`, the gate or the architecture; B and C find their
  guide as Claude Code loads it.
- **Success:** hidden tests, the tree's own checks and no regression; the conventions check recorded apart, not part of
  success; task 4's success threshold (F1 0.6).
- **Task 4's scoring:** `tolerated` paths neither hits nor misses; rules judged by a model and read by the operator.
- **Tokens for criterion 1:** summed over all runs of an arm, failed ones included.
- **"Undecided":** the thresholds of the table above.
- **The hidden tests' support:** J5's client, unchanged; task 5's test is structural (it reads the source).
- **Leakage control:** a scan of every transcript, a touched path voiding the run.
- **Order:** three rounds, every task once a round, the arms rotated within a task (`plan.yaml`).
