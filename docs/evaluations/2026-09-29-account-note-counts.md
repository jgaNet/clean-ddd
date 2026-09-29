# 2026-09-29 — "How many notes an account owns and is shared" (administrator query)

**Base:** `main` at `30f7b94`. **Agent:** Claude, fresh session, isolated worktree. **Result branch:** [`eval/account-note-counts`](https://github.com/jgaNet/clean-ddd/tree/eval/account-note-counts) (commit `edcbf36`, 12 files, +191/−0; not merged).

## The request

> Administrators want to look up, for any account, how many notes that account owns and how many notes are shared with it. Just the two numbers. Only administrators may see this.

Chosen to exercise a pure read: a new read model and port method across both adapters and the contract spec, a role-only rule (`guard()` rather than `requireSignedIn`), and `refuse()` → `403`.

## Scorecard

| Expectation | Result |
|---|---|
| read model declared in `INoteQueries.ts`; a new port method with its contract in JSDoc | PASS — `AccountNoteCounts`, `countByAccount()`, unknown id → zeros stated |
| both adapters implement it; contract spec extended over both | PASS — two filters on the Map, two `COUNT(*)` subselects with `json_each` in SQL; one case × 2 |
| a query handler in `Application/Queries/<UseCase>/`, admin-only in `guard()`, `NotAllowedException` | PASS |
| `GET` route with response schema; controller through `refuse()`; no new refuse line | PASS — `GET /notes/accounts/:accountId/counts`, 200 / 403 in the schema |
| registered in `queries`; one line in the `Queries/` barrel | PASS |
| handler spec (guard refusal + happy path) and e2e (admin 200, user 403) | PASS — 3 handler cases through `handle()`, 2 e2e |
| no cross-context import; unknown account behaviour stated | PASS |
| five checks green, docs untouched | PASS — 139 unit / 23 e2e; re-run by the grader |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | no domain change; the rule is authorization → `guard()` | README Guard row, `Guards.ts`, `QueryHandler.ts`, ADR 1 | documented — but "Domain first" gave pause for a pure read → **fixed** (step 1 says what a read does instead) |
| 2 | N/A, a query records nothing | `QueryHandler.ts` | documented |
| 3 | synchronous, `200` / `403 { message }` | CLAUDE.md step 4, *Does a new exception need a line in `refuse()`?* | documented |
| 4 | `GET`; path **guessed** (`/notes/accounts/:accountId/counts`) | CLAUDE.md *Which HTTP verb?* for the verb; nothing for a query about a foreign id | real gap → **fixed** (new question) |
| 5 | read model in `INoteQueries.ts`; counting in the adapters | README rows, ADR 5, layout note on Tracker | documented |
| 5b | archived notes count; unknown account → zeros, not 404 | **guessed** (product) | product ambiguity; the "foreign id" question now says: answer for any id, state it on the port |
| 6 | port method → both adapters; `tsc` + contract spec proved coverage | CLAUDE.md step 3, README Contract row | documented |
| 7 | spec beside the handler; contract case; e2e with the routes | CLAUDE.md *Where does the spec go?* | documented |
| 7b | a `guard()` only runs through `handle()` | resolved from `QueryHandler.ts` | documented by code only → **fixed** (new question) |
| 8 | one line in the existing barrel | CLAUDE.md *Barrels?* | documented |
| 9 | `guard()`, admin only, not in the controller or middleware | README Guard row, `Guards.ts`, `GetAccountQueryHandler` precedent | documented |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| "Domain first" for a read-only feature: is *some* domain artefact expected? | real gap | CLAUDE.md step 1: a pure read starts at the queries port |
| existence of a foreign id: 404 through `IAccountDirectory`, or zeros? | product + docs | CLAUDE.md, *A query about an id another context owns?* |
| path convention for a query about another context's id | real gap | same question: own prefix, static segment |
| testing a `guard()` (existing specs call `execute()`) | documented by code only | CLAUDE.md, *How do I test a `guard()`?* |
| response field names | none to consult | none; mirrors the port's method names, fine |
| a `lint-staged.config.cjs` still in the tree; `yarn format:check` red on the base | hygiene | file removed; `.prettierignore` covers vendored and deployment files; `format:check` is now a CI step |
| the injected CLAUDE.md was stale | harness | protocol updated |

## Numbers

About 25 minutes. Read before writing: README, CLAUDE.md (on disk), `conventions/`, ADRs 1 and 5, the evaluation docs, `QueryHandler.ts`, `Guards.ts`, every Notes query and adapter, the contract spec, Security's `GetAccountQueryHandler` and `RegisterAdminCommandHandler` as precedents for `guard()`.

## Verdict

Right shape at every layer, including the one that most often goes wrong in CQRS codebases: the counting lives in the adapters behind the port, and the handler holds only the authorization. The guide's gaps were about *reads*: it described features as if every one began in the aggregate, said nothing about a query keyed by another context's id, and left "how to test a `guard()`" to be inferred from the base class. Fixed.
