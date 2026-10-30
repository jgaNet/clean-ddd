# 31. The architecture is offered to agents as a guardrail and a coordinator, not as an accelerator

## Context

This repository was built on a bet: an architecture made explicit and enforced makes AI agents better at building software, alone and together. Four records then measured that bet against hidden acceptance tests, with arms held to the same model, driver and grader:

- **The phase 4 campaign** ([the record](../evaluations/2026-10-30-flow-phase-4-campaign.md)) compared ways of staffing agents. Every arm had the architecture and the tooling.
- **The control** ([the record](../evaluations/2026-10-30-flow-control.md)) ran the same backlog in two other arms: a plain project (P), and the architecture as prose without its tooling (D).
- **Four more experiments** ([the record](../evaluations/2026-10-30-flow-extensions.md)) took the conditions where the architecture is claimed to pay. They used a weaker model, gave one agent the fan-out's contract, added five features to grown trees, and moved storage to SQLite.

**On delivery, the bet failed.** In every experiment with a plain arm, the plain project delivered as much as the architecture arms. It was the soonest and the cheapest every time. The architecture arms took 1.4–2.8 times its time and 3.1–6.0 times its cost, on means. Two independent readers found no difference in quality. The cost is mostly reading and writing: the architecture arms wrote about four times the source for the same behaviour, and a conversation pays for every token it reads again.

**Three benefits were measured, and they are not productivity:**

- **Locality.** The move to SQLite touched no file of a context's Domain or Application in any architecture tree. It stayed in adapters, wiring and the building blocks. The plain trees changed the code of every module.
- **No drift, with the tooling only.** D's trees, held to the rules by prose, had 0 and 20 refusals of the generated import rules after the backlog. Five features later, the grown one had 24. A's trees have none by construction.
- **A safe fan-out.** Naive parallel agents lost three features to conflicts in one context. The fan-out by context, with a frozen contract and one writer, lost none. It made the six-context feature 21% sooner than one agent on the architecture. Giving one agent the same contract did not make it sooner, so the gain is the parallelism. The contract is what makes the parallelism safe.

**Two weaknesses of the tooling were found:**

- **The gate holds the structure, not every rule.** One run with the weaker model answered a refusal with a 400 from the request schema. The contract says a refusal is an outcome behind a 202. The gate and the storm check both passed it.
- **Much of what the tooling caught was its own bookkeeping.** A storm not marked done, a document to regenerate, a context missing from the map: each costs an agent a turn and protects nothing.

## Decision

**The project presents the architecture and its tooling as a guardrail and a coordinator for agents, not as an accelerator.** It is for a team that has chosen Clean Architecture and DDD for what they do to the code, and wants its agents to keep to them over time. It is also for running several agents on one codebase in parallel. It does not claim that the architecture makes one agent deliver sooner, cheaper or better: the records say it does not. The article that publishes those records is part of the offer, not a caveat to it.

The work that follows is ordered by what could change that verdict, or narrow the cost it states.

1. **Narrow the cost: let the architecture write what the architecture already knows.**
   - **Generate from the storm.** The contract and a storm decide the commands, their handlers, ports, in-memory adapters and wiring. A generator writes those, and the agent writes the rules, the read models and the tests. This is measured with the existing harness on the backlog and on feature 8. If the architecture arm comes close to the plain project's cost, the verdict above is revised.
   - **A lighter profile.** E4's locality came from ports. A profile with ports only at the edges (storage, mail, clock, models) and without the full tactical pattern is measured as its own arm. If it keeps the locality at a fraction of the cost, it is offered beside the full profile.
2. **Close the enforcement gaps.**
   - The HTTP grammar in the contract becomes executable checks. Every command answers 202, and a refusal is a failed outcome, not a 400. The gate runs these checks on every route a module lists. The weaker model's failure is the first test case.
   - The bookkeeping the tooling asks of an agent is done by the tooling where it can be: documents regenerated, a carried storm marked done. An agent should spend no turn on bookkeeping.
3. **Measure only what can still change the conclusion:**
   - **A long horizon:** several trees per arm and dozens of features. E3's direction is a plain tree's time per feature growing while A's stayed flat, on one tree per arm. It becomes a result or disappears.
   - **Concurrency and crashes under test.** This is where the outbox and optimistic concurrency are meant to pay, and no hidden test exercises them yet.
   - **People timed on the change probes,** to put a price on locality.
4. **Publish the harness as a benchmark.** It has pre-registered kits, hidden tests, control arms, a grader and amendments on record. That is a reproducible protocol for measuring agents against an architecture, which the literature lacks.

**What stops until the first two items are decided:**

- **New languages and new tactical patterns.** All the evidence is in TypeScript. Rust, Python and Go stay at their current level as references, held to the contract by their checks, and gain no new features of their own.
- **More runs on the seven-feature backlog.** It has said what it can.

## Consequences

- **The README, the article and the tooling's description say what the architecture buys:** locality, no drift, safe parallelism, and their measured price. They do not say it helps an agent deliver.
- **`clean-ddd strategy` keeps one agent as its default.** Its calibration already recommends the fan-out only for wide features whose time matters more than their cost. The control adds a statement it should make: for a small application with no team or long horizon in view, the architecture itself is optional.
- **The generator is new tooling with a contract of its own.** What it writes must pass the gate and the conventions check like any code. A file it generated and an agent then edited must stay held to the same rules, with no exemption.
- **A lighter profile would be a second shape of the architecture.** If the measurement keeps it, it is declared in the contract under its own name, so that a binding and a project choose it explicitly. Each language says what it carries. A profile is never a set of rules quietly skipped.
- **The other three languages fall behind TypeScript** on whatever the first two items add. Their bindings report it as a gap, which the map already shows.

## When to revisit

- **If generation from the storm brings the architecture arm within about 1.5 times the plain project's time and cost,** at the same delivery, the claim that the architecture slows an agent is withdrawn. The project is then also offered as an accelerator.
- **If a long horizon shows a plain tree's time per feature rising while the architecture's stays flat,** over several trees, the architecture pays for one agent past a measured size. That size is stated.
- **If timed people find changes in the architecture trees markedly faster to make or review,** locality is priced. The offer states it for teams.
- **If none of these happens,** the guardrail and the coordinator are what the project is, and this record stays as it is.
