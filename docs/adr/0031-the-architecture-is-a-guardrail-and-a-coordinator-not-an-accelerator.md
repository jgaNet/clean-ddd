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

- **The guide and the contract left a gap the gate could not hold.** One run with the weaker model answered an unknown plan with a 400 from its request schema, where the request wanted a 202 and an `ERROR`. The TypeScript guide then called an enum of allowed values "shape", so the agent followed it, and the gate passed it rightly. [ADR 32](0032-a-command-body-is-refused-for-its-shape-only.md) closes the gap in the contract.
- **Much of what the tooling caught was its own bookkeeping.** A storm not marked done, a document to regenerate, a context missing from the map: each costs an agent a turn and protects nothing.

## Decision

**The project presents the architecture and its tooling as a guardrail and a coordinator for agents, not as an accelerator.** It is for a team that has chosen Clean Architecture and DDD for what they do to the code, and wants its agents to keep to them over time. It is also for running several agents on one codebase in parallel. It does not claim that the architecture makes one agent deliver sooner, cheaper or better: the records say it does not. The article that publishes those records is part of the offer, not a caveat to it.

The work that follows is ordered by what could change that verdict. What the architecture could still win on substance comes before what would only lower its price.

1. **Test what the architecture is for: failures and concurrency.** The outbox, the inbox, reactions in their own transaction and the version check exist for crashes and concurrent writers. No hidden test exercises them yet, so this is the one place where the architecture could still be shown to buy correctness rather than only locality. A robustness campaign is written before it runs, like the others ([its kit](../evaluations/benchmark/robustness/README.md)).
   - **The same requirements for every arm.** The requirements are stated in product words, so the plain arm has to build the guarantees itself:
     - a fact recorded before a crash still reaches the people it concerns after a restart, and reaches them once;
     - two edits of one note at the same moment never lose one silently;
     - a reaction that fails is retried until it succeeds, and its effect happens once.
   - **Hidden tests that cause the failures.** They kill the server between a commit and a publication, race two writers, and make a consumer fail.
   - **A hardened harness first.** The campaign runs agents unattended, so each agent's dependencies are isolated rather than hard-linked to a shared copy, its budget is reserved before it starts, and a supervisor stops what overruns.
2. **Grade on four scores, kept apart.** Each result says which score it moves:
   - **functional correctness:** the hidden acceptance tests;
   - **robustness:** the failure tests of item 1;
   - **maintainability:** the independent reading;
   - **cost of change:** the change probes, timed.

   Passing the acceptance tests says nothing about the other three.
3. **Close the enforcement gaps.**
   - **Done:** the rule the weaker model's failure exposed is in the contract (API-BODY-SHAPE, [ADR 32](0032-a-command-body-is-refused-for-its-shape-only.md)): a command's body is refused for its shape only. TypeScript's linter holds it, so the gate does in a TypeScript tree. Every language holds it through the shared scenario.
   - The bookkeeping the tooling asks of an agent is done by the tooling where it can be: documents regenerated, a carried storm marked done. An agent should spend no turn on bookkeeping.
4. **A long horizon:** several trees per arm and dozens of features, with the cost of each change measured as the code grows. E3's direction is a plain tree's time per feature growing while A's stayed flat, on one tree per arm. It becomes a result or disappears.
5. **Narrow the cost, once robustness is measured: let the architecture write what it already knows.**
   - **Generate from the storm, starting small.** The first generator writes only the commands, their handlers and the wiring. It is measured on three things:
     - the lines it generates;
     - the corrections the agent had to make to them;
     - the total cost of the feature.

     A generator that writes more code to maintain can lower the first cost and not the total. It grows only where all three improve. If the architecture arm comes close to the plain project's cost, the verdict above is revised.
   - **A lighter profile.** E4's locality came from ports. A profile with ports only at the edges (storage, mail, clock, models) and without the full tactical pattern is measured as its own arm. If it keeps the locality at a fraction of the cost, it is offered beside the full profile.
6. **People timed on the change probes,** to put a price on locality.
7. **Publish the harness as a benchmark.** It has pre-registered kits, hidden tests, control arms, a grader and amendments on record. That is a reproducible protocol for measuring agents against an architecture, which the literature lacks.

**What stops until the robustness campaign and the enforcement gaps are decided:**

- **New languages and new tactical patterns.** All the evidence is in TypeScript. Rust, Python and Go stay at their current level as references, held to the contract by their checks, and gain no new features of their own.
- **More runs on the seven-feature backlog.** It has said what it can.

## Consequences

- **The README, the article and the tooling's description say what the architecture buys:** locality, no drift, safe parallelism, and their measured price. They do not say it helps an agent deliver.
- **`clean-ddd strategy` keeps one agent as its default.** Its calibration already recommends the fan-out only for wide features whose time matters more than their cost. The control adds a statement it should make: for a small application with no team or long horizon in view, the architecture itself is optional.
- **The generator is new tooling with a contract of its own.** What it writes must pass the gate and the conventions check like any code. A file it generated and an agent then edited must stay held to the same rules, with no exemption.
- **A lighter profile would be a second shape of the architecture.** If the measurement keeps it, it is declared in the contract under its own name, so that a binding and a project choose it explicitly. Each language says what it carries. A profile is never a set of rules quietly skipped.
- **The other three languages fall behind TypeScript** on whatever this work adds. Their bindings report it as a gap, which the map already shows.

## When to revisit

- **If generation from the storm brings the architecture arm within about 1.5 times the plain project's time and cost,** at the same delivery, the claim that the architecture slows an agent is withdrawn. The project is then also offered as an accelerator.
- **If a long horizon shows a plain tree's time per feature rising while the architecture's stays flat,** over several trees, the architecture pays for one agent past a measured size. That size is stated.
- **If timed people find changes in the architecture trees markedly faster to make or review,** locality is priced. The offer states it for teams.
- **If the robustness campaign shows the architecture trees keeping facts and updates that the plain trees lose,** at comparable delivery, the offer says so. The architecture then buys correctness under failure, not only locality, and that is weighed against its cost.
- **If the plain trees build the same guarantees at their usual price,** the outbox and the version check are one way to meet a requirement, not the only one, and this record says so.
- **If none of these happens,** the guardrail and the coordinator are what the project is, and this record stays as it is.

## Revision

Revised the same day, after an external review of the records. The verdict and the offer are unchanged; the order of the work is not:
- **Failures and concurrency come first.** They are where the architecture could still win on substance, and the generator only lowers its price.
- **The generator starts small, with stated measures.**
- **Grading keeps four scores apart.**
- **A hardened harness is the campaign's precondition.**

The same review found that every server seeded a known default administrator. That was removed in every language: an administrator is now seeded only when both of its variables are set.

A second revision corrects the context. The weaker model's 400 was first described here as a rule the gate missed. It followed the guide of the time, which called an enum of allowed values "shape". [ADR 32](0032-a-command-body-is-refused-for-its-shape-only.md) settles the rule, and item 3's first point is done.

A third revision records the robustness campaign ([the record](../evaluations/2026-10-31-flow-robustness.md)), item 1 of the decision.
- **The condition "if the plain trees build the same guarantees at their usual price" is met.** Both plain trees met crash recovery, concurrency across two processes and retried delivery, at half the architecture arms' cost.
- **Two of the four architecture trees did not meet crash recovery.** They told some archivings twice after a crash. The cause is a line every language's reference ships: the startup relay runs without a unit of work, so it relays past the inbox.
- **The verdict and the offer are unchanged.** The architecture does not buy correctness under failure for one agent. The outbox and the version check are one way to meet these requirements, not the only one. The locality E4 measured held again: no architecture tree touched a business rule for crashes or concurrency.
- **The reference's startup relay is to be given a unit of work in every language,** with a test that relays a durable entry after a crash. That is an architecture change of its own.

