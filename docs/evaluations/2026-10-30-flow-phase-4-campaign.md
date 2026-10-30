# Flow, phase 4 — the campaign: three runs of A and C′ on the backlog, and a feature large across six contexts

**Date:** 2026-10-30 · **Proposal:** [RFC 0001](../rfc/0001-architecture-aware-multi-agent-flow.md) §10 · **Before it:** [the pilot](2026-10-30-flow-phase-4-pilot.md) · **Kits, written before any run:** [the backlog](benchmark/README.md), [feature 8](benchmark/feature-8/README.md) · **Related work:** [`docs/research/related-work.md`](../research/related-work.md) · **Logs, grades, the person's contract:** [`flow/phase4-campaign/`](flow/phase4-campaign)

After the pilot, the maintainer chose to run arms A and C′ twice more on the backlog: the two arms that passed, since C differs from C′ only by the pack and B had lost on quality. The maintainer then asked whether a feature exists that the fan-out would win. Feature 8, team spaces, is that test: one feature across six contexts, with its own kit decided before any run.

## The backlog, three runs each

Every run delivered the seven features. Each passed the gate on the whole run, every acceptance test and every storm, graded by the same script with the same tooling. The read items are below.

| Run | A: lead time | A: cost | C′: lead time | C′: cost | C′ ÷ A, cost |
| --- | --- | --- | --- | --- | --- |
| 1 (pilot) | 45.6 min | $11.85 | 64.5 min, about 52 without the harness's defects | $17.54, + $1.10 on stopped runs | 1.48 |
| 2 | 40.1 min | $12.11 | 42.6 min | $16.39 | 1.35 |
| 3 | 35.3 min | $10.39 | 43.6 min | $16.41 | 1.58 |
| **Range** | **35–46 min** | **$10.4–12.1** | **43–52 min** (clean) | **$16.4–17.5** | **1.35–1.58** |

- **A dominated C′ on the backlog in every run.** The quality was the same in every run. C′ was never sooner (2.5 to 8.3 minutes later in runs 2 and 3) and always cost 35% to 58% more.
- **This understates A's advantage.** In runs 2 and 3, C′'s person was a script replaying the pilot's contracts (about 2 minutes in all). A person writing the contracts the first time, as in the pilot, adds their writing time on the critical path. No harness defect touched runs 2 and 3: neither arm had a retry, a failed gate or a blocked slice.
- **The machine was shared.** Each pair ran on the same four CPUs: A and C′ of run 2 together, then those of run 3. Lead times include that contention. The cost does not depend on it.

The reasons are the pilot's, and the related work finds them too:

- A single conversation keeps its context cached from feature to feature: each feature after the first cost A between $0.5 and $2.7.
- Each C′ slice is a fresh agent that reads its pack and the guide.
- Most features of this backlog are small, and serial by their prerequisites. Kim et al. report the same regime: a strong single agent, sequential and tool-heavy work, where coordination costs more than it saves ([related work](../research/related-work.md)).

## Feature 8: a feature large across six contexts

One run of each arm, at the same time, from the same project: the pilot's arm-A tree, with features 1 to 7. In both arms the feature passed the gate, all eight of its acceptance tests and its storm, and features 1 to 7 did not regress.

| | A — one agent | C′ — six slices, with the pack |
| --- | --- | --- |
| Architecture task and contract | by the agent | by the person: 3 min 30 s (3 contexts, 9 relationships, the frozen events and read models, 6 plans) |
| Writing | one conversation: 18.8 min, then 5.0 min after the restart below | six slices at once, 4 to 10 min each, the integration at 12.5 min |
| Interventions | none needed by the feature | one, 2 min 34 s: a slice moved and extended a frozen read model (below) |
| **Active time, start to integrated** | **23.8 min** | **18.9 min** |
| Wall clock | 54.6 min: the agent wrote nothing from 12:06 to 12:35, then the container restarted | 26.9 min: the person took 8 minutes to see the blocked run |
| **Cost** | **$8.67**: $7.47 reconstructed from the interrupted session's tokens, $1.20 reported after it | **$15.07** |

**On this single point the fan-out wins on time and loses on cost.** C′ finished about 5 minutes (21%) sooner in active time and cost 1.74 times as much. The literature predicts this direction for work that decomposes cleanly with context separation: a gain in time, never in cost. Here the gain is modest. It is one run per arm, and it rests on the person's quick contract stage.

**Arm A's interruption.**

- A's agent wrote its last file at 12:06 and then produced nothing. Its transcript ends on a tool result, with no further model turn. The container restarted at about 12:35 and killed it.
- It was continued in the same conversation, told it was interrupted, and finished in 4 minutes and 11 turns. The driver's verdict was then applied: the gate in the architecture mode and the storm, both passing at the first try.
- Whether the 29-minute silence was the agent's or the platform's cannot be told from the logs. Active time leaves it out, and the wall clock keeps it.
- **The cost of the killed session.** It reported nothing, as phase 3 found any killed session does. It was priced from the tokens its transcript records, at per-token prices fitted on 85 sessions whose cost the runner did report. The fit has a median error of 0%, and it reproduces the $1.20 the continued session reported.

**C′'s intervention: a frozen contract changed inside its slice.**

- The contract stage froze `ISpacePlanQueries`, Plans' read model of spaces, in Plans' own Domain. The Teams and Notes slices each wrote an adapter over it.
- The Plans slice moved it to the folder of a new `SpacePlan` aggregate and added a method to it. Its reason: a query handler reads one port, and it needed to know who is a member. Its report flagged the change: "If moving or extending it counts as changing the contract, this is the one thing to undo."
- Nothing stopped it:
  - the file was inside its own context, which the scope check allows;
  - the pack did not list the file as frozen;
  - nothing in its worktree imported it.
- **At integration**, the acceptance tests and the storm passed, but the typecheck failed in Teams and Notes. The writer could not point at one slice, so the run stopped BLOCKED.
- **The fix by hand:** the person put the interface back at its path and shape, and gave Plans' own query an interface of its own.
- **Fixed since on this branch:**
  - a plan names the files it freezes (`frozen`);
  - the pack lists them, and says how to need more without changing them;
  - the slices driver refuses a slice that changes, moves or deletes one, and would have sent Plans back with those lines.

## The read items

_To be filled from the independent grader's report._

## What the campaign found

- **The plan format names one crossing between contexts.** Each of feature 8's slices crossed into several contexts: Teams asks Accounts and Plans, and publishes to four contexts. A plan names only one crossing. The person named the main one in the plan and the others in its intent, which the tooling cannot check.
- **Frozen read models need a home outside the slices.** The fix above makes the freeze explicit and enforced. Placing them beside the integration events, as a published language, would also remove the temptation.
- **A blocked integration waits for a person.** C′'s wall clock includes 8 minutes of nobody looking. A flow that blocks needs someone watching, and that someone is part of its cost.
- **A killed or silent agent costs what nobody reports.** Pricing tokens from a transcript closes the gap. The prices fitted here hold for this model and this period, and the record keeps the method, not the figures, as the thing to reuse.

## What it says

**On a backlog of small features, one agent with the gate, the context map and the storms is the better choice.** It wins on cost every time and on time every time, at the same quality. The architecture's tooling serves it as well as it serves a fan-out.

**On one feature that spreads across six contexts, the fan-out was sooner and dearer.** It saved 21% of active time for 1.74 times the cost, once, with one intervention a fix now prevents.

That is a regime boundary, not a reversal. Read with the related work, it suggests a cascade: one agent by default, and a fan-out by context only for a feature whose contexts are many and whose time matters more than its cost. The RFC's phase 6 is about choosing between the two. Before that, feature 8 would need the two runs per arm the backlog had, to turn one point into a range.

## Cost of the campaign

| | |
| --- | --- |
| Runs 2 and 3, A | $22.50 |
| Runs 2 and 3, C′ | $32.80 |
| Feature 8, A | $8.67 (of which $7.47 reconstructed) |
| Feature 8, C′ | $15.07 |
| **In all** | **about $79**, beside the pilot's $63 |
