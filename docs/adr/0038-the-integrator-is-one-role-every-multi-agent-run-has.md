# 38. The integrator is one role every multi-agent run has: one module, two rounds, and the relationship tests run on the merged result only

## Context

[RFC 0004](../rfc/0004-the-integrator-is-a-role-of-the-flow.md) proposed that a run where several agents write one feature always has an integrator. The integrator is a driver that merges their work, runs the gate on the merged result and sends each failure to its owner. The RFC left four hot spots to the maintainer.

The evidence is J5's two-developer probe, on one request, with two runs per arm:
- without an integrator, 0 of 2 delivered;
- with one, 2 of 2.

What failed without it was not the code each agent wrote:
- a request sent after the other agent's session had ended reached nobody;
- a failure the merge made was nobody's;
- the relationship test refused each branch alone.

The maintainer decided the hot spots on 10 November, before a campaign that runs the Clean DDD arm with one agent per context on every feature that crosses contexts (OpenStay J5b).

## Decision

**Every run where several agents write one feature has an integrator. It is one module that every driver calls ([`integrator.mjs`](../../.claude/flow/integrator.mjs)).**

- **H1, where it lives:** one module. The routing, the bound and the result are the same in every driver that splits work.
  - The ladder's fan-out by context (`fanOut` in [`run-ladder.mjs`](../../.claude/flow/run-ladder.mjs)) calls it.
  - The phase-2 driver ([`run-slices.mjs`](../../.claude/flow/run-slices.mjs)) calls it too; its single writer is gone. The owners are the slices, a merge applies their patches to a new worktree from the base, and its gate is what the single writer held the merged result to: the contract marked carried, the gate, the storm's owing and the acceptance test.
- **What it does, in each round:**
  - It merges every owner's branch onto the feature's start, the feature's owner last. A conflict goes to the owner whose branch conflicted.
  - It runs the gate on the merged result.
  - It sends each failing step to the owner of a file the step names. A step that names no owned file goes to the feature's owner, the context whose request it is.
  - It continues that owner's conversation. A session that ended is brought back; it is never replaced by a fresh agent.
  - It decides nothing about the code.
- **H2, the relationship test:** it runs on the merged result only.
  - An owner's verdict on its branch leaves out the relationship steps, and a test step whose every failing test is a relationship's (`Upstream → Downstream`, [ADR 33](0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md)).
  - The integrator's gate runs them all.
  - Neither branch is refused alone for a test that needs both sides.
- **H3, the bound:** two rounds. After the second, the merged result is judged as it stands. The result says which failure was left and whose it was.
- **H4, what is measured next:** OpenStay J5b runs the fan-out with the integrator on the Clean DDD tree, on every request whose storm lists several contexts. It is a pilot: one tree, requests a kit was already tuned on. The pre-registered comparison the RFC asks for is still owed.

## Consequences

- An owner who finished early is not lost. Its conversation is continued with what the merge found and with the channel's messages.
- A failure the merge made has an owner: the owner of a file it names, or the feature's owner.
- The fan-out costs more agents per feature, and two rounds may each continue every owner. The ladder logs each owner's turns (`agent-finished` with `owner`), each round (`integrator`) and the result (`integrated`), so the cost of the split is read from the log.
- Routing by the files a failure names is a heuristic. A failure that names a file one owner wrote because of another's change goes to the first, who must settle it with the other in the channel.

## When to revisit

- When a pre-registered comparison of the fan-out and one agent per feature, both with the integrator, on requests no kit was tuned on, says the split is not worth its cost.
- When failures routed by file keep landing on the wrong owner: routing by the step's own context, or by the storm's links, is the next option.
