# The rubric

Written before the first run. Quality is a constraint, not a score: a feature passes or fails, and a run whose features do not all pass is a failed run, whatever it cost (RFC 0001 §10). Each feature is graded on the arm's **final tree**, so a feature broken by a later one fails.

## Mechanical — every feature, by the grader's script

| Id | Check | Passes when |
| --- | --- | --- |
| M1 | The gate on the whole run | `clean-ddd gate --base <the created commit> --mode architecture` passes on the final tree. It is one verdict for the run, shared by its seven features. |
| M2 | The feature's acceptance test | `acceptance/<n>-<feature>.acceptance.ts`, copied beside `support.ts` into `src/Bootstrap/Fastify/Acceptance/`, passes on the final tree, run on its own. |
| M3 | The storm | `clean-ddd storm --expect storms/<feature>.yaml` owes nothing on the final tree. |

## Read — per feature, by the grader, with the file and line as evidence

A *fail* names the line that breaks the item. An item that the code does not reach (no such file) fails.

| Feature | Id | Item |
| --- | --- | --- |
| every one | R0 | Every new context and every new relationship is declared in the binding and the context map, with an ADR in the project that says why. |
| 1 | R1.1 | The password is hashed behind a port the context owns; no clear password is stored, returned or logged. |
| 1 | R1.2 | A note's owner comes from the caller, never from the request body. |
| 2 | R2.1 | "An archived note cannot be pinned" is decided by the note, not by a handler or a controller. |
| 3 | R3.1 | A tag is a value object that validates its own shape; the limit of ten is decided by the note. |
| 4 | R4.1 | Notes asks for accounts through a port Notes owns, answered by an adapter over Accounts' read side. Nothing in Notes' Domain imports Accounts. |
| 5 | R5.1 | The reaction in Notes publishes the integration event through the outbox (`publishIntegrationEvent`), carrying the recipients of the moment. |
| 5 | R5.2 | The consumer creates the notifications in its reaction's own transaction. It has no hand-made idempotency (ADR 30 of the reference). |
| 6 | R6.1 | The quota is decided in Notes' Domain or Application layer, with the count from Notes' repository and the limit from the port, never in a controller. |
| 6 | R6.2 | An account that never chose a plan is on Free, without anything having to create a plan for it. |
| 7 | R7.1 | Whether a notification is due is decided with the current time as a parameter with a default, not by reading the clock inside the rule. |
| 7 | R7.2 | Archiving or rescheduling cancels only a reminder whose moment has not come. |

## What a run's record gives

For each run:

- the seven features' verdicts, M1–M3 and R;
- the lead time, the person time and the agent time;
- the reported cost, with the absences;
- the retries, the integration failures by kind, and the interventions;
- what overlapped with what on the machine.

Then, for the arms, a Pareto table on lead time and cost per integrated feature among passing runs, with reliability as the share of passing runs. There is no weighted score.
