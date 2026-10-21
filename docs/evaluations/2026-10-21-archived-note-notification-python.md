# 2026-10-21 — "Notify the recipients when a shared note is archived", in Python (cross-context reaction)

**Base:** the Python implementation complete and its first evaluation's fixes in, at `552158c` (PR #61). **Agent:** Claude, fresh session, isolated worktree with its own `uv` environment, nothing but the repository, told not to read `docs/evaluations/` and to read the guides from disk. **Language:** Python, the second run on [`python/CLAUDE.md`](../../python/CLAUDE.md). **Result branch:** [`eval/archived-note-notification-python`](https://github.com/jgaNet/clean-ddd/tree/eval/archived-note-notification-python) (commit `f395192`, 12 files, +219/−7; not merged).

## The request

The request of the [TypeScript cross-context run](2026-09-29-archived-note-notification.md), verbatim: the integration-event path, the anti-corruption layer, what one context may know about another, and a feature with no HTTP change at all.

> When the owner archives a note that was shared with other people, those people should be notified that the note is no longer available. Nothing else changes.

## Scorecard (rubric written before the run; verified by the grader on the diff, checks re-run)

| Expectation | Result |
|---|---|
| no new route; `presentation/` untouched | PASS |
| `NoteArchivedEvent` widened by the aggregate with what the consumer needs (`title`, `owner_id`, `shared_with`); nothing queries back | PASS — built in `Note.archive()` from the aggregate's own state, with a docstring saying why one event carries the list |
| a new contract in `note_integration_events.py`, in Notes' public words (`recipient_ids`), complete for the consumer, published whenever the fact happens | PASS — `NoteArchivedIntegrationEvent(note_id, title, owner_id, recipient_ids)`, published with an empty list too, and tested so |
| a domain event handler in Notes translating to it, shape of `NoteSharedHandler` | PASS — `note_archived_handler.py`, copied one to one |
| an anti-corruption handler in Notifications delivering through `NotificationDelivery`, one notification per recipient, importing nothing of Notes | PASS — `NoteArchivedIntegrationEventHandler`, a loop over `recipient_ids`, nothing when empty; its docstring says the fan-out is this side's business |
| registered on both sides: under `domain_events` in Notes, under `integration_events` in Notifications | PASS |
| tests beside their files: the richer payload in `test_note.py`, a `test_<name>_handler.py` on each side, the Archive handler case widened | PASS — 5 new cases, two existing ones widened |
| e2e: share, archive, the recipient's inbox has it | PASS — appended to the sharing case, with the metadata asserted |
| no guard on the event handlers | PASS |
| five checks green; no `noqa` / `print` / `Any`; nothing under the protected trees; feature mode within | PASS — `yarn architecture mode feature --base 552158c`: "the 12 changed file(s) are within it" |

Grader's re-run from the worktree: `uv run python -m tools.conventions` ✓ (213 modules, 1392 imports) · `ruff format --check` ✓ · `ruff check` ✓ · `mypy` 0 (216 files) · `pytest` 178 (from 173) · feature mode ✓.

## The nine decisions: documented, or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | no new rule; the only domain change is the event payload | `python/CLAUDE.md` step 1; `typescript/CLAUDE.md` "An existing event needs more data for a new consumer?" | documented, in the other language's guide → **the answer is now in the Python list** |
| 2 | widen `NoteArchivedEvent`; one contract carrying `recipient_ids`, published with an empty list too; the aggregate's words inside, the public words on the contract | the same TypeScript question, quoted; ADR 6 point 2; the `integration-event` checklist named the file | documented; the Python guide said "read that list before guessing", and the agent did → the two sentences are now in Python words too |
| 2b | one `deliver()` per recipient, fail-fast on the first `Failure`, `Success(list_of_ids)` | **guessed**: "nothing says what a fan-out handler should answer" | real gap → **fixed** (the *guard* question says it: once per recipient, the first `Failure` as is, `Success` with what it created) |
| 2c | wording, channel (`WEBSOCKET`, like the share notice) | guessed by precedent | product choices; none |
| 3 | published, asynchronous, after commit; `202` unchanged | ADR 6, ADR 3, step 4 | documented |
| 4–6 | no route, no read model, no persistence: `shared_with` is already in the snapshot and the table | step 3 "only if a port changed"; the route list | documented |
| 7 | aggregate → `test_note.py`; handler → `test_commands.py`; each event handler → `test_<name>_handler.py` beside it; the flow → the sharing e2e case | "Where does the test go?"; the `event-handler` checklist; the two `test_note_shared_handler.py` as models | documented |
| 8 | four new files at the paths the checklists print; absolute imports; both wirings on the event's class | the checklists; `tools.conventions` passed first time | documented |
| 9 | no guard on either handler | `typescript/CLAUDE.md` "Do event handlers need a guard?"; the `event-handler` checklist "no guard — the fact was already allowed" | documented → now in the Python list too |

Every decision but the fan-out's answer was made from the documentation; the two decisive sentences lived in the TypeScript guide only, a pointer away, and are now in the Python list.

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| the two decisive answers (widen the event; one message carrying the list, published whether or not anyone listens) and the guard answer live only in the TypeScript guide; the Python *Questions* list of the previous run carried neither | findability across languages, the same finding as the first Python run, on the questions that run did not raise | both answers added to *Questions you will have, in Python words* |
| **`plan validate` refused a second integration event of a context as "planned as new, but … already exists"**: the check was on the file, which holds every contract of the context, not on the class | **a real defect in the tooling**, in every language: the `integration-event` checklist's place is the context's file | the validator looks for the part's name inside an integration-events file; a spec pins both ways (a second contract is new; an existing one is not) |
| **`plan explain` expands the handler in the plan's context only**; the consuming side's anti-corruption handler was implied by prose alone | a real gap in the tooling | `explain` adds, for each contract a cross-context plan publishes, the anti-corruption handler in the consuming context, at the `event-handler` checklist's place there; a spec pins it |
| what a fan-out anti-corruption handler returns, and whether to continue after one recipient's `deliver()` fails | real gap | one sentence, under the guard question |
| the contract's words vs the aggregate's field names: the canonical `NoteShared*` pair has identical fields, so the rule is visible in ADR 6 only | true; the pair the Rust and TypeScript guides also show | none: the archived pair on the eval branch shows it (`shared_with` / `recipient_ids`), and the Python question now names both words |
| a `list` field on a frozen dataclass makes the event unhashable | nothing hashes events; `==` is what tests use, as the guide says | none |
| `python/README.md` and the Notifications wiring docstring counted "the four anti-corruption handlers" | a count every feature of this kind makes wrong | both counts dropped |
| the reading order: two READMEs, two guides, then the TypeScript questions | the cost of a guide that leans on another; the Python list now holds nine answers | none beyond the two answers |
| `uv` deprecation warning | harness | none |

## Against the TypeScript run

The same request on the TypeScript guide ([2026-09-29](2026-09-29-archived-note-notification.md)) found four real gaps (widen or add, one message or one per recipient, publish when nobody cares, the contract's vocabulary) and wrote the questions that answer them. On the Python guide those questions were a pointer away and the agent followed the pointer: every modelling decision landed, and what the run found is the pointer's cost, one answer the TypeScript question does not give (what a fan-out handler answers), and two defects in the shared tooling that no TypeScript run had hit because none had planned a *second* contract of a context or looked for the consuming side in `plan explain`.

## Numbers

About 35 minutes of agent time (55 % reading, 30 % writing, 15 % verifying). 178 tests from 173: domain 1, handler cases widened 1, event handlers 2 + 2, end to end widened 1. Zero refusals from the check, the linter, the type checker or the format while writing; one refusal from `plan validate`, which was the tool's error.

## Verdict

The cross-context path landed right on both sides, with each side knowing only the contract. The documentation's content held through a pointer to another guide, which is now unnecessary for the questions this feature raises; the finding of the run is in the tooling: a plan validator that could not plan a second contract, and an `explain` that showed half of a cross-context feature. The follow-up carries the two answers, the fan-out sentence, both tooling fixes with their specs, the dropped counts, and this record.
