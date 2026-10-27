# 2026-10-27 — "Pin a note", in Go

**Base:** the Go implementation complete, at `8d6582c` (PR #64, every concept of the map shown, the shared API scenario green against the four servers). **Agent:** Claude, fresh session, isolated worktree, nothing but the repository, told not to read `docs/evaluations/` and to read the guides from disk. **Language:** Go, the first run on [`go/CLAUDE.md`](../../go/CLAUDE.md). **Result branch:** [`eval/pin-note-go`](https://github.com/jgaNet/clean-ddd/tree/eval/pin-note-go) (commit `39e6f2a`, 17 files, +538/−28; not merged — it is an exercise, and archive/restore already teach that shape).

## The request

The request of the [first TypeScript run](2026-09-29-pin-note.md), of the [Rust run](2026-10-18-pin-note-rust.md) and of the [Python run](2026-10-20-pin-note-python.md), verbatim, so that the four guides can be compared on the same feature:

> Users want to pin a note. A user can pin one of their own notes and unpin it later. Pinning an archived note is not allowed. In 'my notes', pinned notes come first. That's all.

One difference with the three earlier runs, stated before the result: the Go guide was written after them and carries their fixes, so three of its sentences name this very feature (`pinned` as the example of a new attribute, "an act undone (restore, unpin) is not gated by `ensureActive()`", "a toggle is two acts (`/pin` and `/unpin`)"). On those three decisions the run tests findability, not content; the other six, and the tooling, are tested as before.

## Scorecard (rubric written before the run; verified by the grader on the diff, checks re-run)

| Area | Expectation | Result |
|---|---|---|
| Domain | `Pin()` / `Unpin()` on `Note`: `ensureOwner` → `ensureActive` → not already pinned, `error` returned, `Record()` inside the behaviour | PASS — `Pin()` reuses `ensureActive()`; `Unpin()` is not gated by the status, like `Restore()`, and the aggregate's doc comment says why |
| Domain | `NoteAlreadyPinned`, `NoteNotPinned` constructors in `exceptions.go`; "cannot pin archived" reuses `NoteArchived` | PASS |
| Domain | `NotePinnedEvent` / `NoteUnpinnedEvent` embedding `domain.DomainEvent`, past tense, recorded by the behaviour | PASS |
| Domain | `pinned` field: `Create()` starts unpinned, `FromSnapshot()` / `ToSnapshot()`, the snapshot, a `Pinned()` method; `FromSnapshot()` records nothing | PASS — the round trips widened to exercise it |
| Domain | tests in `note_test.go` beside the aggregate | PASS — 8 cases, with an `aPinnedNote()` helper beside `anArchivedNote()` |
| Application | `pin_note.go`, `unpin_note.go` copied from `edit_note.go`: command struct + handler, `RequireSignedIn` → load → behaviour → `Save` → `PublishDomainEvents` → `Nothing` | PASS |
| Application | tests in the fixture of `commands_test.go`, happy path + a refusal per handler | PASS — 7 cases (not owner, archived, not pinned, unknown note) |
| Application | no reaction, no integration event | PASS |
| Application | `ListItem` gains `Pinned`; the order on `FindByOwner`'s doc comment; the handler does not sort | PASS — "lists the pinned notes first, then the others, each group in the order they were saved … a query handler never sorts"; `Detail` gains it too |
| Infrastructure | both queries adapters order pinned first; both repositories persist it; SQLite column, `toRow()` / `scanNote()`, `INSERT` and `UPDATE` | PASS — `slices.SortStableFunc` in memory, `ORDER BY pinned DESC, rowid` in SQL; `pinned INTEGER NOT NULL` |
| Infrastructure | contract test extended, over both adapters | PASS — one ordering case (pin, then unpin), the round-trip and detail cases now pin |
| Presentation | `POST /{id}/pin`, `POST /{id}/unpin` through `presentation.Accept` → 202; no new line in `refuseNotes()` | PASS |
| Presentation | the views gain `pinned` with a camelCase tag | PASS — list and detail |
| Presentation | e2e: pin → first; pin an archived note → operation `ERROR`; through `app.Accepted` | PASS — one case covering twice, archived, a stranger, anonymous, unpin, unpin twice; the existing case now expects the fourth field |
| Wiring | two `application.Command(...)` lines, nothing else | PASS |
| Hygiene | the five checks green; no `//nolint`, no `fmt.Println`, no dropped error | PASS |
| Hygiene | nothing under the protected trees edited; feature mode; conventional commit | PASS — a plan under `conventions/plans/`, which the mode allows; `mode feature --base working --language go`: "the 18 changed file(s) are within it" |

Grader's re-run from the worktree: `go run ./tools/conventions` ✓ (204 files, 611 imports, 4 contexts) · `gofmt -l` empty · `go vet` ✓ · `golangci-lint run` 0 issues · `go test ./...` 273 `=== RUN` lines from 254, 0 failures · `plan validate` "legal against the go binding (3 changes, context Notes)".

## The nine decisions: documented, or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | rule in the aggregate, `error` refusal through the `ensure*` helpers; `NoteArchived` reused; unpin not gated | `go/CLAUDE.md` step 1, three sentences quoted | documented (two of them name the feature: findability, passed) |
| 1b | does archiving unpin? | guessed (no; `TestArchiveKeepsThePin` makes the choice explicit) | product ambiguity, as in every run of this request; not a docs gap |
| 2 | two events, nothing handles them, no integration event | *Questions*: "Does every domain event need a handler? No." | documented |
| 3 | published through `Accept`, `202 { operationId }`, refusal on the operation | step 4; *Questions*: "a refused command never reaches it, it is on the operation" | documented |
| 4 | `POST /{id}/pin`, `POST /{id}/unpin` | *Questions*: "A toggle is two acts (`/pin` and `/unpin`), never a `DELETE`"; `architecture verb act` | documented (names the feature: findability, passed) |
| 5 | order on the port's doc comment, adapters sort, the handler does not; `pinned` exposed on the views | *Questions*: "Does the read side's order matter?"; step 3 on a read-model field — "partly guessed" whether to expose the field at all, given "That's all" and the scenario | documented for the mechanism; the consequence on the shared API was not in any guide → **fixed** (below) |
| 6 | column, `toRow()` / `scanNote()`, `INSERT` and `UPDATE`, both read models; the contract test's `adapters` table as the proof | step 3, quoted in full | documented |
| 7 | aggregate tests in `note_test.go`, handlers in `commands_test.go`, the order in the contract test, the flow in `bootstrap/notes_routes_e2e_test.go` | *Questions*: "Where does the test go?" | documented |
| 8 | one file per command in `commands`, named by module path; no re-export | *Questions*: "No barrel, no re-export: the module file names the package of each handler it lists" | documented |
| 9 | `RequireSignedIn` at the top of `Execute()`, `ensureOwner` in the aggregate | README map, Guard row; `checklist command` | documented |

Every decision but the product ambiguity was made from the documentation; the one "partly guessed" is the finding of the run.

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| **The shared API scenario fails against the Go server once `pinned` is on the list item**: `api/scenario.mjs` deep-equals the shapes, and the agent found two sentences that pull apart — API-ONE-SURFACE's "fix the server that differs, never the scenario" and ADR 16's "a route added to one server fails the scenario against the other two until they have it" — and no guide saying what a feature written in one language does about it. It followed ADR 16, did not touch the scenario, and reported the deliberation | **a real gap, and the first time it could appear**: the three earlier runs of this request predate the scenario (PR #62), and the Rust cross-context run changed no response shape. The two sentences do not contradict each other — the server that differs is the one *without* the feature — but a reader writing a feature in one language cannot know that from the rule's wording | step 4 of the four guides now says it: the e2e suite and the scenario assert the exact shape of every response, field count included; a feature that changes what a client sees fails the scenario against this server until the other languages carry it, which is the point of ADR 16; the feature is done in its language when its e2e suite proves it, and the scenario is then the list of what the other languages owe. The feature skill says the same in one line |
| `len(list[0]) != 3` in the existing e2e case counts the fields of a list item, so a new read-model field changes a test that is not about the feature | the count is the same strictness as the scenario's, on purpose; the guide did not say the e2e suite asserts the exact shape | the same sentence ("field count included") |
| the plan's file name for a language (`pin-a-note.go.yaml`) was inferred from `share-a-note.rust.yaml`; the Go guide links no example; `crossContext` omitted and accepted without a note | findability (the Rust guide links the example; the Python and Go guides did not), and `crossContext` is optional by design (`plan.ts`) | the Go and Python guides link the example, name `<feature>.<language>.yaml` and say `crossContext` is for a feature that crosses one |
| does archiving unpin? | product ambiguity, decided and tested in the aggregate | none |
| whether to expose `pinned` at all, given "That's all" | the request's wording, as in the TypeScript run; the agent exposed it because "a list ordered by a fact it hides is useless to a client" | none; the sentence above says what exposing it costs |
| `gofmt` refused one line once (`"/notes"+second` → `"/notes" + second`); `gofmt -w` fixed it | the check did what the guide promised | none |
| `yarn` refused Node 22 (`>=24` in `engines`); `--ignore-engines` made every command work; `mode feature --base working` counted the untracked `node_modules` symlink of the worktree | harness, not repository | none |
| the 45 KB `go/README.md` had to be read in two slices | harness | none |
| compiler, `go vet`, `golangci-lint`, `tools/conventions`, sandbox | nothing refused, on the first run of each | none |

## Against the three earlier runs

The same request found three findability issues and four content gaps on the TypeScript guide, one tooling defect and one content gap on the Rust guide, two incomplete sentences on the Python guide; on the Go guide, written last and carrying all of those fixes, it found one content gap, and a new one: the first consequence of ADR 16 on a feature written in one language. That finding is not Go's; it is the reference's, and the sentence went into the four guides. The agent read the Go guide, the TypeScript *Questions* list it points to, ADR 16 and the Notes section of the scenario; it ran the scenario on its own, which no rule asked of it, and that is how the gap surfaced. On the three decisions the guide pre-answers, it quoted the sentence each time.

## Numbers

About 30 minutes (15 reading, 10 writing, 5 checks, plan and commit; the report on top). 273 `=== RUN` lines from 254: aggregate +8, handlers +7, contract +1 case over 2 adapters, e2e +1. Zero refusals from the compiler, the check, the linter or the format while writing; one from `gofmt`, fixed by `gofmt -w`.

## Verdict

The shape landed right at every layer, from a guide that is a page long and sends its reader to the TypeScript list for the questions. The finding is one the earlier runs could not make: once the four languages answer one API and a scenario holds them to it, a feature in one language is incomplete by construction, and the guides had not said so. They do now, in a sentence that names the cost and what settles it. The follow-up carries that sentence, the plan's naming, and this record.
