# What the container held on 10 November, and what was lost with it (draft for the maintainer)

Between 09:47 and 11:35 UTC on 10 November, the session's container was replaced by a new one. Everything J5 kept
under `/tmp/claude-0/openstay` went with it:

- the six trees with their J5 code (51 onwards), and the Full+ and Simple+ copies;
- every run's log (`app.flow/*.jsonl`) and grading report;
- the plans, the bench scripts, the PostgreSQL data;
- the incident log (`incidents.md`).

What survives is in this repository (the kit, the repair rule, the J5 record as of 8 November) and in `jgaNet/openstay`
(`trees/*`, each at request 50, the end of J4). The J5 trees were never pushed.

What follows is what the session saw before the loss, taken from its own notes. It is not checked against the lost
logs.

## The repaired runs (`…-r1`, from 9 November, 22:36)

| Tree | Replayed | Correction | Replay delivered at | Then delivered | Last seen |
|---|---|---|---|---|---|
| simple-3 | 80 | R2, R0 | step 0 (haiku) | 81–84 at step 0; 85 at step 1 (haiku broke 73's read-time test) | on 86 |
| Full+ clean-1 | 80 | R2, R0 | step 1 (sonnet); step 0 hit its ceiling under three OOM kills | 81, 82, 83 at step 0 | on 84 |
| simple-1 | 73 | R1, R0 | step 1 (sonnet); haiku failed the read-time test | 74, 75, 76 at step 0 | held at 77 |
| Full+ clean-2 | 61 | R3, R2, R0 | never started (no slot) | | |
| simple-2 | 66 | R4, R1, R2, R0 | never started (no slot) | | |

- **Every correction tried held on its first wording:** R2 on both arms, and R1. R3 and R4 were never tried.
- **Full+ clean-3, not repaired, continued to 85.** Its step 1 (sonnet) was escalated "ungraded" because its grading
  ran past 60 minutes under load. The maintainer decided to grade that head again (decision 1a). The regrade passed:
  85's own tests 5/5; `strong-authentication` failed without naming a test and passed when replayed alone. 85 was
  counted as delivered at step 1. Spend at that point: $66.93 of $140.
- **Night spend (22:30 to 06:40):** clean-1 $6.76, simple-1 $5.96, simple-3 $3.54, clean-3 $2.42.

## What the harness did to the runs

- **Seven OOM kills, every one in clean-1's e2e workers** (about 3.5 GB each, in a 15 GB cgroup).
  - Four ladders at once were too many. The machine went to three at 02:06 and to two, one per arm, at 07:43.
  - No kill was seen with two ladders.
- **clean-3's 85 step 1 went unjudged:** its grading ran past 60 minutes under load (see the regrade above).
- **simple-1's 73 timeouts:** probably the load, on `yarn verify`.
- **An agent changed its tree because of the load:** clean-3's sonnet raised the tree's Jest timeout from 20 s to 60 s.

## For the next campaign

- **Push every tree's `main` to its branch after each delivery,** and the run's log with it. A container lasts as long
  as its session's machine; a tree that lives only on it is lost with it.
- **Two ladders, one per arm, on a 4-CPU, 15 GB machine,** or a grading limit that grows with the tree.
