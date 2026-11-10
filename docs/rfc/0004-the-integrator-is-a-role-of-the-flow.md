# RFC 0004 — The integrator is a role of the flow, not a step after it

**Status:** decided (10 November), in [ADR 38](../adr/0038-the-integrator-is-one-role-every-multi-agent-run-has.md): one module, the relationship tests on the merged result only, two rounds; the ladder's fan-out by context calls it. The text below is the proposal as it was.

## 1. The problem

The flow has two ways for several agents to build one feature that crosses contexts.

- **The fan-out** (`run-slices.mjs`, [RFC 0001](0001-architecture-aware-multi-agent-flow.md)).
  - The contract is decided and frozen first: the storm, one plan per slice, the integration events already in the shared kernel, and an acceptance test that is red at the base.
  - Each slice's agent may change only its own context.
  - A single writer integrates the slices, runs the gate and the acceptance test, and sends a failure back once to the slice whose context it names.
  - The integration is a step *after* the slices.
- **Owners who negotiate.** [J5's two-developer probe](../evaluations/benchmark/openstay/j5/side/two-developers/results.md) tried the other way.
  - One agent per owner of the contexts a request crosses, with nothing frozen.
  - The two agents agree through a channel, and each works in its own clone.

The probe's result, request 64, two runs per arm:

| Arm | Delivered |
| --- | --- |
| Old kit | 0 of 2 |
| Full+ kit, no integrator | 0 of 2 |
| Full+ kit with an integrator who runs the gate on the merged `main` and hands each failure to the owner of a file it names, up to two rounds | 2 of 2 |

What failed without the integrator was not the code each agent wrote:

- **A request sent after the other agent's session ended was lost.** An agent ends its session when its own gate passes. A request in the channel after that reaches nobody.
- **A failure the merge makes was nobody's.** In both runs, Messaging's end-to-end test read a table that Moderation no longer wrote. Neither side owned that failure, so neither side fixed it.
- **The relationship test refuses each branch alone.** It is one test across two owners (ADR 33). It fails on either branch until both are merged. Without an integrator, that is one more thing each side waits on.

The review of J5 (8 November) asked that the integrator become a central part of the workflow. This RFC proposes how.

## 2. What J5 measured, and how little

- With an integrator, 2 of 2. In the second run, the integrator did nothing: the upstream agent carried the report's id on its own, citing the rule. So the integrator's effect rests on one run.
- Cost: $1.67–2.19 with an integrator, against $1.63–2.06 without. The ranges overlap.
- One request, one model, two runs per arm. This is a direction, not a result.

## 3. The proposal

1. **The integrator is a role every multi-agent run has,** whichever way the work is split.
   - It is a driver, not an agent: it decides nothing about the code.
   - It merges, runs the gate on the merged result, and routes each failure.
2. **Routing.**
   - A failing step goes to the owner of a file the failure names.
   - A failure that names no owned file goes to the owner of the feature (the context whose request it is).
   - In the fan-out, the owners are the slices. With owners who negotiate, the owners are the teams.
3. **A session that ended is brought back.** The integrator continues the owner's conversation with the failure and with the channel's unanswered messages. It never starts a fresh agent that knows nothing of the work.
4. **Rounds are bounded:** two by default. Then the merged head is graded as it stands, and the run says which failure was left and whose it was.
5. **The relationship test's owner.** A relationship test belongs to the downstream side, which is the side that finds the thing. The integrator runs it on the merged result only, so neither branch is refused alone for it.

## 4. Hot spots

- **H1, where the integrator lives.**
  - (A) In each driver: `run-slices` already has one, and the two-developer driver gains one.
  - (B) In one module both drivers call, with the same routing and the same bound.
- **H2, the relationship test on a branch.**
  - (A) Run only by the integrator, on the merged result (proposal 5).
  - (B) Split in two halves: an upstream half (the event carries the thing's id, read from the event's payload) and a downstream half (given that event, the thing is found by that id). Each owner passes its half alone.
  - (C) Unchanged: each branch must pass it, which J5 showed refuses each branch alone.
- **H3, the bound.**
  - (A) Two rounds, as in J5's arm C.
  - (B) Until the gate passes or no failure has changed between two rounds.
- **H4, what is measured next.** A pre-registered run of the fan-out and of owners who negotiate, both with the integrator, on requests that cross contexts. The requests should be ones no kit was tuned on, with more than two runs per arm.

## 5. What stays out

- The integrator does not write code, choose a contract, or resolve a conflict by itself. A conflict goes back to its owners. A conflict both owners cause goes to the feature's owner.
- How the teams split a request is unchanged: by the context map, as the probe split it.
