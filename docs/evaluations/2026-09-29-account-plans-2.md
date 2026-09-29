# 2026-09-29 — "Plans" re-run, verbatim, on the corrected guide (does the context criterion fire?)

**Base:** `main` at `a3c9fac` (after round 3, which sharpened the aggregate-vs-context answer). **Agent:** Claude, fresh session, isolated worktree, told not to read `docs/evaluations/`. **Result branch:** [`eval/account-plans-2`](https://github.com/jgaNet/clean-ddd/tree/eval/account-plans-2) (commit `d9f92a7`, 42 files, +1211/−12; not merged).

## The request

Identical to [the round-3 run](2026-09-29-account-plans.md), word for word. The only variable is the documentation.

## Scorecard

| Expectation | Round 3 | Now |
|---|---|---|
| a new context, declared in `architecture.yaml`, with the four layers and `module.local.ts` | stayed in Security | **PASS** — `Billing`, `check:conventions` reports five contexts; the report quotes the plans sentence of the answer |
| an aggregate with `create` / `fromSnapshot`, a change behaviour recording an event, exceptions file, DTOs, ports, in-memory adapters | (on `Account`) | PASS — `Subscription`, `PlanChangedEvent`, `SubscriptionExceptions.ts`; `Subscription.create()` cannot fail and returns the aggregate directly, said so |
| Notes asks through a port it owns, shape declared in the port file, adapter over the other context's read model with a written-out translation; Notes' Domain never imports Billing | PASS | PASS — `IAccountPlans` + `BillingAccountPlans`; grep: zero Billing imports in Notes' Domain/Application |
| the ten-note rule in a Notes domain service; count on the repository over both adapters with a contract case | PASS | PASS — `NoteCreation`, `countByOwner` |
| admin command with `guard()`; routes under a new prefix registered in the composition root; a read of the plan | PASS | PASS — `PUT`/`GET /billing/accounts/:accountId/plan`; `createApplication.ts` is the only Bootstrap change |
| specs at every level, both e2e suites, barrels only where the rule says; six checks | PASS | PASS — 165 unit / 30 e2e (from 140 / 21); everything passed on the first run; re-run by the grader |

## Decisions: documented or guessed?

| # | Decision | Agent's source | Grader's finding |
|---|---|---|---|
| 1 | a Billing context | CLAUDE.md, the plans sentence | **documented — the round-3 fix worked**; the aggregate's name (`Subscription`) guessed, rightly |
| 2 | default FREE as a constant on the aggregate, answered by the read side for an account with nothing stored; quota in `NoteCreation`; admin in `guard()` | CLAUDE.md step 2, the collection-fact question, README Guard row | documented; "absence means the default" **guessed** → **fixed** |
| 3 | a *separate* port `IAccountPlans` rather than widening `IAccountDirectory`, because the answer comes from another context | CLAUDE.md port-shape question, read literally, could mean either | **fixed** (one port per answering context) |
| 4 | two domain events, no handler, no integration event | CLAUDE.md event questions | documented — the round-3 clarification was used as written |
| 5–6 | 202 / 200; `PUT …/plan`; `/billing` prefix | CLAUDE.md, `createApplication.ts` | documented |
| 7 | `countByOwner` on both adapters + contract case; Billing has one adapter each and no contract spec | CLAUDE.md step 3, README Contract row | documented |
| 8 | specs beside files; three barrels (Commands, Queries, Routes); `architecture.yaml` edited because the check requires it; `createApplication.ts` because it is the composition root | CLAUDE.md, `conventions/README.md`, README | documented |
| 9 | admin sets; owner or admin reads (mirrors `GetAccountQueryHandler`) | README, precedent | documented |

## Friction log → action

| Friction | Verdict | Action |
|---|---|---|
| widen `IAccountDirectory` or add a port? one port answered by two contexts? | real gap | CLAUDE.md: one port per answering context; an adapter reads one context |
| "absence means free": materialise a subscription for every account, or treat a missing record as the default? | real gap | CLAUDE.md: a default for an aggregate that does not exist yet is a constant on the aggregate, answered by the queries port; materialise only when the fact must be recorded |
| may a factory that cannot fail return the aggregate directly? | small gap | CLAUDE.md step 1 |
| who owns "what a plan allows": the consumer (a `switch` on the plan) or Billing (a quota)? | real gap | CLAUDE.md: the port carries the fact in the other context's terms; what it means here is this context's rule |
| an enum from a request body reaches the command as a string and is validated by the domain with a type guard | precedent only (`isRole()`) | CLAUDE.md step 4 |
| four e2e files repeat sign-up → validate → login | helper gap | `signUpValidated()` added to `application.spec-helper.ts` |
| wiring files import each other's wiring; nothing warns about cycles | real gap | CLAUDE.md: wiring files form a DAG |
| is a second use of the `NoteSharing` pattern "a second copy of an example"? | wording | *Things to avoid* now says the rule is about what the README points to, not a cap on using a pattern |
| stale injected CLAUDE.md | harness | covered |

## Numbers

55–65 minutes, of which 20 reading — it read every ADR, every shared-kernel file, the whole of Notes and Security, and the bootstrap before writing a line; everything compiled, linted and passed on the first run.

## Verdict

The one decision the guide had got wrong in round 3 is now made correctly by a fresh reader who saw only the guide. That is the evidence the evaluation protocol exists to produce: not that an agent can be clever, but that the documentation, and nothing else, leads to the right shape. The residual friction is about defaults and ownership at the seam between two contexts, and it is now written down.
