# Feature 8: a feature large across contexts

The pilot of phase 4 ([the record](../../2026-10-30-flow-phase-4-pilot.md)) found that one agent delivers the seven-feature backlog sooner and cheaper than the architecture-aware fan-out. The likely reason: each feature there is small, so the parallel slices save less than the integration and the fresh agents cost. This experiment asks the converse question. Does a single feature that spreads across six contexts favour the fan-out?

It was written and committed before any run, like the backlog's kit.

| | |
| --- | --- |
| [`backlog/8-team-spaces.md`](backlog/8-team-spaces.md) | Team spaces in product words, with the API it answers. |
| [`storms/team-spaces.yaml`](storms/team-spaces.yaml) | The storm, its hot spots decided by the maintainer on 2026-10-30. |
| [`acceptance/8-team-spaces.acceptance.ts`](acceptance/8-team-spaces.acceptance.ts) | Eight black-box tests over HTTP, beside the backlog's `support.ts`. |

## What the feature touches

| Context | New? | What it brings |
| --- | --- | --- |
| Teams | new | spaces, members, roles, invitations and their expiry |
| Notes | | a space's notes, with permissions by role, asked of Teams through a port; what it publishes for the projections (`NoteChanged`) |
| Plans | | a space's plan and seats, asked by Teams through a port; who the admins are, learnt from Teams' facts |
| Search | new | a projection of what Notes and Teams publish, filtered by what the caller can read |
| Audit | new | a projection of the same facts: a space's activity, for its admins |
| Notifications | | three new kinds of notification |

Its prerequisites are one architecture task, done before the slices:

- three contexts declared;
- nine relationships, each one pair, pattern and reason in the map;
- the composition root.

## The arms

Both arms start from the same project: the final tree of arm A's pilot run, which carries features 1 to 7 and passed every item of the rubric, with this branch's tooling.

| Arm | What runs |
| --- | --- |
| **A** — one agent | One fresh agent, given the request and the storm, does the architecture task and the feature; the gate in the architecture mode, one retry. |
| **C′** — architecture-aware, with the pack | The person does the architecture task and the contract stage. That means the contexts and relationships, the frozen integration events and read models, and a plan per slice. Then six slices run at once, one per context, and the single writer integrates them and runs every acceptance test. |

The same model and the same runner serve both arms. The person's time is logged with a start before the work and an end after it, in separate commands, and the critical path is read from the run logs. One run per arm first; two more of each if the first ones point somewhere.

## What is graded

The whole tree is graded, like the backlog's runs:

- **M1:** the gate from the base, in the architecture mode.
- **M2:** all eight acceptance tests. Features 1 to 7 must not regress.
- **M3:** feature 8's storm, held as done.
- **The read items below.**

| Id | Item |
| --- | --- |
| R8.0 | The three new contexts and the nine relationships are declared in the binding and the map, with an ADR that says why. |
| R8.1 | The space decides its rules: the last admin, who may invite, remove and change roles, an invitation already pending. The seat limit is asked through a port Teams owns. |
| R8.2 | An invitation's expiry is decided with the current time as a parameter with a default. |
| R8.3 | Notes decides what a role may do to a space's note in its Domain or Application layer, asking the role through a port it owns; nothing in Notes' Domain imports Teams. |
| R8.4 | Search and Audit are fed only by integration events; neither imports another context's Domain or reads another context's store. |
| R8.5 | Every integration event is published through the outbox (`publishIntegrationEvent`), and every consumer reacts in its own transaction with no hand-made idempotency. |

## What is measured

The same measures as the backlog's runs:

- the lead time, from the first agent started to the feature integrated;
- the person's time;
- the agent time;
- the reported cost;
- the retries and the integration failures, by kind.

The prediction, written before the runs: if the fan-out wins anywhere, it is here. A should take roughly the sum of six contexts' work, while C′ takes the longest slice plus the contract stage and one integration.
