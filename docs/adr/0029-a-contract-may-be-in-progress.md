# 29. A feature's contract may be in progress, and is marked carried when all of it is

## Context

A storm says what a session decided a feature adds and a plan says what a change intends; both are kept in the repository and held by the conventions check on every build, so that neither rots ([ADR 22](0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)). The check held them strictly to two states. A storm `done: false` was refused as soon as the code carried *any* of it; a plan's `new: true` part was refused as soon as its file existed. The author who wrote the whole feature was expected to flip both in the same change.

Phase 2 of the flow ([RFC 0001](../rfc/0001-architecture-aware-multi-agent-flow.md)) writes one feature as two slices, one per bounded context, at the same time, against a contract frozen before either starts. Its first run, on a created project, stopped with both slices `BLOCKED`, for the same reason, found independently by both agents: each had written and committed its part, every other check passed, and the conventions check refused the storm (*not done, yet the code already carries…*) and the plan (*planned as new, but … already exists*). Flipping the flags would not have helped: the agent writing Notifications tried it and found the storm, marked done, then refused for what the Notes slice owed — a part no single worktree can hold. Between the frozen contract and its integration, *in progress* is the normal state, and the check had no word for it.

## Decision

**A storm not done, and a plan kept in the repository, may be in progress.** The check refuses a storm `done: false` only once the code carries all of it (*mark it done*). A plan is in progress for as long as its feature's storm is not done, whichever of its own parts are written: in a run of several slices each slice writes *all* of its own plan and only part of the feature, so a plan is the wrong unit to ask whether the work is finished — the feature is. A plan with no storm, or whose storm is done, is refused once every one of its `new: true` parts exists (*mark it new: false*). Everything else is unchanged: a storm `done: true` is held to the code difference by difference; a plan part `new: false` must exist; and `plan validate`, run before the work, still refuses any part called new that already exists.

**In a run of several slices, the single writer marks the contract carried.** Once every slice's patch is applied, the driver sets the storm `done: true` and the slices' plan parts `new: false`, and only then runs the gate on the integration: the done storm is held to the integrated code difference by difference, which is exactly the contract incompatibility the RFC asks integration to catch. Plans meant for such a run say `new:` on every part, so that the writer's mark is a plain substitution.

The first version of this decision made a plan in progress while only *some* of its new parts existed. The next two runs stopped again, all four slices with the same report: each slice had written its whole plan, so in its worktree the plan was carried and asked to say `new: false`, in a file the slice may not touch. Each agent had checked that this one flag was all that stood between its slice and a passing gate. The unit is the feature, which the storm names.

## Consequences

- A slice passes its gate with its own part of the feature, and fails it for anything else: the check still refuses a storm whose every part is carried and that says otherwise, so one author writing a whole feature still flips the flags, as before.
- A storm abandoned halfway is no longer refused; it is visible as `planned` in `storm --expect`, with what it still owes. Whether it is dropped is a person's call.
- The two states of a storm or a plan are now three — not started, in progress, carried — read from the code, not declared; only *carried* is written down, by whoever integrates.

## When to revisit

If storms started to linger half-carried, the check could ask a person to decide them after some time; nothing yet says one would.
