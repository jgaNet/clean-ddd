# 2026-09-29 — "My operations, most recent first, failed ones on request" (Tracker: a context with no Domain)

**Base:** `main` at `a3c9fac` (after round 3). **Agent:** Claude, fresh session, isolated worktree, told not to read `docs/evaluations/`. **Result branch:** [`eval/my-operations`](https://github.com/jgaNet/clean-ddd/tree/eval/my-operations) (commit `6743546`, 11 files; not merged).

## The request

> Users want to see the list of their own operations — the things they asked the system to do — most recent first, and to be able to ask for only the ones that failed. Today only administrators can list operations.

Chosen as the first run in Tracker, whose layout differs (no Domain: ports and read model under `Application/`), with a user-scoped query next to an admin one and a route that must coexist with `/:id`.

## Scorecard

| Expectation | Result |
|---|---|
| port method under `Application/Ports`, order and filter promised in JSDoc | PASS — `findBySubjectId(subjectId, { status? })`, "most recent first", unknown subject → empty |
| the single adapter implements it; a contract spec starts (order is a promise) | PASS — `InMemoryOperationRecords`; a new `OperationRecords.contract.spec.ts` in the Notes shape with one entry |
| a separate handler with `requireSignedIn`, not an admin `guard()`; the caller's id is the only subject asked for | PASS — `GetMyOperationsQueryHandler` |
| `GET /tracker/operations/mine?status=…`, static segment before `/:id`, enum from `OperationStatus`, through `refuse()` | PASS |
| filtering and ordering in the adapter, not the handler | PASS |
| handler spec through `handle()`; e2e as a fresh non-admin user | PASS — 4 + 4 cases |
| no events, no concept file, `concepts.yaml` untouched; six checks | PASS — 150 unit / 25 e2e (from 140 / 21); re-run by the grader |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | Tracker; pieces under `Application/Ports`, `Application/Queries`, `Infrastructure`, `Presentation` | README contexts table and layout note | documented |
| 2 | rule in `execute()`: the caller's id is the only subject queried | `Guards.ts`, `QueryHandler.ts`, `GetMyNotesQueryHandler` | documented |
| 3 | no events | CLAUDE.md step 1 (pure read) | documented — the round-2 fix was used first time |
| 4 | sync, 200 / 403 | CLAUDE.md step 4, controller rule | documented |
| 5 | `GET …/mine`, static segment; `status` enum from the domain enum | CLAUDE.md foreign-id question, step 4 | documented; the name `mine` and `status=ERROR` rather than `failed=true` **guessed** — fine either way |
| 6 | ordering and filter in the adapter, promised on the port | CLAUDE.md *Does the read side's order matter?* | documented |
| 7 | one adapter; a contract spec created anyway | CLAUDE.md step 3 | **guessed** whether to create one with a single adapter → **fixed** (step 3 says when a contract spec starts) |
| 8 | spec beside the handler; **a `Queries/` barrel added because the rule says one per folder and Tracker had none** | CLAUDE.md *Barrels?* | documented — and the tree disagreed with the doc → **fixed** on `main` (barrel added) |
| 9 | any signed-in caller; an admin gets their own list on `/mine` | `Guards.ts` ("reserve `guard()` for role-only rules") | documented; admin-sees-own **guessed**, sound |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| does "operation" mean commands only? the README vocabulary says "the handle a client gets for a command", but the Tracker records every event too | real inaccuracy in the vocabulary | the *Operation* row now says both |
| `status=ERROR` vs `failed=true`; the route name | product / taste | none |
| admin on `/mine`: own or all? | product; decided sensibly | none |
| a contract spec with a single adapter | real gap | CLAUDE.md step 3 |
| Tracker had no `Queries/` barrel although the rule says one per folder | tree ≠ doc | barrel added on `main` |
| no query-handler spec to copy in Notes; built the context from `RegisterAdminCommandHandler.spec.ts` | the round-3 fix worked | none |
| nested `beforeAll` vs the suite's `beforeEach` admin agent | test-suite trap | none |

## Numbers

35–40 minutes. Read: README, CLAUDE.md, `conventions/`, ADR 5, every Tracker file, the shared-kernel query pieces, the Notes query files as templates, the bootstrap helper.

## Verdict

A context with a different layout, a user-scoped read next to an admin one, a route that must not swallow `/:id` — all placed right, with the round-2 and round-3 fixes used unprompted. What it found were two places where the repository said one thing and did another: a vocabulary row that was too narrow, and a barrel the rule required but the tree lacked. Both corrected.
