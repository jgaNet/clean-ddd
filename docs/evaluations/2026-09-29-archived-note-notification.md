# 2026-09-29 — "Notify the recipients when a shared note is archived" (cross-context reaction)

**Base:** `main` at `30f7b94` (after the pin-note follow-up). **Agent:** Claude, fresh session, isolated worktree. **Result branch:** [`eval/archived-note-notification`](https://github.com/jgaNet/clean-ddd/tree/eval/archived-note-notification) (commit `38c9df3`, 12 files, +301/−6; not merged).

## The request

> When the owner archives a note that was shared with other people, those people should be notified that the note is no longer available. Nothing else changes.

Chosen to exercise what "pin a note" did not: the integration-event path, the anti-corruption layer, what one context may know about another, and a feature with no HTTP change at all.

## Scorecard

| Expectation | Result |
|---|---|
| no new route; Presentation untouched | PASS |
| `NoteArchivedEvent` payload widened by the aggregate with what the consumer needs (`title`, `ownerId`, `sharedWith`); nothing queries back | PASS — set in `Note.archive()` |
| a new contract in `@SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents.ts`, complete for the consumer | PASS — `NoteArchivedIntegrationEvent { noteId, title, ownerId, recipientIds }` |
| a domain event handler in Notes translating to it, shape of `NoteSharedHandler` | PASS — `NoteArchivedHandler` |
| an anti-corruption handler in Notifications delivering through `NotificationDelivery`, importing nothing of Notes | PASS — one notification per recipient, none when empty |
| registered on both sides in `module.local.ts` | PASS |
| specs beside their files; domain spec for the richer payload | PASS — 4 new specs/cases + the Archive refusal case the base was missing |
| e2e: share, archive, the recipient's inbox has it | PASS — fresh account, as the e2e header now instructs |
| boundaries and hygiene: lint 0, no `eslint-disable`/`any`/console/relative import | PASS |
| five checks green, docs untouched | PASS — 140 unit / 23 e2e (from 134 / 21); re-run by the grader |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | no new rule; the only domain change is the event payload | CLAUDE.md step 1, *Does every domain event need a handler?* | documented |
| 2 | widen the existing event rather than add `SharedNoteArchivedEvent` | ADR 6 ("never queries back"); **guessed** that widening is the expected move | real gap → **fixed** (new question) |
| 2b | one integration event carrying `recipientIds`, not one per recipient | **guessed** | real gap → **fixed** (same question) |
| 2c | publish even when shared with nobody | **guessed** | real gap → **fixed** (ADR 6 sentence, same question) |
| 2d | contract says `recipientIds`, domain event says `sharedWith` | **guessed** | real gap → **fixed** (ADR 6 sentence) |
| 3 | domain handler → contract → ACL; each side's knowledge | ADR 6, CLAUDE.md, the `NoteShared*` doc comments | documented |
| 4–6 | N/A: no route, no read model, no persistence | CLAUDE.md step 3 ("only if a port changed") | documented |
| 7 | specs beside their files; Archive refusal added | CLAUDE.md *Where does the spec go?* | documented — and it exposed that Archive had no refusal case on the base |
| 8 | no barrel; `Events/` has none | CLAUDE.md *Barrels?* | documented |
| 9 | nothing added; event handlers run in the publisher's context without a guard | **guessed from precedent** | real gap → **fixed** (new question) |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| widen an existing domain event for a new consumer, or add a second event? | real gap | CLAUDE.md, *An existing event needs more data for a new consumer?* |
| one integration event with a list, or one per recipient? publish when nobody cares? | real gap | same question; ADR 6 says the contract is published whenever the fact happens |
| contract vocabulary vs the aggregate's field names | real gap | ADR 6: the publishing context's public words |
| how an ACL fans out to several recipients (`deliver()` takes one) | minor | answered by the same question: fan-out is the consumer's business; a loop is fine |
| do event handlers need a guard? | real gap | CLAUDE.md, *Do event handlers need a guard?* |
| the Archive handler had no refusal case although CLAUDE.md says every handler has one | real hole | case added in this follow-up |
| "no longer available", yet an archived note still appears in the recipient's *shared with me* | product ambiguity | none here; worth a product decision (hide archived notes from recipients?) |
| the injected CLAUDE.md differed from the one on disk (Node ≥ 20, four checks) | harness | protocol: read from the worktree; quotes checked against the base commit |
| `PATH=$HOME/…` refused by the sandbox; `yarn` not in the Node bin dir | harness | none |

## Numbers

25–30 minutes. Read in full before writing: README, CLAUDE.md, ADR 6, the two evaluation documents, the `NoteShared*` handlers and specs on both sides, `NotificationDelivery`, `EventHandler.ts`, `EventTypes.ts`, both `module.local.ts`. No hesitation on: where the translator goes, where the ACL goes, where contracts live, registration, Result vs throw, spec placement, "no persistence work needed".

## Verdict

The cross-context path is the best-documented part of the repository: the agent placed every piece first time and lint confirmed the boundaries. What the docs lacked was **event design**: widening vs adding, list vs fan-out, publish-always, vocabulary, and the absence of guards on event handlers. All four are now one question in CLAUDE.md and two sentences in ADR 6.
