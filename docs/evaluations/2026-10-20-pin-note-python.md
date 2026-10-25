# 2026-10-20 — "Pin a note", in Python

**Base:** the Python implementation complete, at `b4f8650` (PR #61, every concept of the map shown). **Agent:** Claude, fresh session, isolated worktree with its own `uv` environment, nothing but the repository, told not to read `docs/evaluations/` and to read the guides from disk. **Language:** Python, the first run on [`python/CLAUDE.md`](../../python/CLAUDE.md). **Result branch:** [`eval/pin-note-python`](https://github.com/jgaNet/clean-ddd/tree/eval/pin-note-python) (commit `697c615`, 16 files, +387/−18; not merged — it is an exercise, and archive/restore already teach that shape).

## The request

The request of the [first TypeScript run](2026-09-29-pin-note.md) and of the [Rust run](2026-10-18-pin-note-rust.md), verbatim, so that the three guides can be compared on the same feature:

> Users want to pin a note. A user can pin one of their own notes and unpin it later. Pinning an archived note is not allowed. In 'my notes', pinned notes come first. That's all.

## Scorecard (rubric written before the run; verified by the grader on the diff, checks re-run)

| Area | Expectation | Result |
|---|---|---|
| Domain | `pin()` / `unpin()` on `Note`, `_ensure_owner` → `_ensure_active` (pin) → not twice, `Failure` returned as is, never raised | PASS — `pin()` reuses `_ensure_active()`; `unpin()` is not gated by the status, like `restore()`, said in the aggregate's docstring and tested |
| Domain | `NoteAlreadyPinned`, `NoteNotPinned` in `note_exceptions.py`, PascalCase `type`; "cannot pin archived" reuses `NoteArchived` | PASS |
| Domain | `NotePinnedEvent` / `NoteUnpinnedEvent` as frozen dataclasses, past tense, recorded by the behaviour | PASS |
| Domain | `NoteSnapshot` gains `pinned`; `create()` starts unpinned; `from_snapshot()` records nothing | PASS — `pinned: bool = False`, placed before the defaulted fields |
| Domain | tests in `test_note.py` beside it | PASS — 7 cases in `TestPinningAndUnpinning`, the round trip pins |
| Application | `pin_note.py`, `unpin_note.py`: command + handler in one file, `require_signed_in` → load → behaviour → save → `publish_domain_events` → `OK` | PASS — copied from `edit_note.py`, with a docstring saying the rule is the aggregate's |
| Application | no reaction subscribed to the new events | PASS |
| Application | tests in `test_commands.py` with the fixture, happy path and one refusal each | PASS — 4 + 2 cases |
| Application | `NoteListItem` gains `pinned`; the order promised on the port's docstring | PASS — `find_by_owner`: "Pinned notes first, then the others, each group in the order they were saved … An unknown owner gets an empty list"; `NoteDetail` gains it too |
| Infrastructure | both queries adapters order pinned first; both repositories persist it; SQLite column, `to_row` / `to_snapshot` | PASS — stable `sorted(key=not pinned)`; `ORDER BY pinned DESC, rowid`; the column, both conversions, the `UPDATE` and the `INSERT` |
| Infrastructure | contract test extended, runs over both adapters | PASS — one ordering case (pinned after the fact, through the write side), the round-trip and detail cases widened |
| Presentation | `POST /{note_id}/pin`, `/unpin` through `accept()` → 202; no new refusal line | PASS |
| Presentation | the views gain `pinned` | PASS — list item and detail |
| Presentation | e2e: pin → first; twice → `NoteAlreadyPinned`; unpin; pin archived → `NoteArchived`; a stranger → `NotNoteOwner`; followed through the Tracker | PASS — one case, the existing assertions widened |
| Wiring | two `Subscription(...)` lines, nothing else | PASS |
| Hygiene | five checks green; no `noqa` added, no `print`, no `Any` in the use cases | PASS |
| Hygiene | nothing under `conventions/`, `docs/`, the READMEs or the guides edited; conventional commit; feature mode within | PASS — `yarn architecture mode feature --base b4f8650`: "the 16 changed file(s) are within it" |

Grader's re-run from the worktree: `uv run python -m tools.conventions` ✓ (211 modules, 1401 imports, 4 contexts) · `ruff format --check` ✓ · `ruff check` ✓ · `mypy` 0 (214 files) · `pytest` 188 (from 172) · feature mode ✓.

## The nine decisions: documented, or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | rule in the aggregate, `Failure` returned as is, `_ensure_*` helpers; `NoteArchived` reused for "cannot pin archived" | `python/CLAUDE.md` step 1, quoted | documented |
| 1b | two refusals, `NoteAlreadyPinned` / `NoteNotPinned` | "guessed, by symmetry with `NoteAlreadyArchived` / `NoteNotArchived`" | the criterion ("one exception per rule the user could act on differently") is in step 1; the symmetry is its application — documented |
| 1c | may an *archived* note be unpinned? does archiving unpin? | guessed from the aggregate's docstring ("archiving, restoring and reading it are not gated"); decided: unpin is not gated, archiving keeps the pin | product ambiguity, as in the two other runs; the pattern was in the code, not in the guide → **fixed** (step 1: an act undone is not gated by `_ensure_active()`) |
| 2 | two events, nothing handles them, no integration event | step 1; `typescript/CLAUDE.md` "Does every domain event need a handler? No" | documented, through the pointer to the TypeScript list → the answer is now in the Python guide too |
| 3 | published through `accept()`, `202 { operationId }`, refusal on the operation | step 4; the controller row of the map; `typescript/CLAUDE.md` "a refused command never reaches `refuse()`" | documented |
| 4 | `POST /{id}/pin`, `POST /{id}/unpin` as two acts | step 4 ("an action undone is a second act named after the undoing … never a `DELETE`"), confirmed by `yarn architecture verb act` | documented — the sentence the Rust run added |
| 5 | order on the port's docstring, adapters sort, the handler does not; "pinned first" keeps the saved order within each group | the `query` checklist; `typescript/CLAUDE.md` "Does the read side's order matter?" | documented; the within-group order is a product guess, written on the port |
| 6 | snapshot, column, both conversions, both SQL statements, both query adapters; the contract test as the proof | step 3 — "the `UPDATE` / `INSERT` are not in that sentence"; the round-trip case made to pin the note "so it would catch a missing column" | the sentence was incomplete → **fixed** (step 3 names the statements and the read models, and says the round-trip case must exercise the field) |
| 7 | domain tests in `test_note.py`, handler tests in `test_commands.py`, one contract case, e2e in `src/bootstrap` | steps 1, 2, 3, 4; the tests table | documented |
| 8 | one file per command, no new package, absolute imports | the `command` checklist; the `archive_note.py` / `restore_note.py` precedent | documented |
| 9 | `require_signed_in` + `_ensure_owner`, no `guard()` | the Guard row of the map; `guards.py`'s docstring | documented |

Every decision was made from the documentation or from the canonical code; two sentences were incomplete (the columns a new field reaches, the undoing act), and both are now in the guide.

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| **a behaviour that adds state is only half-described**: `__slots__`, the private constructor, `create()`'s default, `from_snapshot()` / `to_snapshot()`, the snapshot DTO, a property — found by reading `note.py` | real gap | step 1 lists them, and says a default on the snapshot keeps the tests' literals valid |
| **step 3's column list omits the repository's `UPDATE` / `INSERT` and the read models the SQLite queries build**; the contract test catches an omission only if its round-trip case exercises the new field | real gap, and a trap | step 3 completed, with "provided it exercises the new field" |
| several answers (an event needs no handler, order belongs to the port, `refuse_*()` maps kinds) live only in the TypeScript guide, in TypeScript vocabulary | findability across languages: the pointer works but costs a second guide in a second vocabulary | *Questions you will have, in Python words*: the seven most used answers, in this language's terms, the TypeScript list staying the full one |
| **`yarn architecture checklist` with no kind prints `usage:` and exits 1 without the kinds**; the Python guide names the command without listing them | tooling and guide | the CLI's usage names the kinds; the guide lists them |
| **the feature skill is TypeScript-only**: it names `conventions/typescript.yaml`, the six `yarn` checks, and `can-import`, which answers "Could not find config file" from `python/` | real gap in a file the root guide points agents at | the skill names the binding of the language worked in, each language's checks, and `can-import` per language; **`uv run python -m tools.conventions can-import <file> <module> …` now exists**, asking the same table the check holds every import to, with a test |
| should a snapshot field have a default? | decided from two existing defaults; a reasonable guess | step 1 says it |
| archiving a pinned note; unpinning an archived one | product ambiguity, decided like restore | step 1 |
| `pinned` on `NoteDetail`, not on `SharedNoteListItem` | a product guess, well reasoned (a pin is the owner's) | none |
| the HTMX front end left alone, on step 4's sentence | what worked | none |
| **the README's *Known gaps* still said "Three contexts of the reference are not here"**, against its own first paragraph | a stale sentence from the first increment, which four increments walked past | removed; the opening paragraph no longer counts the commands, which every feature would make wrong |
| `repositories.py` docstring fragment ("The in-memory one It knows nothing") | cosmetic, true | fixed |
| the untouched `GetMyNotesQueryHandler` has no test, while the `query` checklist asks one "when the handler holds a visibility or role rule" | a fair reading: `require_signed_in` is the kernel's guard, not a rule of the handler; the checklist means a rule of the handler's own, as `GetNote`'s visibility | none |
| `ruff format --check` failed on the agent's own doubled newlines; `uv` warned on a deprecated variable | harness, not repository | none |

## Against the two other runs

The same request on the TypeScript guide ([2026-09-29](2026-09-29-pin-note.md)) found three findability issues and four content gaps; on the Rust guide ([2026-10-18](2026-10-18-pin-note-rust.md)) one tooling defect and one content gap. On the Python guide, written with both behind it, every decision landed from the documentation; what the run found is of a third kind: two sentences that were *incomplete* rather than missing (a new field's reach through the layers, which the compiler enumerates in Rust and the schema forces in TypeScript, and which in Python only a test exercising the field can catch), a stale paragraph, and a skill written for one language in a repository that now has three. The agent read 28 files, used the contract's CLI four times, and reported that nothing refused anything while writing — the same observation as the Rust run, for the opposite reason: there, the compiler had already said everything; here, the guide had.

## Numbers

About 40 minutes of agent time (45 % reading, 35 % writing, 20 % verifying and the report). 188 tests from 172: domain 7, handlers 6, contract 1 × 2 adapters, end to end 1. Zero refusals from the check, the linter, the type checker or the format while writing.

## Verdict

The shape landed right at every layer, in the language whose guide was written last and leans on the two others. The documentation's content held; what it lacked were the ends of two sentences and a list the reader had to fetch from another language. The follow-up carries the seven sentences, the Python *Questions*, the `can-import` of the Python tool, the CLI's usage, the language-aware skill, the stale paragraph's removal, and this record.
