# 2026-10-18 — "Pin a note", in Rust

**Base:** the Rust implementation complete, at `82cc2c8` (PR #59, every concept of the map shown). **Agent:** Claude, fresh session, isolated worktree, nothing but the repository, told not to read `docs/evaluations/` and to read the guides from disk. **Language:** Rust, the first run on [`rust/CLAUDE.md`](../../rust/CLAUDE.md). **Result branch:** [`eval/pin-note-rust`](https://github.com/jgaNet/clean-ddd/tree/eval/pin-note-rust) (commit `6ee895a`, 15 files, +537/−21; not merged — it is an exercise, and archive/restore already teach that shape.

## The request

The request of the [first TypeScript run](2026-09-29-pin-note.md), verbatim, so that the two guides can be compared on the same feature:

> Users want to pin a note. A user can pin one of their own notes and unpin it later. Pinning an archived note is not allowed. In 'my notes', pinned notes come first. That's all.

## Scorecard (rubric written before the run; verified by the grader on the diff, checks re-run)

| Area | Expectation | Result |
|---|---|---|
| Domain | `pin()` / `unpin()` on `Note`, owner → active → not already pinned, through `?` on the `ensure_*` helpers, `DomainResult` never panic | PASS — `pin()` reuses `ensure_active()`; `unpin()` is not gated by the status, like `restore()` |
| Domain | kinds as a `const` + constructor in `note_exceptions.rs` | PASS — `NOTE_ALREADY_PINNED`, `NOTE_NOT_PINNED`; "cannot pin archived" is the existing `NOTE_ARCHIVED` |
| Domain | `NoteEvent::Pinned` / `Unpinned` variants, past tense, recorded by the behaviour | PASS — `NotePinned`, `NoteUnpinned` |
| Domain | snapshot gains `pinned`; `create()` starts unpinned; `from_snapshot()` records nothing | PASS |
| Domain | tests at the bottom of `mod.rs` | PASS — 7 cases in `mod pinning_and_unpinning`, the round trips widened |
| Application | `pin_note.rs`, `unpin_note.rs`: command with `NAME`, `Output = ()`, `kind() = Command`; handler generic over the repository, `require_signed_in` → load → behaviour → save → publish | PASS — copied from `edit_note.rs` |
| Application | `pub mod` lines; tests in the shared fixture, in-memory repository as double | PASS — 4 + 3 cases in `commands/mod.rs` |
| Application | no reaction subscribed to the new events | PASS |
| Application | `NoteListItem` gains `pinned`; the order promised on the port's doc comment | PASS — `find_by_owner`: "Pinned notes first, then the others; within each group, in the order they were saved" |
| Infrastructure | both queries adapters order pinned first; both repositories persist it; SQLite column | PASS — stable `sort_by_key(!pinned)`; `ORDER BY pinned DESC, rowid`; column, `to_snapshot`, `INSERT` and `UPDATE` |
| Infrastructure | contract test extended, over both adapters | PASS — one new ordering case, the equality case now pins |
| Presentation | `POST /{id}/pin`, `POST /{id}/unpin` through `accept()` → 202; no new `refuse()` line | PASS |
| Presentation | `NoteListItemView` gains `pinned` | PASS — and `NoteDetailView` |
| Presentation | e2e: pin → first; pin an archived note → operation `ERROR`; followed through the Tracker | PASS — one case in `notes_routes.rs`, the first case widened |
| Wiring | two `Subscription::command(...)` lines, nothing else | PASS |
| Hygiene | the four `cargo` checks green; no `allow`, `println!`, `unwrap()` outside tests | PASS |
| Hygiene | nothing under the protected trees edited; conventional commit | PASS — `yarn architecture mode feature --base 82cc2c8`: "the 15 changed file(s) are within it" |

Grader's re-run from the worktree: `cargo run -p conventions` ✓ (26 crates, 4 contexts) · `cargo fmt --check` ✓ · `cargo clippy --all-targets -- -D warnings` 0 · `cargo test` 161 (from 145) · feature mode ✓.

## The nine decisions: documented, or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | rule in the aggregate, `DomainResult` refusal, `ensure_*` helpers | `rust/CLAUDE.md` step 1; `rust/README.md` "a refusal is a value" | documented |
| 1b | reuse `NOTE_ARCHIVED` for "cannot pin archived" | `typescript/CLAUDE.md` "one exception per rule the user could act on differently" — the Rust guide said only "one exception per rule" | documented in the other language's guide → **fixed** (the Rust sentence now says it, with the `ensure_active()` example) |
| 1c | may an *archived* note be unpinned? | guessed (allowed, like restore; stated in the aggregate's doc and tested) | product ambiguity, as in the TypeScript run; not a docs gap |
| 2 | two variants, nothing handles them, no integration event | step 1; `typescript/CLAUDE.md` "Does every domain event need a handler? No" | documented, through the pointer to the TypeScript questions → the pointer now names that list and links it |
| 3 | published through `accept()`, `202 { operationId }`, refusal on the operation | step 4; the `command` checklist | documented |
| 4 | `POST /{id}/pin`, `POST /{id}/unpin` as two `act`s | `yarn architecture verb act`; step 4; the `/archive` + `/restore` precedent — "partly guessed: the grammar has no 'undo an action' row" | real gap → **fixed** (step 4: an action undone is a second `act`, never a `DELETE`) |
| 5 | order on the port's doc comment, adapters sort, the handler does not | `typescript/CLAUDE.md` "Does the read side's order matter?"; the `query` checklist; the existing doc line on `find_by_owner` | documented |
| 6 | snapshot, column, both adapters; the contract test as the proof | step 3; README tests table; `notes_table.rs` header on migrations; "the compiler enumerated every literal to update" | documented |
| 7 | domain tests in `mod.rs`, handler tests in the fixture, contract case, e2e in `src/bootstrap/tests` | steps 1, 2, 3, 4 | documented |
| 8 | a `pub mod` line each, no re-export | step 2; `ports/mod.rs` "no barrel re-exports them" | documented |
| 9 | `require_signed_in` + `ensure_owner`, no `guard()` | README map, Guard row; the `command` checklist | documented |

Every decision but one was made from the documentation; the one "partly guessed" (the undo verb) landed right by precedent, and the sentence that settles it is now in the guide.

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| **`yarn --cwd ../typescript architecture checklist command` answered in TypeScript** (`index.ts`, `module.local.ts`), with or without a `--language` flag, while the Rust guide promised an answer "in Rust … in snake_case"; the agent read the binding's `checklists:` instead | **a real defect in the tooling**: the CLI always loaded the TypeScript binding; the plan commands were language-aware, the rest was not | the CLI now answers for the language the command was typed in (`INIT_CWD` under a binding's root) or the one `--language <id>` names, with an `unknown-language` error; a spec pins the three cases; the Rust guide says both |
| `yarn architecture mode feature` with no `--base` reported the PR's own changes (three files) before any code; `--base working` was found in the TypeScript guide only; the Rust guide never mentions `mode` | the default base is `origin/main`, which this branch is ahead of: correct, but unsaid in the Rust guide | `mode feature --base <ref>` added to the Rust guide's commands, with the default and `--base working` |
| is a plan expected? the guide mentions `plan validate` in passing | findability | "a plan is optional", and when it is worth writing, said in the intro of the steps |
| no grammar row for undoing an action | real gap | step 4 |
| pin × archive unspecified | product ambiguity, decided and documented in code | none |
| "one exception per rule" vs the TypeScript guide's "per rule the user could act on differently" | the Rust wording lost the criterion | aligned, with the `ensure_active()` / `NOTE_ARCHIVED` example |
| step 7 (the map) conflicts with "do not edit `conventions/`" | the step did not say when the map changes | step 7: a second use of a shown kind is not a new example |
| HTMX front end: no pin control, on the TypeScript guide's "not a second client to keep in parity" | the Rust guide did not say it | step 4 |
| the test fixture's recording handler is subscribed per channel: a new fact is invisible to `published()` until its name is listed, and an `is_empty()` assertion passes for nothing | real gap, in the code and the guide | a comment in the fixture; step 2 |
| the TypeScript guide's "Questions you will have" answered four decisions almost verbatim | what worked | the Rust guide's pointer to it now names and links the list |
| sandbox and tooling | nothing refused | none |
| the grader shared one `CARGO_TARGET_DIR` between the worktree and the main checkout to save a build, and the main checkout then compiled against the worktree's `notes-domain` (a `pinned` field that did not exist there) until `cargo clean -p` | harness, not repository: a path dependency's artifacts are not keyed by the worktree | the protocol's worktree keeps its own target directory |

## Against the TypeScript run

The same request on the TypeScript guide ([2026-09-29](2026-09-29-pin-note.md)) found three findability issues and four content gaps; on the Rust guide, written fourteen months of guide-fixes later and leaning on the TypeScript question list, it found one tooling defect, one content gap (the undo verb) and five sentences worth adding. Two of the Rust findings have no TypeScript counterpart because the idiom is different: the per-channel recorder of the Rust fixture, and the `--language` the shared CLI needed once there were two bindings. The agent read 15 files of the Notes context and the Rust guide in full, and reported that the compiler found every literal a new field touches — the thing the TypeScript run had needed the contract test for.

## Numbers

About 45 minutes (15 reading, 5 tooling and baseline, 10 writing, 5 checks and commit, 10 report). 161 tests from 145: domain 34 (+7), application 25 (+7), contract 10 (+1), e2e 4 (+1). Zero refusals from the compiler, the check, the linter or the format while writing.

## Verdict

The shape landed right at every layer, in a language whose guide is a tenth of the TypeScript one and sends its reader to the other for the questions. The documentation's content held; the **tooling** it promised did not, for one command, and that is the finding of the run: a claim a guide makes about a tool is tested only when a reader believes it. The follow-up carries the CLI fix, the six sentences, the fixture's comment, and this record.
