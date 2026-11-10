# 37. A decision for every feature is taken once: a later request does not overturn it in silence, and a decision taken late is applied to the code before it

## Context

A storm decides a feature ([ADR 22](0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)): its hot spots are written down with how each was decided, beside the stickies, and the code is held to the stickies. Some hot spots, though, are not about one feature. How a refusal is answered, when something that falls due changes state, what a missing outside system means: the answer must be the same in every feature, or the application answers one client two ways.

OpenStay's J5 campaign showed what happens when nothing says so.

- Request 26 said that a server without a payment provider refuses what needs one, and no test asked. Three of four trees answered `503`; the habit lived through fifty-four requests, and when request 80 asked once whether a donation is refused without a provider, the three failed it, at every model, while request 1 had said since the first day that a refusal is a `4xx` or an `ERROR`. The decision existed; nothing put it in front of the feature that took the habit.
- Request 73's time-driven lapse was decided by requests 7, 9 and 30; three trees had lapsed at read time since request 30. A guide sentence given at request 72 was applied to new code and not to the code it should have shaped.

Two things were missing. A session had no way to read what earlier sessions had decided on the same subject, so a later request could contradict an earlier one with nobody noticing, and the later one would win by being later. And a decision found late had no rule saying what becomes of the code written before it.

## Decision

**A choice that must hold for every feature is taken once, as an architecture decision; a later request keeps it or changes it, and says which; and a decision taken late is applied to the code already written.**

- **Before deciding, read what was decided.** `yarn architecture storm decisions --about <words>` lists the hot spots of every storm, decided or open, that name the subject, with the storm that holds each. The `storm` skill reads it before the session, as it reads the wall.
- **The later request is not the norm.** A request that touches a decided hot spot is a hot spot of its own storm: the room says whether the decision stands or changes. Silence keeps the decision; it never changes it.
- **A decision for every feature is an ADR.** When a hot spot's answer must be the same everywhere, the storm names an ADR that says it, and the contract carries the rule under an id when a tool can hold it ([ADR 9](0009-work-is-done-in-one-of-two-modes.md): an architecture change). A storm decides for its feature; the next storm can contradict it without anything seeing.
- **A decision taken late migrates the code.** An ADR that changes a practice is applied to the code that already follows the old one, in the same change or the one right after; the check, or the review when the rule says `review`, lists what does not follow it, and that list is the migration. The earlier tests are run again. An ADR that only writes down what the code already does changes nothing. An ADR left unapplied is a wish, for the reason a context map nobody checks is one (CTX-MAP-DECLARED).

## Consequences

- A contradiction between two requests surfaces at the second one's session, not at a hidden test fifty features later.
- The cost of a late decision is visible: the migration is part of the change that takes it. That cost grows with every feature written in the old way, which is the argument for deciding early.
- Hot spots are read across storms, so their wording matters: a question names its subject in the words a later request will use (a refusal, a provider, a deadline), not in a feature's private words.
- An evaluation that changes a decision for trees already running does not apply it to them: the trees were held to the old one, and the change is recorded for the next campaign (OpenStay's `next-campaign.md`).

## When to revisit

If `storm decisions --about` misses the decisions it should find (the same subject worded differently), the hot spot gains a `subjects` list in the inventory's words, held by the check. If sessions keep ending with the same hot spot, the question belongs in a guide or in the contract ([ADR 22](0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)'s own revisit clause). If a hot spot often turns out to hold for every feature only after its storm is done, the storm grows a field naming the ADR its decision became, and the check requires that the ADR exists.
