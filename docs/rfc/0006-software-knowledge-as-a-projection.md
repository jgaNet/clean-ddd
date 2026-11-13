# RFC 0006 — Software knowledge as a projection: rules as named units, with their origin and their evidence

**Status:** proposed (13 November), a research direction. Nothing is implemented, and no rule, binding or ADR changes
by it. Its decisions are listed in §9. **K1 decided (the maintainer, 13 November): yes,** measured beside J6's
preparation, without holding it up. **K1 measured the same day (§9b):** exploring is three quarters or more of
what the tools bring into an agent's context, so the direction stands. **K2–K4 decided (the maintainer, 13
November): yes, before J6.** Their design is the operator's next proposal, for the maintainer's review before any
code; whatever of it an arm receives is in place before the arms' profiles and kit are hashed for registration.

## 1. The question

The maintainer asked whether software should be treated as an evolving system of knowledge rather than as files,
classes and dependencies. The hypothesis:

> Coding agents become more effective when they can reach a structured representation of the relevant software
> knowledge, rather than relying mostly on reading source files, searching text and conversation history.

A refund, for example, carries several kinds of knowledge:
- why it exists;
- when it is allowed;
- what must stay true;
- what happens when it is asked for;
- what it depends on;
- where it is written;
- which tests show it holds;
- why it is built the way it is.

None of these lines up with the file tree.

This RFC challenges the hypothesis rather than assuming it is right. It asks what Clean DDD already holds, what the
records say, what a unit of knowledge is, and what experiment would settle it. It rejects anything that adds
infrastructure before the evidence asks for it.

## 2. What Clean DDD already holds

Most of a knowledge graph is already in the repository, as data held to the code:

| Kind of knowledge | Where it is | How it is kept true |
| --- | --- | --- |
| Contexts, their language, relationships with their pattern and reason | `conventions/domain.yaml` | the check refuses a link the map does not declare (CTX-MAP-DECLARED) |
| Behaviours: commands, actors, routes, aggregates, events, policies, queries | `docs/inventory/<language>.json`, read from the code | regenerated; held equal across four languages (ARCH-ONE-APPLICATION) |
| Intended behaviour, before the code | `conventions/storms/*.yaml` | the check reports what the code still owes ([ADR 22](../adr/0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)) |
| Architectural rules, concepts, and the files that show them | `conventions/architecture.yaml`, `concepts.yaml`, the bindings | every file a binding names must exist (ARCH-MAP-IS-REAL) |
| Decisions | `docs/adr`, linked from rules and concepts | the links are checked |
| Contracts between contexts | integration-event files, ports the asking side owns | by name only ([the review](../evaluations/2026-11-12-architecture-review.md), F5) |
| Conventions with their evidence | a benchmark kit's `conventions.yaml` and `api/` fragments ([the kit standard](../evaluations/benchmark/kit-standard.md)) | `.claude/flow/kit-check.mjs`, for kits only |

Clean DDD already projects software knowledge, and most of it is derived from the code rather than kept by hand. The
second-model problem the maintainer fears is real, and the repository's answer to it already works:
- derive what can be derived;
- declare the rest in an artifact a check holds;
- never maintain a copy by hand.

## 3. What the records say

The failures of J5 and J5b were failures of knowledge, not of architecture
([J5's repairs](../evaluations/benchmark/openstay/j5/repairs.md),
[J5b's record](../evaluations/2026-11-13-openstay-j5b.md)):
- an operation's `error` shape;
- what `null` means for a field;
- one stored value meaning two things;
- the machine's time instead of the tree's clock.

Each time, a request decided a rule early, nothing recorded where the rule was born or what held it, and a later
request needed it. The agents had the code. What they lacked was the rule as a unit, with its origin and its evidence.

Other measures point the same way:
- **Prose does not carry it.**
  - clean-3's guide grew to 19.9 KB, simple-3's stayed at 2.8 KB.
  - Studies of context files find no gain in success for over 20% more inference cost
    ([RFC 0005](0005-what-the-literature-and-j5b-say-before-j6.md), §2).
  - A rule given late as a sentence reaches only the code written after it (J5's CQS probe).
- **A rule made a check does carry it:** [ADR 42](../adr/0042-an-application-has-one-clock.md) after J5b's R6.
- **Coordination fails on missing contracts.** In J5b, half of the owners' verdicts (28 of 56) failed, most because the
  other owner had not yet written its part.

So the evidence supports a narrow form of the hypothesis: agents do better when a rule is a named, findable unit with
its evidence. It does not yet support the broad form, that a general knowledge graph beats reading the code.

## 4. The unit of knowledge

Rules outlive classes: a class can be renamed, split or removed while the rule it holds stays the same. The proposed
tuple, `Knowledge = (Intent, Rules, Behaviors, Implementation, Evidence, Relationships)`, is close. But it mixes things
of very different reliability. The model proposed instead is typed nodes and typed edges, each edge carrying how it is
known.

**Nodes:**
- **Capability:** what the application offers (a refund).
- **Behaviour:** a command, a query or a policy. These are already in the inventory.
- **Rule:**
  - an invariant;
  - a refusal, named by its exception;
  - a convention ("`payment` is `null` only while the request waits").
- **Contract:** an API shape, an integration event, an owned port.
- **Decision:** an ADR, or the request that set a rule.
- **Artifact:** a file or a symbol. Always derived, never declared.

**Edges:**
- *implements*;
- *holds* (a test or a check gives evidence for a rule);
- *born-in* (the request or decision that set a rule);
- *constrains*;
- *depends-on*;
- *supersedes*.

**Provenance, on every edge:**
- **Derived:** computed from the code or a contract at build time, as the inventory is.
- **Declared:** written in an artifact a check holds (a storm, an ADR, a conventions register).
- **Inferred:** proposed by a model, shown as a hint, never trusted, and never a reason to skip reading the code.

**What this changes in the tuple:**
- **Intent cannot be verified.** It stays text attached to a Capability or a Decision, never a fact.
- **Implementation is always derived.** Declaring it is the drift this RFC must avoid.
- **Evidence is the missing part, and becomes a first-class edge.** A rule with no *holds* edge is a finding, as
  kit-check already refuses a convention with no test.

**Incomplete, contradictory or implicit knowledge becomes a finding, held by a check rather than written in prose:**
- a rule with no evidence;
- a test asserting a refusal no declared rule names;
- an API shape that disagrees with a convention.

**What an agent may rely on.** Explicit facts, inferred relationships, assumptions and unverified claims are kept apart
by the provenance. An agent may act on derived and declared edges. It treats inferred ones as leads to verify.

## 5. Tree or graph

**The tree is a view, not a structure:** context, then capability, then behaviour. Modelling it apart from the graph
would be an artificial distinction.

**Is it more than a dependency graph?** Only on specific edges. The import graph, which the linter already holds, says
which code depends on which. It cannot say:
- which test holds which rule;
- which request decided a convention;
- that two files implement the same invariant.

**Can those edges be derived?** In Clean DDD, often deterministically. A refusal carries the rule's exception
(DOMAIN-RESULT), so a rule has a name in the code. Every place that returns that exception, and every test that asserts
it, can be found mechanically.

**This is also the limit outside DDD.** In a plain codebase a rule is an anonymous `if`. Extracting it needs a model,
and is much less reliable. The approach carries only as far as rules have names.

## 6. The questions, answered

1. **Is it different from an architectural dependency graph?** Only through the rule, evidence and origin edges.
   Everything else is already in the inventory and the dependency table.
2. **Can business knowledge be extracted reliably from code?** Rules that have names, yes. Implicit rules (an early
   shortcut, a default value), no; that is exactly where J5 broke.
3. **What can't be reconstructed from code alone?**
   - why it exists;
   - why an alternative was rejected;
   - which behaviour is intended rather than accidental;
   - a convention the code follows without anything stating it.
4. **How are conflicting sources handled?** By authority: an executable contract, then a test, then a declared
   artifact, then an inferred edge. A conflict is reported as a finding and never resolved silently.
5. **Could it breed hallucinations or false confidence?** Yes, if inferred edges look like derived ones. Hence the
   provenance on every edge, and the rule that an inferred edge never replaces reading the code.
6. **How is stale knowledge detected?**
   - Derived edges are rebuilt on every build.
   - Declared edges are checked, as storms already are.
   - Inferred edges carry the commit they were made at, and expire when it is no longer the head.
7. **Does it reduce reasoning, or move it into construction?** Deterministic construction costs computation, not
   tokens. Inference by a model moves the cost and adds a source of error. Only the first is worth pursuing now.
8. **Could simpler retrieval do as well?** Possibly. Text search, a symbol index and the existing
   `yarn architecture` commands are the baseline the experiment must beat.
9. **Is it useful outside DDD?** Weaker, for the reason in §5.
10. **A real direction, or an abstraction?**
    - A real direction, framed as "a rule is a first-class unit, with its evidence and its origin, derived or checked".
    - An abstraction, framed as "build a knowledge graph".

## 7. The smallest prototype (described, not built)

No database, no embeddings, no new documentation format. Two parts.

**1. The missing knowledge, declared where it belongs.**
- **What:** the kit standard's conventions register, generalised to an application. A rule is listed with:
  - its name;
  - the request or decision it was born in;
  - the test that holds it.
- **Held by:** the conventions check. A rule with no evidence, or a refusal no rule names, is a finding.
- **Overlap:** this is close to the review's P0 (contracts and the API's specification as data), so it adds little
  infrastructure of its own.

**2. One read-only query over what exists: `clean-ddd knowledge <name>`.**
- **Input:** the name of a command, an event, a rule or an exception.
- **Output:** JSON and Markdown, each edge tagged derived or declared:
  - its context and its behaviours, from the inventory;
  - its files, from the binding and the inventory;
  - the rules it can refuse with;
  - the tests that assert them;
  - the ADRs and the storms that cite it;
  - the contracts it crosses.
- **Size (hypothesis):** a few hundred lines over what the command-line tool already loads.

**Before either, a measurement.** We do not know what share of an attempt goes to exploring. J5b's logs keep tokens,
not the files an agent read. A pilot logs tool calls on a few tasks before anything is built. If exploration is a
small share, the direction loses most of its expected gain, and that is said before the experiment.

## 8. The experiment

**Codebases:** the J5b trees at request 100, frozen: `j5b/clean-3` and `j5b/simple-3` in OpenStay's repository. Every
arm works on the same tree, so only the strategy varies. simple-3 tests question 9.

**Arms:**

| Arm | The agent has | |
| --- | --- | --- |
| A | the source, text search, the standard tools; no guide, no Clean DDD commands | conventional exploration |
| B | A, with the guide, the Clean DDD commands and skills | Clean DDD today |
| C | B, with `clean-ddd knowledge` | the projection |

In C the agent calls the query itself: nobody chooses what it reads for it.

**Tasks:** about twelve, written and reviewed before any run, each with hidden acceptance tests:
- diagnosing a defect injected into an existing rule;
- a change of behaviour no request announced;
- a change that crosses two contexts;
- predicting impact: before changing anything, the agent lists the rules, the tests and the files a stated change
  affects;
- a refactoring that changes the structure and not the behaviour;
- a handoff: a task stopped half-way and continued by a fresh agent with no conversation history.

**The ground truth for impact,** written before the runs:
- the files and tests a reference solution changes;
- the tests that fail when the rule is mutated.

The predictions are scored by precision and recall against it.

**Measures:**
- success;
- tokens, cost, time;
- files read before the first edit;
- unnecessary files read;
- the precision and recall of the impact predicted;
- regressions;
- the cost of building and maintaining the projection: computation, lines of tooling, and the check failures it
  causes.

**Size:** 3 to 5 runs per task and arm, so about 110 to 180 runs. **Estimate, not measured:** $150 to $400 in agents'
cost at J5b's rates.

**Leakage:** the projection is built from the repository at the task's start commit only, never from hidden tests or
kits. A task's text names no file.

**Rejection, written before the runs.** The direction is dropped if either holds:
- C does not reach success with at least 20% fewer tokens than B, without a loss of success;
- C's recall of the impact is not better than B's with text search.

## 9. Decisions asked

| | Decision | If yes |
| --- | --- | --- |
| K1 | Measure the share of an attempt spent exploring, on a few logged tasks | A pilot of a few runs; no tooling built |
| K2 | Rules become named units with their origin and evidence, in an application's conventions register held by the check | An ADR; the register and its check, in step with the review's P0 |
| K3 | Build the read-only `clean-ddd knowledge` query, every edge tagged derived or declared | Tooling only; no rule changes |
| K4 | Register and run the experiment of §8 | The tasks, the ground truth and the criteria committed before any run |

K1 comes first, and may end the direction. K2 is worth doing on its own evidence (J5, J5b). K3 and K4 wait on K1.

## 9b. K1, measured (13 November)

From J5b's own agents' transcripts (172 sessions, kept by the agents' runner beside each attempt's worktree), each tool
call is classed:
- **explore:** reading files, `grep`, listing, the architecture command line;
- **edit:** an edit, a write, a script that writes a file;
- **verify:** a test, the linter, the type checker, the gate;
- **coordinate:** the channel between owners, waiting, the runner's notices;
- **other.**

The context each class brings in is measured as the size of its results. Bytes stand in for tokens (about four bytes
to a token).

| | simple-3 (62 sessions) | clean-3 (110 sessions) |
| --- | --- | --- |
| Tool calls a session (median) | 45 | 66 |
| Share of calls: explore / edit / verify / coordinate / other | 43% / 31% / 11% / 6% / 9% | 38% / 26% / 14% / 16% / 7% |
| Share of the context the tools bring in, from exploring | 82% of 9.3 MB | 73% of 17.8 MB |
| Reads before the first edit (median) | 13 | 12 |
| Of the exploring: reading files / text search / the architecture command line | 66% / 32% / 0% | 65% / 22% / 8% |

**What it says:**
- **Exploring is most of what an agent reads.** Its results are three quarters or more of the context the tools bring
  in, and every later turn reads that context again. The direction is not ended by K1: the gain the projection
  aims at is the largest share of an attempt's input.
- **Agents explore by reading files and searching text, not through the architecture's own commands.** Those are 8% of
  clean-3's exploring. A projection only helps if an agent reaches for it, so the experiment (§8) must measure whether
  arm C calls the query, not only whether it could.
- **Coordinating is 16% of clean-3's calls,** mostly the split's channel and waits, beside the split's cost J5b
  measured.
- **It does not say a projection would shorten the exploring.** That is K3 and K4's question.

The measuring scripts are kept in the operator's notes, not in the repository. They read transcripts that live outside
it.

## 10. Not proposed

- **Postponed:**
  - edges inferred by a model;
  - intent as structured data;
  - "knowledge contracts" between agents beyond the contract-first handoff the integrator already uses;
  - a persistent memory for agents.
- **Rejected:**
  - a separate tree structure;
  - a graph database, a vector database or embeddings;
  - an ontology;
  - a second model of the software kept by hand.

## 11. The recommendation

**Simplify, then pursue.** Make rules named units, with their origin and their evidence, declared where Clean DDD
already declares things and held by the check it already has. Then measure exploration, build the read-only query,
and run the three-arm experiment.

If it passes, Clean DDD would grow from enforcing an architecture into keeping software knowledge verifiable. It would
keep the principle it already has: knowledge is derived or checked, never only written down.
