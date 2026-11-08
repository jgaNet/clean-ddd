# Two developers on one request: results (7 November)

Protocol: [protocol.md](protocol.md), written before the runs; arm C added after A1 and B1, at the maintainer's request,
before A2 and B2 (its addendum). Driver: [run-twodev.mjs](run-twodev.mjs). Request 64 (the moderation queue) on
clean-1 where J5 stopped, split by owner: the upstream team owns Messaging and Reviews and their integration events,
the Moderation team the rest of the request. Smallest model, two agents at once, separate clones, a channel.

| run | kit | integrator | hidden 64 | gate on merged main | delivered | cost | wall | channel |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | old | no | FAIL (identity, −19/+5) | fail (e2e) | no | $1.18 | 111 min | 3 |
| A2 | old | no | FAIL (identity, −19/+5) | pass | no | $0.74 | 30 min | 4 |
| B1 | Full+ | no | pass | fail (e2e, format) | no | $2.06 | 111 min | 7 |
| B2 | Full+ | no | FAIL (identity, −19/+5) | fail (e2e) | no | $1.63 | 55 min | 4 |
| C1 | Full+ | yes, 2 rounds | pass | pass | **yes** | $2.19 | 80 min | 11 |
| C2 | Full+ | yes, passed at once | pass | pass | **yes** | $1.67 | 57 min | 8 |

The hidden tests of 56, 61 and 63 passed in every run; no merge conflicted; no commit was refused by the owners' hook
and no file outside a team's paths was changed. Single agent on the same base and model: old kit $1.38 (failed), Full+
$1.63 (delivered).

## What happened

- **Old kit (A1, A2)**: the upstream team found nothing of its own in the storm and stopped; Moderation built the queue
  on its own ids. The identity defect reached `main` both times, with the diff J5's clean-1 had. Nobody saw it.
- **Full+ without an integrator (B1, B2)**: in both, Moderation's gate (identity is born once, ADR 66) asked for the
  report's id in upstream's events, and Moderation asked upstream in the channel. In B1 upstream answered (identity
  right), but Moderation's next request (fix Messaging's e2e test that read a table Moderation no longer writes, and a
  formatting warning) came after upstream's last turn, and nobody answered. In B2 the first request itself came 11
  minutes after upstream's session had ended: the defect reached `main`.
- **Full+ with an integrator (C1, C2)**: C1 failed the merged gate; the integrator handed the failures to each owner;
  upstream read the channel, found Moderation's two unanswered requests and pushed them; Moderation took the id; the
  second merge delivered. In C2 upstream added the report's id on its own at the start, citing ADR 66, and the first
  merged gate passed: the integrator had nothing to hand over.

## Against the predictions

1. A: the identity defect survives the merge in at least one run — **held** (both).
2. B: upstream carries the id without being asked in at least one run — **not held** in B (asked both times); it did in
   C2, which runs the same kit. The queue answers the client's ids in both B runs — **not held** (B2 failed).
3. B: a team's gate refuses its branch alone for a test it cannot pass without the other — **held** in every Full+ run:
   the relationship tests fail (404) on one branch until both are merged, and Moderation's typecheck failed alone in B1.
4. Two agents cost more than one — **held for Full+** (B $1.63–2.06, C $1.67–2.19 against $1.63), **not for the old kit**
   (A $0.74–1.18 against $1.38: upstream did nothing).
5. C delivers in at least one run where B delivers in none, and costs more than B — **delivery held** (2 of 2 against
   0 of 2); **cost not clearly** (C $1.67–2.19, B $1.63–2.06: the ranges overlap).

## What it says about several developers

- The rule made the seam visible (Full+ saw the identity problem in all four runs; the old kit in none); it did not by
  itself make the two sides act on it in time.
- What was missing was not a rule but a role: someone who runs the gate on the merged `main` and hands each failure to
  the team that owns the file. With it, 2 of 2; without it, 0 of 4.
- An agent's session ends; a request sent after that is lost unless something brings the agent back. A team of agents
  needs the integration loop as part of the process, not left to the channel.
- The relationship test, as one test across two owners, refuses each branch alone (prediction 3): with an integrator
  this was harmless; without one it is one more thing waiting on the other side.

## Caveats

Two runs per arm, one request, one model. A1 and B1 ran together, with three ladders, and memory ran out (gates killed;
the gate on the merged heads was run again at low load, 18:10, and that is the verdict). C was added after seeing A1 and
B1. In C2 the integrator did nothing: its delivery came from upstream's own reading of the rule, so the integrator's
effect rests on C1 alone.
