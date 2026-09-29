# 2026-09-29 — "Comments on a shared note" (child entity or own aggregate?)

**Base:** `main` at `4d98766`. **Agent:** Claude, fresh session, isolated worktree. **Result branch:** [`eval/note-comments`](https://github.com/jgaNet/clean-ddd/tree/eval/note-comments) (commit `0e3731b`, 26 files, +702/−14; not merged).

## The request

> People a note is shared with should be able to leave comments on it, and everyone who has access to the note — the owner and the other people it's shared with — should be able to read the comments. A comment is at most 500 characters.

Chosen to exercise the modelling decision the guide had answered only for *aggregate vs context*: is a comment part of the note, its own aggregate, or a new context?

## Scorecard

| Expectation | Result |
|---|---|
| the modelling decision stated with the repository's criterion | **PARTIAL** — chose a child entity `NoteComment` inside `Note`, from the README's *Entity inside an aggregate* row and `DeliveryAttempt`'s doc comment; the rubric expected its own `Comment` aggregate with a domain service for access. The agent named the trade-off (unbounded growth) itself. The guide gave no criterion → docs gap, not an agent error |
| 500 characters in a value object; who may comment in the aggregate; refusals as `Result` | PASS — `NoteCommentText`, `NotNoteRecipient`, `ensureActive()` extended |
| event recorded by the aggregate, unhandled | PASS — `NoteCommentedEvent` |
| command via `accept()` → 202; query synchronous, `refuse()` → 404 for a reader without access, same rule as `GetNote` | PASS |
| `POST /notes/:id/comments`, `GET /notes/:id/comments`, schemas | PASS |
| read model + port method in `INoteQueries.ts` with order and unknown-id behaviour in JSDoc | PASS |
| snapshot, SQLite JSON column, reconstitution throws on corrupted comment, contract spec extended over both adapters | PASS — including reviving `postedAt` from JSON |
| specs beside their files (VO, aggregate, handlers, a query-handler spec through `handle()`), e2e with fresh accounts; no new barrel | PASS — 156 unit / 25 e2e (from 135 / 21); re-run by the grader |
| hygiene; six checks | PASS |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | child entity in `Note`, Notes context | README *Entity inside an aggregate* row; CLAUDE.md "when in doubt, stay in the context" | the context is right; child-vs-aggregate was decided from the only criterion available (has identity, exists only inside). The guide never states the aggregate-boundary criterion → **fixed** (step 1 and the README row) |
| 2 | VO for the text; access rule in `Note.comment()`; visibility in the query handler | CLAUDE.md step 1, README Invariant and Guard rows, `GetNoteQueryHandler` | documented |
| 3 | one event, no handler | CLAUDE.md | documented |
| 4 | 202 / 200 / 404 | CLAUDE.md step 4 and the `refuse()` question | documented |
| 5 | `POST /notes/:id/comments` | analogy with `/tags`; creation under a sub-resource **guessed** | **fixed** (verbs question) |
| 6 | separate endpoint rather than comments in `NoteDetail` | two documented-compatible shapes | fine either way |
| 7 | snapshot + JSON column; `Date` revived | contract spec; nothing on dates in JSON | **fixed** (comment in `NotesTable.ts`) |
| 8 | a query-handler spec because it holds a visibility rule | CLAUDE.md silent on query handlers | **fixed** (spec rule extended) |
| 9 | recipients comment, everyone with access reads; owner refused | the request's two sentences | product reading; stated in code and spec |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| entity, value object or own aggregate? CLAUDE.md step 1 lists behaviour / domain service / value object, not child entity, and gives no boundary criterion | real gap, the important one | CLAUDE.md step 1: when a thing is a child entity and when it is its own aggregate (consistency, size, writers, lifecycle); README row reworded |
| may the owner comment? | product | none |
| comment on an archived note? | product; decided from the `Note.ts` doc line | none — the round-1 fix worked |
| a timestamp, and a `Date` inside a JSON column | small gap | `NotesTable.ts` comment |
| one port method or two for the read | two documented shapes | none |
| creation under a sub-resource path | real gap | verbs question |
| may a behaviour return the child it created? | precedent (`Note.create()` returns the note) | none; reasonable |
| do query handlers with a visibility rule need a spec? | real gap | spec rule now says so |
| harness (stale CLAUDE.md, missing `node_modules`) | harness | already covered |

## Numbers

About 35 minutes (12 reading). Read: README, CLAUDE.md, `conventions/README.md`, the evaluation docs, ADRs 4 and 5, every file of Notes, the Notifications child-entity files, the shared kernel building blocks.

## Verdict

Everything below the modelling decision was right, and the modelling decision was made *from the documentation*: the guide pointed at `DeliveryAttempt` as the example of an entity inside an aggregate and gave no reason to look further. Whether comments should be their own aggregate is the kind of question a reference on DDD must answer in words, not leave to be inferred from the one child entity it happens to contain. It does now.
