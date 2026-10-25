# 2026-10-25 — "Notify the recipients when a shared note is archived", in Rust (cross-context reaction)

**Base:** the front end decoupled and the shared API scenario in, at `8eff373` (PR #63). **Agent:** Claude, fresh session, isolated worktree with its own `target/`, nothing but the repository, told not to read `docs/evaluations/` and to read the guides from disk. **Language:** Rust, the second run on [`rust/CLAUDE.md`](../../rust/CLAUDE.md). **Result branch:** [`eval/archived-note-notification-rust`](https://github.com/jgaNet/clean-ddd/tree/eval/archived-note-notification-rust) (commit `6242cc8`, 12 files, +312/−17; not merged).

## The request

The request of the [TypeScript cross-context run](2026-09-29-archived-note-notification.md) and of the [Python one](2026-10-21-archived-note-notification-python.md), verbatim:

> When the owner archives a note that was shared with other people, those people should be notified that the note is no longer available. Nothing else changes.

## Scorecard (rubric written before the run; verified by the grader on the diff, checks re-run)

| Expectation | Result |
|---|---|
| no new route; no `presentation` crate touched | PASS |
| `NoteEvent::Archived` widened by the aggregate with what the consumer needs (`title`, `owner_id`, `recipient_ids`), built in `archive()` from the aggregate's own state; nothing queries back | PASS — with a doc line on the variant saying why it carries who had access; `shared_with` kept for a restore, and tested |
| a new contract in `note_integration_events.rs`, in Notes' public words, complete for the consumer, with its published name, published whenever the fact happens | PASS — `NoteIntegrationEvent::Archived { note_id, title, owner_id, recipient_ids }`, `ARCHIVED = "NoteArchivedIntegrationEvent"`, published with an empty list too |
| a domain event handler in Notes translating to it, shape of `note_shared_handler.rs` | PASS — `note_archived_handler.rs`, copied one to one, with its test |
| an anti-corruption handler in Notifications delivering through `NotificationDelivery`, one notification per recipient, depending on the shared kernel only | PASS — a loop over `recipient_ids`, `?` on each delivery, `Ok(())`; two tests (two recipients in order; nobody) |
| registered on both sides: `Subscription::reaction("NoteArchived", …)` in Notes, `Subscription::reaction(NoteIntegrationEvent::ARCHIVED, …)` in Notifications | PASS |
| tests beside their files: the richer payload in `note/mod.rs`, the fixture of `commands/mod.rs` widened (the new channel in its list), a test module in each handler file | PASS — the archive case rewritten to share first and assert the whole payload; the fixture subscribes `"NoteArchived"` and the refusal asserts nothing was published |
| e2e: share, archive, the recipient's inbox has it | PASS — appended to the sharing case: `metadata.noteId`, `source == "Notes.NoteArchived"`, the note `ARCHIVED` and still `sharedWith: [bob]` |
| no guard on the event handlers | PASS |
| four cargo checks green; no `allow`, `println!`, `unwrap()` outside tests; nothing under the protected trees; feature mode within | PASS — `yarn architecture mode feature --base 8eff373 --language rust`: "the 12 changed file(s) are within it" |

Grader's re-run from the worktree: `cargo run -p conventions` ✓ (26 crates, 4 contexts) · `cargo fmt --check` ✓ · `cargo clippy --all-targets -- -D warnings` 0 · `cargo test` 149 (from 146) · feature mode ✓.

## The nine decisions: documented, or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | no new rule; the only domain change is the event's payload | `rust/CLAUDE.md` step 1; `typescript/CLAUDE.md` "An existing event needs more data for a new consumer?" | documented, in the other language's guide → **the answer is now in a Rust list** |
| 2 | widen `NoteEvent::Archived`; a second variant of the contract enum carrying `recipient_ids`, published with an empty list too; translate in Notes, consume in Notifications | the same TypeScript question, quoted; step 6; the `integration-event` checklist ("a payload carrying everything a consumer needs, so it never queries back") | documented through the pointer → now in Rust words |
| 2b | `let … else { return Ok(()) }` in the *existing* `NoteSharedHandler`, whose pattern a second variant made refutable | learned from the compiler and from `account_validated_handler.rs` | **a real gap**, Rust's own: an enum per contract (ADR 12) means a second fact edits every consumer of the enum → **fixed** (a question says so, and that editing the canonical consumer for that line is expected) |
| 2c | wording, channel (`WEBSOCKET`), the `archivedBy` metadata key | guessed by precedent (`NoteSharedHandler`) | product choices; none |
| 3 | published, asynchronous; `202` unchanged | ADR 6 / CTX-CONTRACTS; the `NoteShared` path | documented |
| 4–6 | no route, no read model, no persistence: `shared_with` is already in the snapshot and the table; the contract test re-run to be sure | step 3 "only if a port changed"; step 4's `/archive` + `/restore` | documented |
| 7 | aggregate → `note/mod.rs`; handler fixture in `commands/mod.rs`, with the new channel in its list, as the guide warned; a `mod tests` in each handler; the flow appended to the sharing e2e case, after the unknown-account refusal, since an archived note would refuse that share with `NoteArchived` | README "Tests, one style per layer"; step 2's warning on the fixture's channels; the `event-handler` checklist; step 4 | documented |
| 8 | one `pub mod` and one `pub use` per `events/mod.rs` | the existing files; "step 2 says it for `commands/mod.rs` only, followed by analogy" | findability → **fixed** (a *Module declarations* question) |
| 9 | no guard on either handler | `typescript/CLAUDE.md` "Do event handlers need a guard?"; the `event-handler` checklist | documented → now in the Rust list too, with what a fan-out handler answers |

Every decision but the `let-else` was made from the documentation; the decisive sentences lived in the TypeScript guide, a pointer away, as the Python run had found for its language.

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| the Rust guide delegates its *Questions* to TypeScript; the decisive sentence for this feature (widen the event, carry the list, fan out in the consumer) lives only there, and "a Rust reader who skipped that pointer would guess" | findability across languages, the same finding as the Python cross-context run; the first Rust run had only pointed at the list | a *Questions you will have, in Rust words* section: the nine answers a Rust reader reaches for most |
| **a second variant in a contract enum breaks the canonical consumer**: `NoteSharedHandler`'s irrefutable `let` no longer compiles; "nothing says a second fact in a contract file touches every existing consumer of that enum" | **a real gap, specific to Rust**: the TypeScript and Python contracts are one class per fact, the Rust contract is one enum per publishing context (ADR 12) | the *second fact in a contract enum* question, naming the `let … else` shape and the file that shows it |
| `mode feature --base <ref>` reported "0 changed file(s)" before the commit; `--base working` counted the harness's `typescript/node_modules` symlink | the first is correct and documented in the guide (`--base working` for uncommitted changes); the second is the harness (a symlink is not matched by `node_modules/` in `.gitignore`) | none |
| "a plan is worth writing when a feature crosses a context", but `conventions/plans/` sat under the trees the rules of engagement forbade, so the agent skipped the plan | a contradiction in the **protocol**, not the guide: the feature mode allows `conventions/plans` (`allowed:` in the contract) | the rules of engagement now except a plan under `conventions/plans/` |
| `rust/README.md` and the Notifications wiring doc counted "the four anti-corruption handlers"; the agent changed the one it could | a count every feature of this kind makes wrong, as the Python run found for its language | both counts dropped |
| the Rust guide says `checklist <kind>` and names no kind; `integration-event` and `event-handler` were found by running `checklists` | findability | the kinds named on the commands line, as the Python guide does |
| `events/mod.rs` also re-exports with `pub use`, which only the file said | findability | the *Module declarations* question |
| metadata keys (`noteId`, `sharedBy`, `source`) are an undocumented convention | a product convention the precedent shows; the e2e suites assert `metadata.source` | none |
| `grep "^kinds:" conventions/architecture.yaml` found nothing | the section is `checklists:`; the CLI answered anyway | none |

## Against the TypeScript and Python runs

The same request on the TypeScript guide found four modelling gaps and wrote the questions that answer them; on the Python guide the questions were a pointer away and the run found two tooling defects. On the Rust guide the pointer held again, every modelling decision landed, and the run found the one thing a pointer to another language cannot say: what the Rust idiom costs. An enum per contract is ADR 12's choice; its consequence — a second fact edits every consumer of the enum — was in no guide, and is now in the Rust list, next to the answers the other two runs had already written for their languages.

## Numbers

About 40 minutes of agent time. 149 tests from 146: the translating handler 1, the anti-corruption handler 2; the aggregate's archive case and the fixture's two archive cases rewritten rather than added; the sharing e2e case widened. Zero refusals from the check, the linter, the formatter or `clippy` while writing; one from the compiler (the refutable pattern), which is the finding.

## Verdict

The cross-context path landed right on both sides, each knowing only the contract, in the shape the three guides share. What the run found is Rust's own: the cost of an enum per contract to its existing consumers, now written down, and the Rust guide now holds its own answers to the questions every cross-context feature raises instead of pointing at another language's. The follow-up carries the Rust list, the kinds, the dropped counts, the protocol's plan exception, and this record.
