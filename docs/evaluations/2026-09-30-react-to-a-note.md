# 2026-09-30 — "React to a note", written plan-first

**Base:** `main` after the feature plans landed. **Agent:** Claude, fresh session, isolated worktree, told not to read `docs/evaluations/`, and told to **write a plan, get it to validate, and run `plan explain` before any code**. **Result branch:** [`eval/note-reactions`](https://github.com/jgaNet/clean-ddd/tree/eval/note-reactions) (commit `d5788f1`, 34 files; not merged).

## The request

> People a note is shared with should be able to react to it with an emoji — one reaction per person per note, and they can change it. The owner of the note should be told the first time someone reacts to it.

Chosen to make the plan work for its keep: a modelling decision, a value object with a closed set, a verb judgement the validator can check, a cross-context reaction, and a rule ("the first time") that has to be given a home.

## Scorecard

| Expectation | Result |
|---|---|
| a plan written first, validating; `plan explain` used | PASS — validated on the first run; the plan is in the commit |
| `NoteReaction` its own aggregate, not part of `Note` | PASS — quoted the criterion, and added a reason of its own (two reactors would otherwise collide on the note's version) |
| the emoji a value object with a closed set, exceptions in the aggregate's file | PASS — `ReactionEmoji`, `static readonly ALLOWED`, the route schema listing it from the domain |
| visibility and one-per-person in the right places | PASS — `Note.allowsReactionFrom()` (the note owns its audience), one-per-person in the domain service through the repository |
| the verb reasoned, and the route matching it | PASS — `replace-part` → `PUT /notes/:id/reaction`, with `create-under` and `act` rejected in writing |
| cross-context by integration event, ACL in Notifications | PASS — `NoteFirstReactionIntegrationEvent`, published only when the fact is first |
| read model, order promised on the port and asserted; contract spec despite one adapter | PASS |
| specs at every level, e2e, six checks, docs untouched | PASS — 222 unit / 25 e2e (from 180 / 23); re-run by the grader |

## Did writing the plan first help?

The agent's own verdict: **"it helped, moderately — mostly as a reading list, not as a checker."** Worth recording precisely, because it is the answer the run was for:

- **What it caught: nothing the linter or the tests would not have caught later.** Validation is shallow by design (declared context, known kinds, verb-vs-method, event naming, strategy, existence).
- **What it bought, and this is the part that paid:** `plan explain`'s expansion of the *query* checklist — *"The handler reads the port and nothing else: no sorting, no second port, no aggregate"* — **changed a design decision** before the code existed (the agent was about to give the query handler two ports). It also surfaced the contract-spec trigger, which would otherwise have been skipped with a single adapter.
- **`yarn architecture verb` changed the other decision:** the agent was going to write `POST /notes/:id/reactions`; the one-line *when* of `create-under` against `replace-part` settled it on `PUT /notes/:id/reaction`, and `plan validate` then held the route to the intent it claimed.
- **Writing `invariants` forced the four rules to be placed before any code** — "the part of the exercise I would keep even without the tool".
- **What it cannot do:** the decision that determines everything downstream — aggregate, child entity, or part of the note — is not plan vocabulary, and a plan that omits an integration event, a port or a read model is still "legal".

## Findings, and what they earned

| Finding | Verdict | Action |
|---|---|---|
| **`expect(published).toEqual([SomeEvent.set({…})])` does not compare payloads** — the payload sat behind a `#private` field, invisible to a structural comparison, so ten spec files asserted the class and nothing more | **a real defect**, found by a spec of the agent's own failing for the wrong reason | `Event.payload` and `Event.name` are `readonly` public fields; every existing assertion now means what it looks like (the suite still passes, so none was wrong — only vacuous), and a spec pins it |
| a plan's `crossContext` says *integration event* while the plan lists no contract; ports, read models and event handlers are invisible to it | real gap | two new checklist kinds, `integration-event` and `event-handler`; a plan that crosses a boundary must now list the contract it publishes, or the domain service that asks |
| is adding a file under `SharedKernel/Application/IntegrationEvents` an `architectureChanges: true`? the field said "the shared kernel", the example said `false` while doing exactly that | real ambiguity | the integration-events folder is **publishable**: adding a contract is what a cross-context feature does, and only the shared kernel's *model* is protected. Stated in the code and in the plan schema |
| `conventions/README.md` still said feature plans were "the next iteration" | stale — a documentation edit lost when a script aborted mid-way in the PR that added them | corrected, with the plan's lifecycle (`new:` before, `new: false` after) written down |
| a plan kept in the repository must be flipped to `new: false` once the work exists, so the committed file is not literally what was written first | true, and the point | said plainly in `conventions/README.md`: that edit is what turns a plan from a note into a test |
| as a separate aggregate, "one per person per note" stops being an invariant the store enforces and becomes check-then-write | real, and undocumented | noted in CLAUDE.md's aggregate criterion: the cost of the split is that uniqueness needs the store's help |
| the emoji set, "the owner may not react to their own note", same-emoji-is-a-refusal | product guesses, all stated in code | none |

## Numbers

About 75 minutes (20 reading, 10 on the plan, 35 writing, 10 checking). 222 unit / 25 e2e, zero ESLint refusals while writing — the `can-import` probes did that work in advance.

## Verdict

The plan is worth its file, but not for the reason it was built. As a *validator* it is shallow and caught nothing; as a *reading list generated for this feature* it changed two decisions before a line was written, and as a *forcing function* it made the author place four rules before coding. The run also paid for itself twice over outside the plan: it found that the repository's event assertions had been checking nothing for months, and that a documentation edit had been silently lost.
