# 2026-09-29 — "Change my password" on the restructured layout (Architecture / SharedKernel)

**Base:** PR #44's branch `architecture-and-shared-kernel` at `36686a5`, the commit that split `@SharedKernel` into `src/Architecture` (the building blocks) and `src/SharedKernel` (the shared kernel in the DDD sense). **Agent:** Claude, fresh session, isolated worktree, told not to read `docs/evaluations/`. **Result branch:** [`eval/change-password`](https://github.com/jgaNet/clean-ddd/tree/eval/change-password) (commit `6da8933`, 16 files; not merged).

## The request

> A signed-in user should be able to change their own password. They must give their current password, and the new one must be at least 8 characters.

Chosen because a restructuring is exactly what the protocol says to test, and because this feature makes a newcomer take things from *both* new trees (the mechanics from `@Architecture`, `requireSignedIn` from `@SharedKernel`) and decide whether anything new belongs in either.

## Scorecard

| Expectation | Result |
|---|---|
| the 8-character rule as a value object in Security's Domain (not in the shared kernel), the current-password check through `IPasswordHasher` in the handler, as Login does | PASS — `Password` VO next to `Credentials`; `compare()` in the handler; `InvalidCredentials` reused |
| exceptions in `AccountExceptions.ts`; an event recorded by `Account.changePassword()`, unhandled | PASS — `PasswordTooShort`; `AccountPasswordChangedEvent` |
| `requireSignedIn` at the top of `execute()`, imported from `@SharedKernel/Application/Guards`; the account is the caller's by construction | PASS — the command carries no account id |
| building blocks from `@Architecture/…`, vocabulary from `@SharedKernel/…`, nothing from a removed path, no relative import across directories | PASS — grep: zero |
| route → 202; e2e: wrong current refused, too short refused, new password logs in and the old one does not | PASS — `PUT /auth/me/password`, 4 e2e cases on a fresh account |
| specs beside files, no new barrel, six checks, docs untouched | PASS — 162 unit / 27 e2e (from 151 / 23); re-run by the grader |
| **decision 9** — which tree each import came from, and whether anything written belongs in a tree — cites the documentation | PASS — quotes CLAUDE.md's *Where things are* table and the README sentence on the shared kernel; concludes `Password` is Security's vocabulary, "not something every context agrees on… not a building block either: it carries a business number" |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | length rule in a VO invoked before hashing; compare in the handler | CLAUDE.md step 1; `Account.ts` and `Credentials.ts` comments; ADR 7 | documented — it noticed the aggregate cannot check a clear-text rule and found the answer in the existing comments |
| 2 | one event, no handler, no integration event | CLAUDE.md | documented |
| 3 | published, 202 | CLAUDE.md step 4, `FastifyAuthController` | documented |
| 4 | `PUT /auth/me/password`; account = caller | CLAUDE.md verbs; `GET /auth/me` precedent | verb **guessed** between PUT and POST; both defensible, none to fix |
| 5–6 | no read-model or persistence change | `IAccountQueries.ts`, CLAUDE.md step 3 | documented |
| 7–8 | specs beside files; `requireSignedIn` through `execute()` | CLAUDE.md | documented |
| 8b | `requireSignedIn(context, 'Security')` while Notes uses the default `'Auth'` | **guessed** | inconsistency in the code → **fixed** (no default: every caller names its context) |
| 9 | `@Architecture` for mechanics, `@SharedKernel` for the guard; nothing new belongs in a tree | CLAUDE.md *Where things are*, README | **documented — the restructuring is learnable from the guide alone** |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| where a clear-text rule lives when the domain only sees hashes | resolved from existing comments in ~3 minutes | none; the comments did their job |
| PUT or POST for a password change | both documented shapes fit | none |
| should sign-up also require 8 characters? | product; correctly left out ("one concern per PR") | none |
| reuse `InvalidCredentials` or a new exception | judgement, sound | none |
| README/CLAUDE.md state the version check as a rule of every `save()`, but `IAccountRepository.save()` returns `void` | real: the rule was stated wider than the code | CLAUDE.md now says "Notes today; ADR 8 says when the others follow" |
| `requireSignedIn`'s service name: default `'Auth'` in Notes, `'Security'` in Security | tree ≠ doc, small | default removed; every caller passes its context |
| which controller (`Auth` vs `Account`) | precedent (`/auth/me`), sound | none |

## Numbers

35–40 minutes (15 reading). Read: README, CLAUDE.md, ADRs 1 and 7, `conventions/README.md`, every file of Security, the Notes command path as a template, the building blocks it used (`CommandHandler`, `AggregateRoot`, `Result`, `Exception`, `ExecutionContext`) and `Guards.ts`.

## Verdict

The restructuring is learnable from the documentation alone: a fresh reader imported mechanics from `@Architecture`, vocabulary from `@SharedKernel`, said why, and correctly kept a new value object in its context. The two findings were places where the code lagged the words (a rule stated for every repository while one implements it; a default that let two contexts name the same guard differently), both fixed in the PR that did the restructuring.
