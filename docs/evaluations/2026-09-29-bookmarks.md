# 2026-09-29 — "Bookmarks", with the architecture contract at hand

**Base:** PR #47's branch `architecture-contract`, the commit that turned the two YAML files into a queryable contract (`yarn architecture …`). **Agent:** Claude, fresh session, isolated worktree, told not to read `docs/evaluations/` — and, for the first time, **told the contract CLI exists** and asked to account for its use. **Result branch:** [`eval/bookmarks`](https://github.com/jgaNet/clean-ddd/tree/eval/bookmarks) (commit `8e72865`, 27 files; not merged).

## The request

> Users want to bookmark notes they can see — their own, or ones shared with them. A note is in a user's bookmarks at most once. Users can list their bookmarks, most recent first, and remove a bookmark.

Chosen because the modelling answer (its own aggregate, not a set on `Note`) is one the guide now states in words, and because the feature needs a removal — something no existing use case does.

## Scorecard

| Expectation | Result |
|---|---|
| a `Bookmark` aggregate in Notes, not a collection on `Note`; the note's visibility and "at most once" in a domain service | PASS — `Bookmark`, `NoteBookmarking` using `Note.isVisibleTo()` and `IBookmarkRepository.findByAccountAndNote()`; quoted CLAUDE.md step 1 and the collection-fact question |
| commands → 202, query → 200, static list route before `/:id` | PASS — `POST` / `DELETE /notes/:id/bookmark`, `GET /notes/bookmarks` |
| new ports with in-memory adapters; a contract spec although there is one adapter, because an order is promised | PASS — quoted step 3 verbatim; the tie rule (same instant) discovered while writing the e2e and pinned |
| use of the contract accounted for | PASS — twelve commands pasted, each with what it added |
| every ESLint refusal names a rule | N/A — the linter refused nothing on the first run, which the agent attributes to `can-import` |
| hygiene, specs, six checks, docs untouched | PASS — 193 unit / 30 e2e (from 163 / 23); re-run by the grader |

## What the contract was worth, in the agent's words

- **`can-import` was the useful part**: "it answers for files that do not exist yet, so I could check my planned layout before writing a line" — it confirmed `Domain/Bookmark → Domain/Note/Note` is allowed, refused `handler → adapter` with `ARCH-APPLICATION` and a remediation, and refused `./Events/BookmarkEvents` from `Bookmark.ts` with `ARCH-RELATIVE`: "the one that could have caught a mistake before the linter". Six probes, twenty seconds, "zero doubt left". The linter then refused nothing.
- **`rule <ID>` and `concept <id>` restated the README** — which is by design: one source, rendered — except `rule CONC-OPTIMISTIC --json`, whose `references` named the contract spec and so told the agent the shape its own spec's version case should take.
- **Text for reading, `--json` for scripting**; the `rule` text output had a stray blank line (fixed).

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | own aggregate in Notes | CLAUDE.md step 1 (child entity vs aggregate), the context question | documented — the round-3 fix worked on a new case |
| 2 | rules in a domain service; refusal by `Result`; invisible note → `NoteNotFound` | the collection-fact question, `DOMAIN-RESULT`, `GetNoteQueryHandler`'s comment | documented |
| 3 | two events, no handler | CLAUDE.md | documented |
| 4 | 202 / 200 through `accept()` / `refuse()` | README, CLAUDE.md | documented |
| 5 | `DELETE /notes/:id/bookmark` | **guessed** — the verb list has no `DELETE` | real gap → **fixed** |
| 6 | order promised on the port, asserted by the contract spec; read model joins the note store for the title | CLAUDE.md order question; the join **guessed** | real gap → **fixed** (the read side may join stores) |
| 7 | contract spec with one adapter; no SQLite pair | CLAUDE.md step 3, README | documented — the round-4 sentence was used first time |
| 7b | **deleting an aggregate**: `repository.delete()` after `Bookmark.remove()` records the fact | **guessed**; found no example and found `DOMAIN-IDENTITY` saying "repositories only `findById` and `save`" while the Q&A allows `findByEmail` / `countByOwner` | a real contradiction in the contract → `DOMAIN-IDENTITY` reworded; a question on deletion added |
| 8 | specs beside files; shared handler spec; no barrel | CLAUDE.md | documented |
| 9 | `requireSignedIn(context, 'Notes')`; owner check in `Bookmark.remove()`; list scoped by the caller's id | `Guards.ts`, README Guard row | documented |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| `DOMAIN-IDENTITY` says "only `findById` and `save`" while the Q&A allows collection facts on the repository | contradiction between two statements of the rule | statement reworded: load, save, and the facts a rule needs about the collection; never identity, never a screen's search |
| no example, rule or word about deleting an aggregate | real gap | CLAUDE.md, *Deleting an aggregate?* |
| no `DELETE` in the verb list | real gap | verb list gains `DELETE /notes/:id/bookmark` |
| may a read adapter join two stores? | real gap | CLAUDE.md order question: the read side may join; it is what ADR 5 frees it to do |
| a checklist for a new aggregate; a `place <concept>` command; a batch `can-import`; the verb table in the contract | wishes for the contract | recorded in `conventions/README.md` as the next iteration's list, not built now |
| ties in "most recent first" | product detail, handled well | none |
| stale injected CLAUDE.md | harness | covered |

## Numbers

About 40 minutes (12 reading). Read: README, CLAUDE.md, `architecture.yaml`, the whole Notes context, the Notifications read side as a template for a dated read model, the building blocks it used.

## Verdict

The feature is the cleanest of the nine so far, and the first whose author reached for the enforcement *before* writing code: `can-import` turned the boundary rules from something you learn by being refused into something you ask. The rest of the contract earned its keep differently — by making a contradiction visible. Two statements of one rule had drifted apart in wording; with the contract rendered into both documents, the agent read them side by side and reported it. That is what a single source is for.
