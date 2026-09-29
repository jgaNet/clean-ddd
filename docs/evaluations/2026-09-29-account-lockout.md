# 2026-09-29 — "Lock an account after five wrong passwords" (Security; a refusal that must leave a trace)

**Base:** `main` at `4d98766` (after round 2). **Agent:** Claude, fresh session, isolated worktree. **Result branch:** [`eval/account-lockout`](https://github.com/jgaNet/clean-ddd/tree/eval/account-lockout) (commit `10c389b`, 18 files, +523/−4; not merged).

## The request

> After five wrong passwords in a row, an account gets locked. A locked account can't log in, even with the right password. An administrator can unlock it. A successful login resets the count.

Chosen as the first run in the Security context, and because the failure path of a use case must persist something — a shape the guide had never described.

## Scorecard

| Expectation | Result |
|---|---|
| rule in the `Account` aggregate; "locked" represented deliberately (status or field), stated | PASS — `AccountStatus.LOCKED` plus a `failedLoginAttempts` counter; `recordFailedLogin()`, `unlock()`, `authenticate()` refuses `LOCKED` and resets |
| exceptions in `AccountExceptions.ts`, PascalCase; events in `AccountEvents.ts`, recorded by the aggregate, unhandled | PASS — `AccountLocked`, `AccountNotLocked`; `AccountLockedEvent`, `AccountUnlockedEvent` |
| the wrong-password path is recorded and saved; the refusal is still `InvalidCredentials` | PASS, with a caveat the agent itself wrote down: it works only because Login runs `execute()` directly, outside `handle()`'s transaction |
| `UnlockAccount` command + handler with `guard()` admin-only; `POST /auth/accounts/:id/unlock` → 202 via the account controller | PASS — and it explicitly refused to copy the `GET …/validate` shape |
| snapshot gains the counter; no adapter change needed; read model shows `LOCKED` without a schema line (enum derived from the domain enum) | PASS |
| specs: aggregate, a Login spec (none existed), the unlock handler through `handle()`, e2e with a fresh account | PASS — 152 unit / 25 e2e (from 135 / 21); re-run by the grader |
| no integration event (none asked); hygiene; six checks | PASS |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | rule in the aggregate; status + counter | CLAUDE.md step 1, README *Lifecycle as an enum* row | documented; status-vs-field weighed by the agent from consequences it found by grep (the middleware only accepts `ACTIVE`, so locking also ends live sessions) |
| 1b | the constant `MAX_FAILED_LOGIN_ATTEMPTS` on the aggregate | ADR 4 mentions `NoteTitle.MAX_LENGTH` | **guessed** → **fixed** (step 1: a business constant is a `static readonly` on the class that enforces it) |
| 2 | two events, no handler, no integration event | CLAUDE.md *Does every domain event need a handler?*, step 6 | documented |
| 3 | save the count before returning the refusal | **guessed**; found that `withTransaction` rolls back on failure and that Login bypasses `handle()` | **real architectural gap** → **fixed** in the docs (new question); no canonical example yet, listed as a known gap |
| 4 | `POST /auth/accounts/:id/unlock` | CLAUDE.md *Which HTTP verb?* | documented |
| 5 | `LOCKED` shows through the existing enum-based schema; the counter is not exposed | CLAUDE.md step 4, *Things to avoid* | documented; "an enum derived from the domain enum needs no schema line" → **fixed** (half-sentence) |
| 6 | snapshot only; one adapter per Security port | README *Second adapter* row names Notes only | documented |
| 7 | Login spec created, unlock spec through `handle()`, e2e fresh account | CLAUDE.md *Where does the spec go?*, *How do I test a `guard()`?* | documented — and it exposed that Login and RegisterAdmin had no spec on `main` although the rule says every handler has one → **fixed** (both specs added) |
| 8 | `guard()` admin-only | `Guards.ts`, `RegisterAdminCommandHandler` | documented |
| 9 | vague until the password matches, then say why | precedent of `InactiveAccountException` | documented by precedent only; a fair reading |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| a refusal with a side effect: nothing says how a use case that fails but must persist something is shaped; inside `handle()` the write would be rolled back and the events dropped | real gap, architectural | CLAUDE.md, *A refusal that must leave a trace?*: the trace is a fact of its own, recorded by its own command; the branch's simpler shape is allowed only because Login runs `execute()` directly, and says so. README *Known gaps* names the missing canonical example |
| status vs field for "locked" | judgement, not a gap | none; the agent's reasoning (consequences found by grep) is the right method |
| a PENDING account and the counter | product | none; stated in the aggregate |
| where the "5" lives | real gap | CLAUDE.md step 1 |
| reveal the lock or not; 423 vs 401 | precedent only | none; the controller rule ("all controllers have the same shape") held |
| Login had no spec; RegisterAdmin neither | real hole | both specs added on `main` |
| `expect.any(Date)` inside a typed payload fails `tsc` | tooling | none |
| enum value needs no schema line | half-sentence | CLAUDE.md step 4 |
| stale injected CLAUDE.md | harness | protocol already covers it |

## Numbers

About 40 minutes (15 reading). Read: README, CLAUDE.md (from disk), `conventions/`, ADRs 1, 3, 4, the evaluation docs, every file of the Security context, `CommandHandler.ts` and its spec, `ExecutionContext.ts`, `Guards.ts`, `DomainEvents.ts`, `InMemoryUnitOfWork.ts`, and Notes' handler spec and routes as templates.

## Verdict

The Security context, which has fewer canonical files than Notes, still yielded the right shape at every layer. The agent found the one place where the architecture's guarantees (ADR 3) and a legitimate requirement collide — a refusal that must persist — reasoned about it correctly from the base classes, and recorded the dependency in a comment. The guide now says how that case is meant to be shaped; the repository still lacks a canonical example of it, and says so.
