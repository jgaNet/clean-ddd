# A review of the repository after J6, and the direction it recommends (19 November)

**Question.** With J6 closed and its three skeleton fixes merged ([ADR 47](../adr/0047-the-building-blocks-carry-a-database-and-a-restart-is-tested.md)), what does the repository hold that its records defend, what does it hold that they do not, and what is the most pertinent next step?

**Read.** The README, the 47 decision records, the six RFCs, the 34 evaluation records, the two reviews of November ([12 November](2026-11-12-architecture-review.md), [16 November](2026-11-16-next-evolution-review.md)), the K4 pilot ([its results](knowledge/k4-pilot/results.md)) and J6 ([the run's record](benchmark/three-arms/tally-run-2026-11-17.md)). Written by the operator who ran J6 and wrote ADR 47, the day after; the same limit as every review here: one reader, not blind to anything.

## The verdict in one paragraph

clean-ddd has become three things in one repository: a reference architecture in four languages; a tooling that holds it (the contract as data, the generated linter, the check, the gate, `create`); and a research programme that measures what all of it brings to agents. The third is the most valuable and the rarest: protocols and bands written before every run, hidden tests, a triage rule written in advance, kit defects revoked for every arm alike, and a programme that reversed its own starting thesis ([ADR 31](../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md)) and restated it on evidence. But the repository now carries more than its evidence defends. The most pertinent next step is not to add; it is to tighten around what is measured, and to pay two debts: the external credibility of the evidence, and the absence of a first real user.

## What holds

- **The method.** Registration before the run, hidden tests, triage written in advance, kit defects revoked for every arm, bands of reading fixed before the result. Few open-source projects keep that discipline. It is the main asset.
- **The seams held by a tool.** Everything that paid in the campaigns is a guarantee a tool holds at the border between two parts of the system: contexts apart, a storage change kept inside the adapters, a fact durable before it is published, one clock ([ADR 42](../adr/0042-an-application-has-one-clock.md)), the caller refused at the transport ([ADR 39](../adr/0039-a-command-whose-outcome-is-read-later-needs-a-caller-at-the-transport.md)), the operation in the contract ([ADR 41](../adr/0041-an-operation-read-is-in-the-contract.md)), integration events as a versioned published language ([ADR 44](../adr/0044-integration-events-are-a-published-language-declared-once.md)), rules named with their evidence ([ADR 46](../adr/0046-a-rule-is-a-named-unit-with-its-origin-and-its-evidence.md)), and since yesterday the PostgreSQL unit of work and the restart test (ADR 47). The recent trajectory is coherent: each triaged failure became data a check holds.
- **J6's central result**, new and measurable: structure does not change the number of errors, it changes their kind. The plain trees forget business rules carried from one request to the next; the structured trees fail on mechanics, where a test catches them. That is the argument the reference can defend without reservation.

## What weighs

- **Full's cost did not pay back, and nothing defends its ceremony inside a context.** 2.4 times the plain arm per tree at forty requests, and changes that cost more, not less. The review of 12 November said it already: the command bus, a handler class and a folder per command, `CommandEvent` classes, an aggregate for everything, an ADR per feature, "mandatory by no rule", and no record shows what they buy. Lite was to test that and settled nothing, because it converges on Full within five requests.
- **Lite is in a dead zone.** Two profiles measuring one thing, at 95% of the price. The stop conditions written on 16 November already say what follows: Lite rejected, Full stays the default, the roadmap's items 7 and 10 dropped.
- **Four languages, one source of evidence.** Every campaign ran in TypeScript. Rust, Python and Go cost every pattern-shaped rule written four times, and have no rule register, no Lite, no PostgreSQL adapter, no relationship tests. They produced no evidence and a permanent maintenance debt.
- **The evaluation tooling weighs as much as the product.** About 16,000 lines of tools and 10,000 of flow, among them a multi-agent orchestration the campaigns rejected as a default and a knowledge query K4 rejected. A newcomer cannot tell which part is for them.
- **The evidence debt.** One author, one model family, the operator as the only reader of the gradings and the author of the kit. The review of 16 November names it (B7); nothing has paid it yet. While it is true, every result above is a direction, not a verdict, and the README says so honestly, without a remedy.
- **No user outside the benchmarks.** `create` has produced dozens of test trees and, as far as the records show, no application anyone else keeps alive. The first real user will teach more than one more campaign.

## The direction recommended: tighten

A decision first: is clean-ddd a product for teams that work with agents, or a research programme on what agents need? The evidence says the asset worth offering is the first, in a smaller form than the current one: the executable seams and the tooling that holds them, not Full's ceremony and not the fan-out of agents. Six steps, in this order.

1. **Rewrite the thesis around what is measured.** The README still opens on "it does not make an agent faster or better". The entry should be J6's result: structure moves the errors from the logic to the mechanics, and every seam is data a check holds. Cheap, and decisive for how the project reads.
2. **Decide Lite, and lighten Full rather than keep two profiles.** Drop Lite as a profile, keep "start with use cases; the gate says when the aggregate is due" as the way in, and remove from Full what no record defends, toward the "smallest set worth keeping" of the 12 November review. It is the one real lever on the 2.4. Measuring it is cheap: the Tally kit exists, and three lightened Full trees against the three plain ones cost about $150.
3. **Freeze the breadth of the languages.** Declare TypeScript the reference where the evidence is produced, and the three others ports kept green at each release, with no new rule of their own until TypeScript has proved it. Or reduce to two languages. Four copies of every rule for no evidence is not sustainable.
4. **Set the evaluation tooling apart.** The flow, the fan-out, `knowledge`, the ladder: evaluation infrastructure, opt-in, documented as such, with no new investment, as the 16 November review foresees. The product is the contract, the check, the gate and `create`.
5. **Pay the evidence debt before any new campaign.** Two gestures to start: a second reader, blind to the arm, on one checkpoint of Tally's gradings; and a second model family on one checkpoint, plain against Full, with the existing kit. Cheaper than a campaign, and it changes the nature of everything the site says.
6. **A first real user.** An application someone else builds with `create` on PostgreSQL, or a real migration with the `migrate` skill (the repository made one by hand). Its frictions will say what `create` must give before the next rule.

What not to do now: the handoff experiment and any sequel to the knowledge projection, whose expected value is low since K4; Lite in the three other languages; a fifth language; one more campaign on the same method before a second reader exists.

The three gaps of the skeleton that J6 showed were filled yesterday. The next step that matters is step 2: it is the only experiment that can move the economic result, and it is cheap.

## Stop conditions, so that a later reading cannot move them

- **Step 2 is rejected** if a lightened Full, on Tally's forty requests with three trees, costs more than 1.5 times the plain arm per tree with ranges apart, or loses a structural pass Full holds, or has more real regressions than Full had. Then Full's ceremony is not where the cost sits, and the next candidate is the cost of failing (the ladder's escalations), not the structure.
- **Step 3 is reversed** the day a campaign is run in a second language and finds something the TypeScript campaigns did not.
- **Step 5 changes a published claim** if the second reader disagrees with the operator's classification on more than one request in five, or if the second model family inverts the arms' order on cost or on the kind of error; then the site's articles carry the correction with its date.
