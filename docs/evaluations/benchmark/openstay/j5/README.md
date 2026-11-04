# OpenStay's J5 kit: fifty more features and eight side experiments, written and rehearsed before any run

J5 runs requests 51 to 100 of [OpenStay](../README.md) on the six trees of [J4](../j4/README.md), from their J4 heads, each feature from the smallest model up. The trees are graded on every request up to the feature after each attempt, so a later feature that breaks an earlier one is a regression. The eight side experiments run beside the ladder, on copies of the trees. This kit is written, reviewed and rehearsed before any agent runs it.

The phase is the framing's phases 3 and 4 ([j0](../j0.md#the-later-phases)):
- the complete marketplace: messaging, reviews, moderation, claims, support, sustainability;
- internationalisation: languages, currencies, local rules, taxes, calendar sync;
- a rule of the brief that changes, not announced in advance.

## The maintainer's decisions (2026-11-04)

- **The fifty features of [the proposal](proposal.md),** in its order. Request 90, card fees passed on where the law allows, is the change not announced in advance: nothing in requests 51 to 89 says that the rule will change.
- **$900 for J5, firm:**
  - the ladder, $480: $50 per simple tree and $110 per Clean DDD tree;
  - the kit, $120;
  - the side experiments, $300.
- **The eight side experiments** as the proposal sets them.
- **The limited context is dropped if it cannot be held.** The kit rehearses a way to cap the agent's context at about 30,000 tokens. If none holds verifiably, the experiment does not run, and the record says so.
  - **The rehearsal showed** that the agent's fixed context alone is about 42,000 tokens ([`side/context-cap.md`](side/context-cap.md)). **The maintainer decided** that the experiment runs with about 30,000 tokens of work above it, checked in every transcript.

## What is in it

| Path | What it is |
| --- | --- |
| [`proposal.md`](proposal.md) | What was proposed to the maintainer, and accepted |
| [`backlog/`](backlog) | Requests 1 to 50 as J4 left them, and 51 to 100 |

## Amendments

A defect of the kit found after the runs started is recorded here, applied to every tree alike, and the attempts it touched are graded again.
