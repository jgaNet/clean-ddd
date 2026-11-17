# K4, the pilot: what it measured (16–17 November)

The registered pilot ([`README.md`](README.md), [`plan.yaml`](plan.yaml)) ran on 16 November from 07:32 UTC, on a
machine of 4 CPUs, 15 GB of memory and 30 GB free, Node 24.22, PostgreSQL 16.15, Claude Code 2.1.325, the K3 package
packed from `main` at `d4a2651` (`clean-ddd-3.2.0.tgz`), OpenStay's `j5b/clean-3` at `c1ac8da`. Every run used
`claude-haiku-5-5`, $4 and 60 minutes, as registered. The records are in [`records/`](records): `registered/` (48 runs
of `plan.yaml`), `cplus/` (6 runs of [`plan-cplus.yaml`](plan-cplus.yaml) on the compact K3 package),
`cplus-3.2.0/` (2 attempts of the same arm on the 3.2.0 package, kept apart). The transcripts, bundles and gradings
stay on the machine (`/var/tmp/k4-pilot/out*`). `k4-report.mjs` on `registered/` says **incomplete**: C has 12 runs
of its 18, by the maintainer's decision below.

## What was run, and what was changed on the way

| | Runs | What |
| --- | --- | --- |
| Rounds 1 and 2, as registered | 36 | every task, every arm, twice; 35 successes, 0 void |
| Round 3, A and B as registered | 12 | the registered C of round 3 replaced by the maintainer (below); 12 successes, 0 void |
| Arm **C+**, on the 3.2.0 package | 2 attempts | C told to use the query first (`plan-cplus.yaml`); the first attempt void (below), the second a success; kept apart |
| Arm **C+**, on the compact package | 6 | one a task; 6 successes, 0 void |

**The maintainer's decisions during the pilot** (16 November, 16:30–20:20 UTC), each registered before its runs:

1. After rounds 1 and 2, read as the protocol fixes them, round 3's C became **C+**: the registered sentence replaced
   by an instruction to use `clean-ddd knowledge` first, on the names the code gives things (`plan-cplus.yaml`). The
   registered C stops at 12 runs; A and B finished their 18.
2. After C+'s first run measured the query's answers at 44% of everything the run read, three names in 21 KB, most of
   it said twice, the query's Markdown was made **compact** (`tools/src/knowledge.ts`, commit `69e91a1`; `--full`
   keeps the former rendering): the same three names in 9.4 KB. C+ started over on that package; its two attempts on
   3.2.0 are kept apart.

**Adaptations and incidents, none of which changed a task, a test or a measure:**

- The openstay repository has its application at its root, not under `app/`: the worktree was made at
  `/home/user/j5b/clean-3/app` so that the registered path of `node_modules` held.
- The registered command `yarn --cwd tools build` does not exist; the tooling is built by `yarn build` at the root.
- 17:13: run 28's arm C could not be prepared — `npm install` of the K3 package failed because `typescript-eslint`
  8.73.0 had been published six minutes before and its sub-packages were not yet on the registry. The runner exited;
  the install worked again six minutes later; the same command was relaunched (`plan.yaml` is resumable; no run was
  lost or counted twice).
- 19:55: the runner was stopped by process group after run 36, as decided; the agent of run 37 had started a minute
  before in a process group of its own and survived the stop; it was killed by pid, left no record, and its run was
  made again in round 3.
- 22:57: the container restarted; the disk held, the processes did not. The run in progress (`k4-t3-A-r3`, agent not
  finished) was made again; the clusters were restarted by the runner.
- The leak scan voided one attempt, `k4plus-t1-C-r1` on the 3.2.0 package: the agent's first call was
  `knowledge Conversation`, whose long answer Claude Code truncated into a file under `~/.claude/projects/…/tool-results/`,
  and the agent read the rest of that file; the scan's rule on `.claude/projects` voided it. Not a leak in the
  protocol's sense (the agent read its own tool result), but the registered rule; the attempt was run again as `.2`.
- The grading of three runs took a minute instead of fifteen because their result tree was byte-identical to one
  already graded (the runner keeps verdicts by git tree, commit `d90df5f`): `k4-t1-A-r1` and `k4-t1-B-r1` produced the
  same tree.
- Task 4's rule matches (the judge, `claude-sonnet-5-5`) were read by the operator for every run of A, B, C and C+:
  all correct, no distractor named by any arm.

## The table

Tokens are the mean per run (input, output, cache read and cache creation); successes as the protocol counts them
(hidden tests, the tree's five checks, no regression; task 4: pooled F1 ≥ 0.6 and nothing changed in the tree).

| Task | A (3 runs) | B (3 runs) | C (2 runs) | C+ (1 run, compact) | C/B, rounds 1–2 | `knowledge` calls, C / C+ |
| --- | --- | --- | --- | --- | --- | --- |
| 1 injected defect | 368k, 3/3 | 523k, 3/3 | 572k, 2/2 | 569k, 1/1 | 1.26 | 0 / 3 |
| 2 rule change | 297k, 3/3 | 366k, 3/3 | 316k, 2/2 | 532k, 1/1 | 0.90 | 0 / 1 |
| 3 two contexts | 910k, 3/3 | 1,072k, 3/3 | 1,157k, 2/2 | 1,524k, 1/1 | 1.28 | 2 / 2 |
| 4 impact | 611k, 3/3 | 822k, 2/3 | 746k, 2/2 | 520k, 1/1 | 0.88 | 3 / 2 |
| 5 one clock | 2,456k, 3/3 | 1,959k, 3/3 | 1,835k, 2/2 | 2,331k, 1/1 | 0.96 | 0 / 2 |
| 6 handoff | 1,781k, 3/3 | 1,697k, 3/3 | 1,137k, 2/2 | 1,032k, 1/1 | 0.71 | 0 / 2 |
| **all** | 1,071k, 18/18 | 1,073k, 17/18 | 961k, 12/12 | 1,085k, 6/6 | **0.95** | 5 in 3 runs / 12 in 6 |

B's one failure is `k4-t4-B-r1`: its answer's YAML did not parse (its rule lines held colons); read by hand it named
every required file, test and rule. Task 4's pooled recalls: A 0.86, 1, 1; B 0, 1, 1; C 1, 1; C+ 1.

C+ against B's three runs, per task: 1.09, 1.45, 1.42, **0.63**, 1.19, **0.61**; 1.01 on the sum of task means. C+
called the query first in every run (12 calls, 2 to 7 names each, all names the projection knows after the first run),
and the query's share of what each run read was 45%, 4%, 17%, 43%, 10%, 9%.

## The two criteria of §8

The protocol compares C's 18 runs with B's 18. C has 12, so `k4-report.mjs` says incomplete; the reading below
compares like with like — C's 12 runs of rounds 1 and 2 with B's 12 of the same rounds — on the registered bands.

- **Criterion 1 — holds (the direction is dropped).** C's tokens are 95% of B's (sum of task means and sum of
  runs alike); "holds" is 90% or more. C's successes are 12 of 12 against B's 11 of 12, the difference being B's YAML.
  "Does not hold" needed C at 70% or less and below 80% on four tasks of six: it is below 80% on one (task 6, 0.71).
- **Criterion 2 — undecided.** C's recalls 1 and 1 (mean 1); B's 0, 1, 1 (mean 0.67). C's mean is above B's, so it does
  not "hold"; C does not exceed B's highest (1), so it does not "not hold".
- **The pilot: dropped**, since criterion 1 holds. Had the third round of C been run as registered, it could not have
  moved C's ratio below 90% without three runs at a fraction of B's cost that no run of any arm showed.

**C+ does not change the reading**: with the instruction and the compact answers, the query is called in every run, and
the arm costs 1.01 times B over the six tasks, below B only on the two tasks shaped like an inventory (impact 0.63,
handoff 0.61).

## What the transcripts say

- **C did not reach for the query.** 3 runs of 12 called it (5 calls); before the first edit in 2, both on the impact
  task; on a name the projection knows once (`OutsideReviewWindow`, after the work was done). The other calls asked a
  word or a file name (`review`, `ReviewWindow`, `isPublished`) and were answered "nothing is called that". On the
  tasks of code C explored as B did, by `grep`, `cat` and `sed -n`.
- **A matched B.** Without the guide, the commands or the skills, A succeeded 18 of 18 and reached a recall of 1 on
  the impact task twice; its tokens equal B's over 18 runs (1,071k against 1,073k per run).
- **The variation between two runs of one arm on one task is as large as the difference between arms**: C/B on task 1
  was 1.77 in round 1 and 0.88 in round 2; B on task 1 cost 390k, 520k and 660k.
- **Where the query paid**: the impact task (C 0.88, C+ 0.63 of B) and the handoff (C 0.71, C+ 0.61), the tasks that ask
  what is there before acting. Where it did not: the defect, the rule change, the cross-context change and the
  refactoring, where the cost that dominates is getting the tests to pass after the edit (20 to 40 calls on tasks 3
  and 5 in every arm), which no projection touches.
- **The cost of the projection**: K3 is 972 lines of tooling and a 153-line spec (before the compact rendering; 1,105
  after); a call on clean-3 takes 0.5 s; it adds no check failure there (clean-3 has no register).

## Cost

| | $ |
| --- | --- |
| Registered runs (48), agents | 1.72 |
| Task 4's judge, registered runs | 0.06 |
| C+ on the compact package (6) | 0.23 |
| C+ on 3.2.0 (2 attempts, kept apart) | 0.03 |
| **Total** | **2.04** of the $150 budget |

The protocol's estimate was $46 to $104, from J5b's per-request costs; a K4 task is a tenth of a request.

## Limits

One tree, one model (the smallest), two runs per cell for C and one for C+, six tasks; the operator read the judge's
matches but not blind to the arm; the registered C was stopped at 12 runs by the maintainer's decision, so the pilot's
reading is on 12 matched runs, not 18. The extension §8 foresaw for an undecided pilot (twelve tasks, simple-3) is not
recommended: the review of 16 November ([`../../2026-11-16-next-evolution-review.md`](../../2026-11-16-next-evolution-review.md),
§E and §F) proposes a task-shaped, pre-fed projection in a handoff experiment instead, since the variable K4 found is
not the sample but how the query is offered.
