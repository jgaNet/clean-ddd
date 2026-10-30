# Parallel coding agents on one codebase: contract-first coordination, integration, merge conflicts

Scope note: the current date is 2026-10-30. Almost every agent-specific source below is a 2026 arXiv preprint. Only AgenticFlict (AIware 2026) and "Passes Alone, Fails Together" (EXPRESS 2026 workshop) list an acceptance at a peer-reviewed venue. Practitioner and vendor sources are kept in a separate subsection and labelled as such. "Abstract only" means the full text was not read in this session.

## 1. "Contract-Coding" (arXiv 2604.13100, April 2026): method, benchmark, results, baselines, limitations

### Takeaway
Contract-Coding drafts a dual-layer "Language Contract" before any code exists. The natural-language PRD and technical spec are the human-readable layer; a symbolic kernel of module paths, type signatures and state is what the scheduler uses. Workers then implement modules in parallel, seeing only the contract, and a deterministic auditor holds the code to that contract. On a 5-task "Greenfield-5" benchmark of games built from scratch, the full system scored 100/100/87/80/47% overall success. It led or tied on four tasks and was beaten on the hardest one (Roguelike: 47% vs Gemini Studio's 63%). Every model is GPT-4o or a commercial IDE: there is no single-agent baseline in the sense of Claude Code or Cursor, and the closest thing to one is the paper's own sequential "w/o HEG" ablation.

### Cited Findings
**Bibliographic.** Yi Lin, Lujin Zhao, Yijie Shi. "Contract-Coding: Towards Repo-Level Generation via Structured Symbolic Paradigm." arXiv:2604.13100, v1 submitted 2026-04-10, cs.SE (cross-listed to cs.AI), CC BY 4.0. The page lists no venue — [arXiv abs](https://arxiv.org/abs/2604.13100). The full HTML was read, apart from its last ~12k characters (end of the appendix) — [arXiv HTML](https://arxiv.org/html/2604.13100)

**Motivation (abstract).**
- In "Vibe Coding", vague intent overwhelms step-by-step reasoning, so repository-level generation "collapses architecturally".
- The contract is a Single Source of Truth. It keeps modules independent (information hiding), which shortens the chain of execution dependencies and lets modules be built in parallel — [arXiv abs](https://arxiv.org/abs/2604.13100)

**The Language Contract 𝒞 is dual-layer** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- **Constraint Projection (natural language).** A Product tier holds the PRD (overview, user stories, constraints). A Technical tier holds the project structure, "global shared knowledge", a Mermaid dependency diagram and symbolic API specs. Each API entry gives the file path, owner agent, version, status, classes, attributes and method signatures with docstrings.
- **Executable Kernel 𝒦 = ⟨𝒩, Σ, Δ⟩**, projected from the API section. 𝒩 maps modules to file paths, Σ holds type signatures and Δ is the state space. The graph scheduler reads only the kernel.

**Contract mutation is restricted** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- Edits are limited to `Add` and `Update` primitives of the form ⟨op, section, δ⟩, and each edit re-projects the kernel.
- An edit that breaks graph acyclicity or type safety is rejected.
- Concurrent contract updates are merged with a "Union-First" strategy against a baseline contract, not last-write-wins (Appendix A).

**Initialization** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- A Generator agent drafts the contract from the user's intent.
- A Discriminator agent then makes one audit pass for architectural soundness and completeness.

**Parallel execution (Hierarchical Execution Graph, HEG)** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- Each task's status is Todo, Done, Error or Verified.
- A Todo or Error task gets a Worker, which receives only the task and the full contract, never other modules' raw code.
- A Done task gets a Verifier/Critic, which checks the code against the contract signatures.
- There is no lock-step synchronization. The run converges when every task is Verified, and depth is bounded by T_max.

**Contract-guided auditing: a deterministic Auditor with three metrics** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- **E(𝒞), structural alignment:** the fraction of contract tasks that have a matching file. A missing symbol triggers "Task Injection".
- **S(𝒞), state synchronization:** parses agent outputs and can regress a task from Done to Error, which reschedules its owner.
- **V(𝒞), consistency:** checks that the recorded signatures match the code in the workspace. A silent signature change is rejected and a Synchronization Task is injected. That task requires either reverting the code or a formal "Contract Amendment".

**Roles named in the paper:** Generator, Discriminator, Workers (e.g. Backend Engineer, Algorithm Engineer), Code Reviewer/Critic and Auditor. In the Plane Battle case study, the Code Reviewer patches the contract schema — [arXiv HTML](https://arxiv.org/html/2604.13100)

**Benchmark "Greenfield-5"** (curated by the authors) — [arXiv HTML](https://arxiv.org/html/2604.13100)
- Five tasks: Gomoku (logic-heavy, AI opponent); Plane Battle (action); City Sim (resource management, >10 files); Snake++ (event-driven, 13–15 files in the spec but labelled "16 Files" in Table 4); Roguelike (system architecture, 15–25 files).
- Overall success is the average of Executability, Interactivity and Rule Adherence. Human reviewers score each under a triple-blind protocol (Appendix E).
- Each result is the mean of 10 runs.

**Models and hardware** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- Contract-Coding and the academic baselines use gpt-4o-2024-11-20 at temperature 0.0 with a 16k context window.
- Commercial IDEs use their own backbones: CodeBuddy uses GPT-5.1-Codex-Max, Trae uses GPT-5 Medium, Gemini Studio uses Gemini 3 Flash Preview, and Lingma's backbone is "Default".
- The model ablation uses Qwen-Plus.
- Hardware: a MacBook Pro M2 Pro with 32 GB.

**Baselines** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- Academic multi-agent frameworks: MetaGPT, ChatDev, FLOW.
- Single-agent scaffold: OpenHands.
- Commercial AI IDEs: Lingma, Trae, Gemini Studio, CodeBuddy.
- Claude Code, Cursor and a plain single-LLM baseline are not evaluated.

**Table 1: overall success % / files / seconds** — [arXiv HTML](https://arxiv.org/html/2604.13100)

| Method | Gomoku | Plane Battle | City Sim | Snake++ | Roguelike |
|---|---|---|---|---|---|
| MetaGPT | 70% / 5.2 / 126 s | 50% / 4.0 / 129 s | 30% / 3.0 / 185 s | 10% / 4.0 / 210 s | 10% / 10.9 / 261 s |
| ChatDev | 93% / 4.4 / 88 s | 90% / 5.1 / 79 s | 45% / 6.0 / 140 s | 25% / 7.2 / 165 s | 10% / 13.9 / 144 s |
| FLOW | 96% / 1.0 / 155 s | 76% / 1.0 / 76 s | 60% / 1.0 / 110 s | 30% / 1.0 / 130 s | 0% / 1.0 / 90 s |
| OpenHands | 100% / 3.3 / 173 s | 90% / 4.9 / 182 s | 63% / 7.3 / 296 s | 50% / 13.7 / 267 s | 30% / 14.1 / 311 s |
| Lingma | 100% / 1.0 / 127 s | 86% / 1.4 / 125 s | 75% / 8.0 / 220 s | 60% / 12.0 / 310 s | 33% / 24.7 / 620 s |
| Trae | 70% / 13.7 / 393 s | 80% / 14.5 / 411 s | 85% / 19.0 / 350 s | 65% / 22.0 / 412 s | 47% / 23.9 / 218 s |
| Gemini Studio | 100% / 10.3 / 103 s | 100% / 9.6 / 165 s | 87% / 13.0 / 49 s | 83% / 15.5 / 108 s | 63% / 16.6 / 72.1 s |
| CodeBuddy | 96% / 2.8 / 91 s | 100% / 3.0 / 92 s | 60% / 14.0 / 196 s | 60% / 11.7 / 414 s | 40% / 19.6 / 422 s |
| w/o HEG (sequential) | 100% / 4.0 / 205 s | 100% / 6.1 / 201 s | 85% / 11.2 / 480 s | 78% / 16.0 / 465 s | 47% / 25.0 / 510 s |
| **Contract-Coding (full)** | **100% / 4.0 / 136 s** | **100% / 6.2 / 117 s** | **87% / 11.2 / 257 s** | **80% / 16.2 / 198 s** | **47% / 14.2 / 232 s** |

**Roguelike detail (Table 5)** — [arXiv HTML](https://arxiv.org/html/2604.13100)

| Method | Architectural structure | Dependencies | Executability | Interactivity | Rules |
|---|---|---|---|---|---|
| Contract-Coding | 100 | 92 | 90 | 20 | 30 |
| Gemini Studio | 80 | 80 | 70 | 70 | 50 |
| OpenHands | 80 | 50 | 70 | 10 | 10 |
| ChatDev | 0 | 10 | 20 | 10 | 0 |

- This table backs the "near-perfect structural integrity" claim, but Contract-Coding's interactivity and rule adherence are low.
- Roguelike code is about 8,857 tokens against a contract of about 1,900 tokens ("4.6x compression").
- Token and monetary cost are not reported.

**Ablations** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- **Without the contract (Table 6):** Plane Battle drops to 65% (from 100%) and Gomoku to 85%; task existence drops to 82% (from 100%).
- **Without the parallel graph (sequential):** success is roughly the same, but it is slower (City Sim 480 s vs 257 s; Snake++ 465 s vs 198 s). Parallelism therefore buys latency, not quality.
- **Qwen-Plus instead of GPT-4o (Table 7):** matches GPT-4o at 100% on Plane Battle and Gomoku. Only two tasks were tested.

**Author-stated limitations** — [arXiv HTML](https://arxiv.org/html/2604.13100)
- The "O(1)" dependency depth applies only to the information flow between modules during parallel implementation. Total latency depends on synchronization-repair rounds, which may grow with coupling.
- No standard greenfield multi-file benchmark exists, so the tasks are curated games. A benchmark of more than 100 files is future work.
- Commercial IDEs are black boxes, which limits reproducibility.
- On Roguelike, Contract-Coding (47%) is below Gemini Studio (63%). The authors call its failures "local logic errors" rather than architectural collapse.
- Internal inconsistencies: Snake++ is specified at 13–15 files but labelled "16 Files" in Table 4, and Appendix C.3's "117.7 s" differs from Table 1's 117 s.

### Inferences
- **Similarity to our arm C.** Contract-Coding's contract plays the same role as arm C's frozen contract (expected storm, per-context plans, shared-kernel integration events). Both fix the inter-module interface before implementation, and each worker sees the contract, not its peers' code.
- **Difference: amendments.** Contract-Coding lets the contract be amended during implementation (Add/Update primitives, Synchronization Tasks, Union-First merges). In our study the contract is frozen, and an agent stopped (BLOCKED) rather than change it.
- **Difference: integration.** Contract-Coding integrates continuously through an auditor. We integrate with a single writer plus a gate and a red acceptance test.
- **Difference: setting.** Contract-Coding is greenfield games with GPT-4o and human-scored success. Ours is a real backlog on an existing codebase with executable gates.
- **The sequential ablation is the closest analogue to "one agent vs fan-out".** Its result — same quality, slower — is consistent with parallelism buying wall-clock time rather than correctness.

### Gaps
- Per-task variance across the 10 runs and the human scorers' agreement were not extracted.
- The last ~12k characters of the HTML (end of the appendix) were not read.
- No peer-reviewed venue is known as of 2026-10-30.
- There is no evaluation on an existing (brownfield) repository, and no cost or token comparison.

## 2. Other academic work on contract-, interface- or specification-first parallel code generation by LLM agents

### Takeaway
A 2026 cluster of preprints shares one idea: declare scopes and interfaces before the agents write, then schedule or admit their writes against those declarations. This cuts textual conflicts and failed integrations sharply in small controlled studies. CooperBench shows the baseline problem: two uncoordinated agents lose about 30% success relative to working solo, and chat between them does not fix it. Claim Plane shows the catch: strict pre-write admission buys reliability mostly by serializing the work. Coverage is limited — mostly single-author preprints, small scenario counts, often simulation.

### Cited Findings
**CooperBench** (Khatua, Zhu, …, Diyi Yang; Stanford/SAP), arXiv:2601.13295, v1 2026-01-19, v2 2026-01-26. Preprint, no venue listed. Abstract only — [arXiv](https://arxiv.org/abs/2601.13295)
- More than 600 tasks across 12 libraries in 4 languages. Each task gives two agents different features that can be built independently but may conflict without coordination, with expert-written tests.
- "Curse of coordination": agents working together average about 30% lower success than when each performs both tasks individually.
- Failure modes: jammed communication (vague, ill-timed, inaccurate messages); agents deviating from their commitments; wrong expectations about the other agent's plans.
- Secondary sources (not the paper itself) describe the setup: patches are merged with git merge-file and a small fine-tuned resolver (Qwen 3 Coder 1.5B); communication reduces merge conflicts but not overall success; agents spend up to about 20% of budget on communication — [PyPI cooperbench 0.0.18](https://pypi.org/project/cooperbench/0.0.18/); [Moonlight review](https://www.themoonlight.io/review/cooperbench-why-coding-agents-cannot-be-your-teammates-yet)

**NP-Bench and a scheduling planner** (Sumanyu Muku), arXiv:2610.07261, 2026-10-05, cs.AI. Preprint, no venue. Abstract only — [arXiv](https://arxiv.org/abs/2610.07261)
- Treats coordination as scheduling: work is partitioned into disjoint scopes declared up front, and merges are ordered along producer→consumer dependencies. The planner is implemented in a tool called Nerveplane.
- Three arms: no coordination, reactive detection, proactive planning. Integration is checked with a real git merge, in a deterministic simulation and with live agents.
- Simulation: clean integration rose from 1/9 to 9/9 scenarios, and merge conflicts fell from 13 to 0. The gap widened as the number of agents grew.
- Live breaking contract change: clean-integration rate went from 0 under both baselines to 1.0 on a frontier model and 0.6 on a small model. Scope leakage was 0 of 5 cases.
- Routing facts to agents did not improve long-context accuracy at window-fitting scales (negative result).
- The benefit held across two model tiers and two vendors; the author attributes it to how work is allocated rather than to model reasoning.

**Claim Plane** (Maxim Nikolaev), arXiv:2608.00947, 2026-08-02, cs.SE, 10 pages. Preprint. Abstract only — [arXiv](https://arxiv.org/abs/2608.00947)
- Mechanism: deterministic pre-write admission over versioned "change intents".
- Design: 30 frozen CooperBench feature pairs (15 labelled conflict, 15 clean), 3 seeds, 4 arms, 360 executions.
- A stronger planner (DeepSeek V4 Pro) wrote 60 feature-level declarations once, frozen across all arms. A lighter model (DeepSeek V4 Flash) did the coding.

| Measure | Unconstrained parallel | Static Claim Plane | Dynamic admission |
|---|---|---|---|
| Pair pass, all pairs | 23.3% | 50.0% (+26.7 pp, 95% CI 9.6–60.0) | 22.2% |
| Pair pass, conflict pairs | 6.7% | 60.0% | — |
| Integration success | 65.6% | 96.7% | — |
| Executions serialized | — | 96.7% (93.3% of clean cases) | 66.7% of conflict cases, 13.3% of clean cases |
| Executions failed closed | — | — | 46 of 90, on undeclared scope |

- Of the 46 failed-closed blocks under dynamic admission, 45 hit files already in the frozen declarations. The author reads this as region undercoverage and weak amendment handling.
- The author's conclusion: admission is a reliability mechanism, and the study shows no useful wall-clock speedup.

**CodeTeam** (Wang, Li, Liang, Feng, Li, Shahin, Khan), arXiv:2606.22082, 2026-06-20. Submitted to a journal. Abstract only — [arXiv](https://arxiv.org/abs/2606.22082)
- Planning: several Architect agents draft competing software design sketches (SDS). A CTO agent selects one and normalizes it into a "machine-checkable contract" covering file ownership, public interfaces and dependency constraints.
- Implementation: Developer agents work under a dependency-aware scheduler with bounded context and lightweight Git coordination. A QA agent runs tests and drives repairs.
- Results:
  - NL2Repo-Bench average test pass rate: 34.6% (prompt engineering) and 42.3% (supervised fine-tuning), the highest in both settings.
  - SketchBLEU: +4.1 and +2.9 points over the CodeS baselines.
  - Ablations: developer allocation and retrieval-augmented planning contribute 9.9% and 8.1% relative SketchBLEU.

**Further pointers, found by search but not read here** — [search result: ProjectGen arXiv](https://arxiv.org/pdf/2511.03404); [API-first arXiv](https://arxiv.org/abs/2510.19274)
- ProjectGen (arXiv:2511.03404): architecture design, then skeleton, then code filling, with the CodeProjectEval dataset of 18 repositories.
- "From Specification to Service" (arXiv:2510.19274): agents generate an OpenAPI spec first, then the server code; works best when the spec is small.

### Inferences
- **A shared pattern.** NP-Bench (disjoint declared scopes and producer→consumer merge order), Claim Plane (frozen declarations and admission), CodeTeam (file-ownership contract) and Contract-Coding (owner per module in the contract) all converge on ownership plus interfaces fixed up front. That is the role bounded contexts and shared-kernel integration events play in arm C.
- **Arm B is the "unconstrained parallel" arm of this literature.** Losing 3 of 7 features to conflicts in one context is consistent with Claim Plane's 23.3% pair pass and 65.6% integration success unconstrained, and with CooperBench's roughly 30% drop.
- **Claim Plane's serialization caveat applies to us.** Ownership by bounded context only gives parallelism if the backlog's features fall into different contexts. Features that land in the same context must be serialized or merged.
- **Claim Plane's dynamic-admission failures echo our BLOCKED agent.** Agents failed closed on undeclared scope; ours stopped rather than amend a frozen contract. A frozen contract trades fewer conflicts for stops whenever the contract under-covers the work.

### Gaps
- None of these 2026 preprints was found to be peer-reviewed.
- Absolute solo vs cooperative success rates in CooperBench were not extracted (abstract only).
- Older peer-reviewed decomposition work was not checked in this session: Parsel (NeurIPS 2023), MetaGPT (ICLR 2024; its SOP includes interface design before coding), CodePlan (FSE 2024).

## 3. Empirical evidence on merge conflicts and integration failures with parallel AI agents

### Takeaway
GitHub-mined studies show that agent PRs often overlap in time. 79% of AIDev-pop agent PRs were open alongside another agent PR, and replayed merges of such pairs conflict textually 19.8% of the time within one agent and 41.7% across agents. Across 107K+ simulated agent-PR merges, the conflict rate is 27.67%. These are textual lower bounds. The controlled "stale" study shows semantic (pass-alone, fail-together) failures in 97% of constructed interface-change runs, yet almost none in 834 runs on reviewed, real Django PR pairs. Practitioner reports converge on two points: conflicts cluster in "convergence-point" files such as command registries and wiring, and running features serially (or with explicit scopes) is safer.

### Cited Findings

#### Peer-reviewed or accepted at a venue
**AgenticFlict** (Daniel Ogenrwot, John Businge). arXiv:2604.03551, v1 2026-04-04, v2 2026-05-12. Accepted at the 3rd ACM International Conference on AI-Powered Software (AIware 2026). Abstract only — [arXiv](https://arxiv.org/abs/2604.03551)
- 142K+ agentic PRs from 59K+ repositories; 107K+ processed by deterministic merge simulation.
- 29K+ had textual conflicts, a conflict rate of 27.67%; 336K+ conflict regions were extracted.
- Conflicts are "frequent and often substantial" and vary noticeably by agent. Per-agent rates are not given in the abstract.

**"Passes Alone, Fails Together: Benchmarking Semantic Coordination in Parallel LLM-Agent Development"** (Haocheng Xia, Eugene Wu, Yongjoo Park). arXiv:2609.25396, 2026-09-21. Accepted to the 2nd Workshop on Explainable and Reliable Software Systems (EXPRESS 2026), 6 pages. Full HTML read — [arXiv abs](https://arxiv.org/abs/2609.25396); [HTML](https://arxiv.org/html/2609.25396v1)
- Defines semantic coordination failure: each patch passes alone, but the merged result fails because one changed an interface or rule the other depends on.
- Metric Δblind: tests that pass with each patch alone and fail only after the merge. Tests that already fail with any single patch are excluded.

| Tier | What it is | Result |
|---|---|---|
| Synthetic | Scripted helper-interface changes: rename, required argument, return-type change | Interference grows with the number of changed helpers. An oracle message about the finished change cuts mean interference from 2.50 to 0.04 (−98%); return-type changes still average 0.13 failures. |
| Mined | 417 validated Django pairs of merged PRs, 834 runs; GPT-5-class model via mini-swe-agent and OpenHands | Only 1 run with Δblind > 0, after correcting the grading |
| Constructed | 36 instances on 12 real Django helpers; GPT-5.5 | Blind interference in 105/108 runs (97%). A message describing the completed concurrent change recovers 89/108 (82%), or 93% of cleanly merging runs. |

- The grading correction removed two artefacts: agents' edits to test files, and each patch being tested only on its own task's tests while merged patches were tested on both tasks' tests. Every condition now runs the same combined test set.
- The authors' caution: constructed failure rates "should not be taken as estimates of how often this happens in practice", because reviewed PRs may already be compatible.
- Limitations: Django only, pairs only, scripted breaking changes.

#### arXiv preprints, not peer-reviewed
**"AI Agent Pull Requests on GitHub: Frequency, Structure, and Merge Conflict Rates"** (George Xu, Arjun Subramanian, Nithilan Karthik). arXiv:2607.04697v2, 2026-07-07. Full HTML read — [arXiv HTML](https://arxiv.org/html/2607.04697v2)
- Data: the AIDev-pop subset, 33,596 agent PRs in 2,807 repositories, December 2024 to July 2025. PRs per agent: Codex 21,799; Copilot 4,970; Devin 4,827; Cursor 1,541; Claude Code 459.
- Co-activity (open windows overlapping):

| Padding window | Repositories with co-active agent PRs | Agent PRs co-active with another |
|---|---|---|
| k = 0 days | 40.2% | 79.4% |
| k = 7 days | 53.4% | 95.0% |

- Replayed three-way merges with `git merge-tree`: 747 sampled pairs, of which 716 were evaluable.
  - Intra-agent pairs: 19.8% textual conflicts (119/601).
  - Cross-agent pairs: 41.7% (48/115). The 95% confidence intervals do not overlap.
- Conflict types: content 57.6%, modify/delete 26.8%, add/add 15.1%, other 0.5%. About 42% are therefore structural rather than overlapping lines.
- Files involved: 84.4% of conflicted files are source code; manifests and lockfiles are 3.9%.
- Concentration: the top 10 repositories hold 91.4% of raw co-active pairs.
- Limitations: textual conflicts only (a lower bound; build and semantic conflicts not measured); no comparison with human PRs; small cross-agent sample.

**AIDev dataset** ("The Rise of AI Teammates in Software Engineering (SE) 3.0", Hao Li, Haoxiang Zhang, Ahmed E. Hassan). arXiv:2507.15003, 2025-07-20. Abstract only — [arXiv](https://arxiv.org/abs/2507.15003)
- 456K+ PRs from five agents (OpenAI Codex, Devin, GitHub Copilot, Cursor, Claude Code) across 61K repositories and 47K developers.
- Agent PRs are often faster but accepted less often than human PRs, a "trust and utility gap".
- Per-agent merge rates circulate on secondary aggregators (e.g. humans 76.8%, Codex 64%, Claude Code 52.5%, Copilot 35%). They were NOT verified against the paper, so do not cite them as primary — [EmergentMind topic page](https://emergentmind.com/topics/aidev-dataset)

#### Practitioner and vendor sources (not peer-reviewed; self-reported)
**"Ten agents, one release" (Bernstein 1.9 postmortem).** Project blog, published 2026-04-25, author not named on the page — [docs.bernstein.run](https://docs.bernstein.run/en/latest/blog/ten-agents-one-release/)
- Setup: 10 Claude Opus 4.7 agents, each in its own git worktree and branch, dispatched from 10 YAML tickets that gave acceptance criteria, file scope and "do not touch" constraints. A Python loop with no LLM did the orchestration, and a human approved and ordered the merges (PRs #940–#949).
- Timing: about 25 minutes to all PRs open, about 70 minutes to all merged.
- What broke:
  - 6/10 PRs failed CI on `ruff format --check`; the prompts said "ruff-clean" without naming the formatter.
  - 3 agents wrote files into the main checkout, because `cd` does not persist between shell calls.
  - 3 merge conflicts, all in `src/bernstein/cli/main.py`, where command registrations converge. Each was resolved as "keep both" in under 2 minutes.
- What held: tests grew from about 2,000 to about 2,360 with none broken; about 12,000 LOC were added; agents stayed inside their scopes.
- Lessons: replace convergence points (flat registration lists) with per-package registration and auto-discovery; "the bottleneck in multi-agent shipping moved" to whether the codebase can absorb parallel writers.

**Factory "Missions".** Vendor announcement — [factory.com/news/missions](https://factory.com/news/missions)
- "Agents conflict, duplicate work, and drift without structure."
- "Serial execution with targeted parallelization has worked better than broad parallelism."
- Every milestone ends with a validation phase (tests, regressions, integration, UI checks).
- Run lengths: median mission about 2 h; 37% run over 4 h; 14% over 24 h; the longest ran 16 days. A median mission uses 12x the tokens of a normal session.
- Date: the fetched page gave "February 26, 2025", but the models it names (Opus 4.6, Sonnet 4.6, GPT-5.3-Codex) suggest 2026. Treat the date as uncertain.
- A ZenML LLMOps case-study summary of a Factory talk ([ZenML](https://zenml.io/llmops-database/multi-agent-software-development-system-with-extended-autonomous-execution), citing a [YouTube talk](https://www.youtube.com/watch?v=ow1we5PzK-o)) adds two points:
  - Features run serially, because parallel agents "conflict, overwrite each other's changes, duplicate effort, and make inconsistent architectural decisions".
  - A "validation contract" is written during planning, before code. This is a secondary summary.

**Pact (`pact-agents`, github.com/jmcentire/pact).** Open-source project; claims are the project's own — [PyPI pact-agents](https://pypi.org/project/pact-agents/0.14.0/)
- Contract-first: components get typed interface contracts and executable tests before implementation agents start.
- Options: `parallel_components` and `competitive_implementations`. Coding agents cannot modify the tests that judge them, and contracts, tests and implementations are hashed with SHA-256.
- Self-reported benchmark (ICPC World Finals): 212/212 at about $13 vs 167/212 for single-shot Claude Code at $0.60. Unverified.
- The project advises a single session when one pass suffices.

**Secondary commentary (low weight):** a HackerNoon post reports 7 of 10 merges conflicting when agents could message but not share code — [HackerNoon](https://hackernoon.com/four-ai-coding-agents-one-codebase-and-a-coordination-problem). The figure is unverified.

### Inferences
- **Our arm B fits the mined base rates.** 3 lost features out of 7 is high compared with 19.8%–27.67% textual conflict rates, but those rates are per pair of PRs. Arm B's agents were all concurrent and concentrated in one context, the condition under which Xu et al. see conflicts concentrate (structural add/add and modify/delete conflicts, convergence files).
- **Wiring is our convergence point.** Bernstein's single convergence file (`cli/main.py`) is the analogue of a context's wiring file or Module. In a DDD layout, the Module, the routes and the shared kernel are where parallel writers collide.
- **What our gate and acceptance test catch.** The "stale" study's Δblind is exactly the failure an integration gate plus acceptance test exists to catch: the merge succeeds textually, then fails a test.
- **Why the contract helps.** Their 82–98% recovery from a message describing the finished change suggests that freezing the shared interface up front (the integration events in the shared kernel) removes most semantic interference by construction.
- **Factory's serial-by-default rule is the same trade-off as Claim Plane's.** Both make parallel fan-out the exception, used where coordination cost is low.

### Gaps
- No academic study was found that measures semantic or build conflicts (not just textual ones) on real multi-agent fan-outs in production repositories.
- AgenticFlict's per-agent rates and AIDev's per-agent merge rates were not verified from full texts.
- No peer-reviewed study was found comparing one agent against a fan-out on the same backlog, which is our study's design.

## 4. Classic software-engineering literature that predicts these outcomes

### Takeaway
Four bodies of work predict our observations:
- **Conway (1968):** the structure of the design mirrors the communication structure of the team that builds it.
- **Parnas (1972):** decompose by hidden design decisions, so modules can be built independently once their interfaces are fixed.
- **Cataldo & Herbsleb (2008, 2013):** when coordination does not match the coordination that technical dependencies require, productivity drops and failures rise.
- **Brun et al. (FSE 2011 / TSE 2013):** parallel-development conflicts are frequent and persistent, and many surface not as textual conflicts but as later build and test failures.

### Cited Findings
- **Conway's law.** Melvin E. Conway, "How Do Committees Invent?", *Datamation*, April 1968: organizations that design systems are "constrained to produce designs which are copies of the communication structures of these organizations"; Conway argues design efforts should be organized around communication needs — [melconway.com](http://www.melconway.com/Home/Committees_Paper.html)
- **Parnas.** D. L. Parnas, "On the Criteria To Be Used in Decomposing Systems into Modules", *Communications of the ACM* 15(12), December 1972: modularize around design decisions likely to change (information hiding), so that modules can be written by separate groups with little communication — [ACM DL DOI 10.1145/361598.361623](https://dl.acm.org/doi/10.1145/361598.361623). The ACM page returned 403 in this session, so this summary comes from the standard bibliographic record, not a fetched copy.
- **Socio-technical congruence.** Cataldo, Herbsleb and colleagues, ESEM 2008; extended in IEEE TSE 2013 as "Coordination Breakdowns and Their Impact on Development Productivity and Software Failures". Read from abstracts and bibliographic listings only — [O'Reilly "Making Software" ch. 11](https://www.oreilly.com/library/view/making-software/9780596808310/ch11s02.html); [CAS catalog record](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi...........30d25ec792035fd9417515cd0af1296f)
  - Congruence is the match between the coordination that technical dependencies require and the coordination that actually happens.
  - Higher congruence was associated with faster resolution of modification requests and higher productivity; gaps were linked to more software failures.
  - Logical (co-change) dependencies mattered more than call or data dependencies.
- **Conflict detection in parallel development.** Yuriy Brun, Reid Holmes, Michael D. Ernst, David Notkin, "Proactive Detection of Collaboration Conflicts", ESEC/FSE 2011, pp. 168–178 (ACM SIGSOFT Distinguished Paper); extended as "Early Detection of Collaboration Conflicts and Risks", IEEE TSE 39(10), October 2013, pp. 1358–1375 — [Ernst abstract page](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-tse2013-abstract.html); [UBC award note](https://www.cs.ubc.ca/award/2011/09/acm-sigsoft-distinguished-paper-award-fse)
  - Studied 9 open-source systems totalling 3.4 MLOC, with 550,000 development versions.
  - Conflicts are frequent and persistent, and show up as later build and test failures as well as overlapping textual edits.
  - The Crystal tool uses speculative merging to warn developers early.
- **Semantic merge.** The stale paper cites Mens (2002) and Sousa et al. (2018) for semantic and three-way merge, and Brun et al. (2011) for proactive conflict detection, as the classic frame for "passes alone, fails together" — [stale HTML](https://arxiv.org/html/2609.25396v1)

### Inferences
- **Conway and congruence predict arm B's losses.** Arm B assigns agents by feature while the code's dependencies run through bounded contexts. Coordination requirements (several features touching one context) then go unmet, because the agents do not communicate.
- **Arm C aligns the "organization" with the architecture.** One agent per bounded context is Conway's law applied on purpose (the inverse Conway manoeuvre). The frozen shared-kernel events are Parnas's fixed interfaces.
- **Brun et al. predict the rest.** Textual conflicts are only part of the problem. A gate that runs build, types and tests after integration catches the rest, as our single writer's gate does.
- **Our contradictory storms are a version of the congruence problem.** A later feature changed an earlier feature's command, so two expected storms contradicted each other. That is a logical dependency that crosses features, which a feature-by-feature contract does not express.

### Gaps
- Parnas's and Cataldo's full texts were not fetched in this session; their citations rely on standard bibliographic data and abstracts.
- Exact numbers from Brun et al. — what share of conflicts are build or test conflicts rather than textual ones — were not extracted. The TSE 2013 full text would give them.
- Not checked in this session: Horwitz, Prins & Reps (1989) on integrating non-interfering program versions; Sarma et al.'s Palantír (TSE 2012); Kasi & Sarma's Cassandra (ICSE 2013) on scheduling tasks to avoid conflicts, which is a direct precursor of NP-Bench's scheduling approach.
