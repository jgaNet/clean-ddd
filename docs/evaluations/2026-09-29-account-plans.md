# 2026-09-29 — "Plans: free (ten notes) or pro" (new bounded context?)

**Base:** `main` at `4d98766`. **Agent:** Claude, fresh session, isolated worktree. **Result branch:** [`eval/account-plans`](https://github.com/jgaNet/clean-ddd/tree/eval/account-plans) (commit `d5440ef`, 32 files, +379/−26; not merged).

## The request

> We're introducing plans. Every account is on the free plan unless an administrator puts it on the pro plan. On the free plan an account can have at most 10 notes; on pro there's no limit. Trying to create an 11th note on the free plan is refused. Administrators need to be able to set an account's plan and see which plan an account is on.

Chosen to trigger the *new bounded context* case: own vocabulary, own reasons to change, a context Notes would have to ask through a port, and the one Bootstrap file that must change.

## Scorecard

| Expectation | Result |
|---|---|
| the decision stated with the repository's criterion; a new `Billing` context declared in `architecture.yaml` | **PARTIAL** — plan became a property of `Account` in Security. The agent applied CLAUDE.md's answer literally ("the request speaks only of accounts… when in doubt, stay in the context"). The rubric expected Billing: *plan*, *quota*, *pricing* mean nothing to "who can sign in", change for their own reasons, and could ship alone. The guide's default won over its criterion → docs gap |
| Notes asks through a port it owns, answered by an adapter over Security's read model, never Security's domain | PASS — `IAccountDirectory.planOf()`, a Notes-side `AccountPlan` enum declared in the port file, an explicit `translate()` in `SecurityAccountDirectory` |
| the ten-note rule in a domain service in Notes, called by `CreateNoteCommandHandler`; a `NoteExceptions.ts` exception | PASS — `NoteCreation` (factory-as-domain-service, like the README's Factory row says), `NoteLimitReached` |
| the count comes from Notes' own store, over both adapters, contract spec extended | PASS — `INoteRepository.countByOwner()` with the reason written on the port; one contract case × 2 |
| admin command with `guard()`; `PUT …/plan` → 202; read through the existing account query with the schema line | PASS — `ChangeAccountPlan`, `PUT /auth/accounts/:id/plan` |
| no integration event unless justified | PASS — none; Notes pulls through the port |
| specs (aggregate, domain service with fakes, handler through `handle()`, both e2e suites); no new barrel; nothing outside the contexts | PASS — 152 unit / 26 e2e (from 135 / 21); re-run by the grader |
| hygiene; six checks | PASS |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | Security, not a new context | CLAUDE.md *New aggregate in this context, or a new context?* | followed the doc; the doc's criterion was too weak to fire on a textbook case → **fixed** (the answer now names when a new context *is* warranted, with plans as the example) |
| 2 | defaults in `register()`; limit in a domain service; admin in `guard()` | CLAUDE.md step 2, step 1, README Factory and Guard rows | documented |
| 3 | plan through the directory port; a Notes-side enum in the port file; count on the repository | README *Port to another context*, ADR 6; enum placement and count-on-repository **guessed** | both right → **fixed** (two new questions) |
| 4 | one domain event, no handler, no integration event; noticed a tension between "no handler needed" and "published whenever the fact happens" | CLAUDE.md two questions | real ambiguity → **fixed** (one clause) |
| 5–6 | 202 / 200; `PUT /auth/accounts/:id/plan` | CLAUDE.md step 4, verbs question | documented |
| 7 | snapshot; `countByOwner` on both adapters with a contract case | CLAUDE.md step 3, README Contract row | documented |
| 8 | specs beside files; `guard()` tested through an operation built with `InMemoryEventBus` | CLAUDE.md; the trick found in `CommandHandler.spec.ts` | documented; a canonical example now exists (`RegisterAdminCommandHandler.spec.ts`) and the question points at it |
| 9 | admin sets; owner or admin sees | README Guard row, existing `GetAccountQueryHandler` | documented |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| own context or Security? "when in doubt, stay" decided it in two minutes | the doubt was not the doc's to resolve that way | CLAUDE.md: positive criteria and the plans example |
| where the `FREE \| PRO` vocabulary lives for Notes (redeclare? shared kernel? plan-agnostic question?) | real gap | CLAUDE.md, *A port to another context that returns more than a boolean?* |
| a count the domain needs: repository or queries port? | real gap | CLAUDE.md, *The domain needs a fact about the whole collection?* |
| "no handler needed" vs "published whenever the fact happens" | real ambiguity | CLAUDE.md: a domain event needs no handler; an integration event exists once a first consumer needs it, then always |
| is an enum of allowed values shape or rule? | precedent only | CLAUDE.md step 4: shape, listed from the domain enum |
| testing a `guard()` needs an operation; no spec in the contexts did it | real gap | `RegisterAdminCommandHandler.spec.ts` added; question points at it |
| do archived notes count? | product | none; stated on the port |
| presenters for `/auth/me` | judgement | none |
| stale injected CLAUDE.md | harness | covered |

## Numbers

About 40 minutes. Read: README, CLAUDE.md, all of `conventions/`, all six ADRs, three evaluation records, the whole of Notes and Security, the shared kernel, the bootstrap.

## Verdict

Everything about *how two contexts talk* was right and well written — the port in Notes' own words, the enum translated in the adapter, the domain service as factory. The one decision the run was designed to test went the other way because the guide told it to: "when in doubt, stay in the context" is a good default and a poor criterion. The answer now says when a new context is the right call, and uses this very feature as the example.
