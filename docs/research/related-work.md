# Single agents win until decomposition pays

The published literature agrees with the central result of our pilot. With a strong model on sequential, tool-heavy software work, one agent matches or beats multi-agent organisations at lower cost, and parallel writers without coordination lose work at integration. The most controlled study to date covers 260 configurations. It finds a mean multi-agent effect of **−0.3%**, every multi-agent topology at or below the single agent on SWE-bench Verified, and **17.2× error amplification** for independent parallel agents against 4.4× for centralized ones ([Kim et al., v3](https://arxiv.org/html/2512.08296)). The work on parallel coding agents tells the same story from the other side. Two agents working together lose about **30%** of the success one agent achieves alone ([CooperBench](https://arxiv.org/abs/2601.13295)). Declared ownership and frozen contracts restore integration, but mostly by serialising the work: integration rises from 65.6% to 96.7% while 96.7% of executions are serialized ([Claim Plane](https://arxiv.org/abs/2608.00947)). We found no published work that compares one gated agent with an architecture-coordinated fan-out on the same multi-feature backlog with the same tools. We also found none that uses a mechanically enforced architecture (import rules generated from a dependency table, a checked context map, event storms held to the code) as the coordination mechanism between agents. The closest work treats a prose or code-proximate specification as the coordination artefact ([Chacón Sartori](https://arxiv.org/abs/2603.24284)), and a systematic review names conformance checking as underexplored ([Schmid et al.](https://arxiv.org/abs/2505.16697)). That is the gap our study fills. The main tension is with contract-first systems such as [Contract-Coding](https://arxiv.org/html/2604.13100), whose parallel version is faster than its sequential one, while our arm C was slower than arm A. Before publication, the study needs six things: results reported as distributions with paired per-feature outcomes, a budget-matched single-agent baseline and a no-kit baseline, a human-validated read grader from another model family, a timestamped pre-registration with a deviations section, clean timing, and the full configuration and traces released ([Baltes et al.](https://llm-guidelines.org/checklist/); [Kapoor et al.](https://arxiv.org/html/2407.01502)).

A note on sources. Most agent-specific work cited here is a 2025–2026 arXiv preprint. Each source is marked inline as *peer-reviewed* (with venue), *preprint*, *practitioner/vendor*, and *abstract only* where only the abstract or a programme page was read. The appendix gathers these statuses. Several numbers were taken from HTML extraction and are flagged for checking against the PDF before they go into the paper.

## Coordination pays on decomposable work and loses on sequential work

**Kim et al., "Towards a Science of Scaling Agent Systems"** (preprint; Google Research, Google DeepMind and MIT; v3 of 8 April 2026, full text read) is the closest prior work to our A-versus-C comparison. It compares a single-agent system against four multi-agent topologies: independent (parallel workers, synthesis only), centralized (orchestrator), decentralized (peer debate) and hybrid. Tools, prompts and compute are held equal over 260 configurations on six benchmarks ([Kim et al., v3](https://arxiv.org/html/2512.08296)). The mean multi-agent effect is **−0.3%, with a 95% CI from −58.7% to +77.2%**. That average hides opposite results. Centralized coordination gains **+80.8%** on parallelizable financial analysis (0.631 vs 0.349). Every topology loses on sequential planning, from −39.1% (hybrid) to **−70.0%** (independent). The authors conclude that "sequential interdependence, rather than complexity alone, determines coordination viability" ([Kim et al., v3](https://arxiv.org/html/2512.08296)).

Software engineering sits on the losing side. On SWE-bench Verified every topology scores at or below the single agent: hybrid −2.1%, centralized −3.1%, decentralized −5.4%, independent **−14.9%**. On Terminal-Bench, centralized coordination loses 19.2% ([Kim et al., v3](https://arxiv.org/html/2512.08296)). The paper identifies three mechanisms that apply directly to our setting:

- **Capability saturation.** Coordination returns turn negative once the single agent scores above about **45%** (β̂ = −0.236, p = 0.004). The authors call this their most robust finding.
- **A tool-coordination penalty.** Tool-heavy tasks suffer most from coordination overhead (β̂ = −0.096, p = 0.002).
- **Token overhead.** Overhead is 58% for independent agents, **285% for centralized** and 515% for hybrid. Successes per thousand tokens fall from 67.7 for the single agent to 21.5 for centralized coordination.

All three come from the same source ([Kim et al., v3](https://arxiv.org/html/2512.08296)).

Error amplification is the most quoted figure, but it needs care. Independent topologies amplify trace-level errors 17.2×, centralized ones 4.4×. After controlling for the other metrics, however, the main effect of amplification on performance is not significant (β̂ = 0.014, p = 0.658) ([Kim et al., v3](https://arxiv.org/html/2512.08296)). The software results also rest on thin data. The SWE-bench and Terminal-Bench cells use **20-instance subsets** with bootstrap intervals of about ±20 points, and the authors call these pairwise comparisons "underpowered at n = 20". Cite v3 specifically: its cross-validated R² (0.373 / 0.413) differs from the 0.513 / 0.524 widely quoted from v1 and v2, which had no software benchmarks ([v1](https://arxiv.org/html/2512.08296v1); [v2](https://arxiv.org/html/2512.08296v2); [abs](https://arxiv.org/abs/2512.08296)).

Four independent lines of work support capability saturation and the strength of single agents.

- **Gao et al.** (UIUC; preprint). Multi-agent gains on code shrink as models improve: MetaGPT on HumanEval goes from **10.7% to 3.0%**, and self-collaboration on MBPP from 16.0% to 1.2%. Multi-agent systems still spend **4–220× more prefill tokens**, and about 80% of examples are ties ([Gao et al.](https://arxiv.org/html/2505.18286v1)). The authors propose routing and a cascade: run the single agent first and escalate to multiple agents only when cheap verification fails. The abstract claims cost savings of up to 20%, but the body reportedly cites up to 88.1%. Check this inconsistency in the PDF before quoting a cost figure ([Gao et al., abs](https://arxiv.org/abs/2505.18286v1)).
- **Wang et al.** (peer-reviewed, ACL 2024). A single ChatGPT-3.5 agent given demonstrations scores **75.63**, above every discussion configuration; the best, a six-agent Conquer-and-Merge Discussion, reaches 74.46 ([Wang et al.](https://arxiv.org/html/2402.18272v1); [ACL Anthology](https://preview.aclanthology.org/add_acl24_videos/2024.acl-long.331)).
- **Tran & Kiela** (Stanford; preprint). Under equal thinking-token budgets, the single agent is best or tied at every budget except 100 tokens; at 1k tokens it scores 0.418 against 0.388 for the best multi-agent variant. Multi-agent setups overtake it only when the single agent's context is heavily degraded ([Tran & Kiela](https://arxiv.org/html/2604.02460)).
- **Jwalapuram et al.** (preprint; abstract only). Automatically generated multi-agent systems "consistently underperform CoT-SC despite being up to 10x more expensive". On a synthetic task built for explicit decomposition, context separation and parallelism, expert-architected systems beat generated ones. The authors argue that current benchmarks do not test those advantages ([Jwalapuram et al.](https://arxiv.org/abs/2606.13003)).

**"More Agents Is All You Need"** (peer-reviewed, TMLR) belongs in a different category. Sampling many answers and voting does scale with the number of agents, but cost grows linearly and the gains shrink for stronger models. It is redundancy, not the division of labour our arms B, C and C′ practise, and the paper should say so to keep the two apart ([Li et al.](https://arxiv.org/html/2402.05120)).

**MAST**, the failure taxonomy of Cemri et al. (peer-reviewed, NeurIPS 2025 Datasets & Benchmarks; the venue was confirmed through listing pages; full text read), provides the vocabulary for failures. It has 14 modes in 3 categories, built with Grounded Theory and applied to **1,642 traces from 7 frameworks**. Human agreement is κ = 0.88 and the LLM judge reaches κ = 0.77. Failure rates range from **41% to 86.7%** ([Cemri et al.](https://arxiv.org/html/2503.13657); [NeurIPS poster](https://neurips.cc/virtual/2025/poster/121528)). System-design failures make up about 44%, inter-agent misalignment about 32% and verification failures about 23.5%. The most frequent modes are:

- step repetition, 15.7%;
- reasoning-action mismatch, 13.2%;
- unawareness of termination conditions, 12.4%;
- disobeying the task specification, 11.8%.

([Cemri et al.](https://arxiv.org/html/2503.13657v3))

The intervention results matter for us. On ChatDev's ProgramDev, sharper role prompts raised success from 25.0% to 34.4%, and adding a task-level verification step raised it to **40.6%**. The authors still conclude that tactical fixes are insufficient and that "structural redesigns" are needed. MetaGPT had 60–68% fewer specification and misalignment failures than ChatDev but **1.56× more verification failures**, which suggests that added structure displaces failures rather than removing them ([Cemri et al.](https://arxiv.org/html/2503.13657)). MAST has no category for concurrent writes to one repository. Its coding traces are turn-taking role-play on small programs, so cite it as a vocabulary, not as evidence about a layered multi-feature codebase.

## Multi-agent coding systems lose once the single-agent baseline is fair

The well-known multi-agent coding systems coordinate by role and phase, not by part of the codebase.

- **ChatDev** (peer-reviewed, ACL 2024) runs a "chat chain" of role pairs (CEO, CTO, programmer, reviewer, tester) through design, coding and testing. On the 1,200 one-line SRDD prompts it reports a quality of 0.3953 against MetaGPT's 0.1523. The generated programs average about **144 lines in 4.4 files** ([ChatDev](https://arxiv.org/html/2307.07924v5)).
- **MetaGPT** (peer-reviewed, ICLR 2024 oral) passes structured artefacts (PRD, system design, interface definitions) through a publish-subscribe pool. On its own SoftwareDev benchmark it reports executability of 3.75 against ChatDev's 2.25 ([MetaGPT](https://arxiv.org/html/2308.00352); [ICLR](https://www.iclr.cc/virtual/2024/oral/19756)).
- The two papers disagree: **each framework wins on its own benchmark**. Self-reported comparisons between frameworks are therefore weak evidence.
- MetaGPT's role ablation is the nearest thing to a single-agent baseline. "Engineer only" scores executability 1.0 at $0.915, against 4.0 at $1.385 for the full team ([MetaGPT](https://arxiv.org/html/2308.00352)). That engineer had no plan and no tests, so it is a straw man next to our arm A.
- Other systems compare against a single LLM call or against other frameworks:
  - Self-collaboration (accepted to TOSEM; abstract only) reports +29.9–47.1% Pass@1 over a single LLM ([Dong et al.](https://arxiv.org/abs/2304.07590)).
  - AgentCoder (preprint; abstract only) reports 96.3% on HumanEval ([Huang et al.](https://arxiv.org/abs/2312.13010)).
  - MapCoder (peer-reviewed, ACL 2024; abstract only) reports 93.9% ([Islam et al.](https://arxiv.org/abs/2405.11403)).
  - MAGIS (peer-reviewed, NeurIPS 2024; read through a summary) reports 25.33% on SWE-bench Lite ([MAGIS](https://proceedings.neurips.cc/paper_files/paper/2024/file/5d1f02132ef51602adf07000ca5b6138-Paper-Conference.pdf)).
- None of these papers compares against a single agent with the same tools, tests and budget.

**Agentless** (peer-reviewed, FSE 2025, DOI 10.1145/3715754) is the canonical counter-result ([FSE programme](https://conf.researchr.org/details/fse-2025/fse-2025-research-papers/85/Demystifying-LLM-based-Software-Engineering-Agents)). A fixed pipeline of localisation, sampled repair and test-based validation, with no autonomous agent, solves **32.00% of SWE-bench Lite at $0.70 per issue**. For comparison:

| System | SWE-bench Lite solved | Cost per issue |
|---|---|---|
| Agentless (fixed pipeline) | 32.00% | $0.70 |
| CodeR (multi-agent) | 28.33% | $3.34 |
| SWE-agent with GPT-4o | 18.33% | $2.53 |

([Agentless v2](https://arxiv.org/html/2407.01489))

The ablation is telling. Majority voting alone gives 25.67%. Regression tests plus reproduction tests raise that to 32.00%, so most of the gain comes from validation, not from the agent architecture. Agentless is also a precedent in method: it reports cost next to accuracy. It is a single run with no variance reported, the same weakness as our pilot.

Independent re-evaluations with one fixed backbone model agree. **Yin et al.** (preprint; full text) ran seven frameworks on DeepSeek-v3.1 ([Yin et al.](https://arxiv.org/html/2511.00872)):

- On SRDD software development, the multi-agent AgentOrchestra and OWL scored 0.36, below single-agent OpenHands at 0.47.
- On SWE-bench Lite they solved **3–10%**, against 49–54% for the single-agent frameworks.
- AgentOrchestra was the costliest, at about $370 against about $115 for OpenHands. The extraction tool summed these totals because the paper's Total row looked misaligned, so check Table 10.
- The paper concludes that "single-agent system consistently demonstrates superior performance compared to multi-agent system".

Two smaller studies (abstract only) point the same way:

- A Chalmers MSc thesis on unit-test generation with Claude Sonnet 4 found a sequential pipeline best (**92.2%**, $0.089 per task), a single agent next (81.1%, $0.083) and a hierarchical supervisor worst (**54.4%**, $0.308), with failures blamed on a supervisor information bottleneck ([Agha & Miqdad](https://odr.chalmers.se/items/2a008985-ebbd-4cd1-926a-947499da2a66)).
- An ICSME 2026 NIER paper on README generation (peer-reviewed; abstract only) found that a single agent matches multi-agent lexical quality with **86% fewer tokens**, and that a developer-guided plan gives the highest quality ([Saleh et al.](https://arxiv.org/abs/2606.30524)).

Both results favour structure fixed up front over autonomous delegation, which describes our arm A: one agent, a gate and expected storms.

Project-level benchmarks are small. ProjectEval (preprint) has 20 tasks, and GPT-4o reaches **12.49 Pass@5** against 7.39 for OpenHands ([ProjectEval](https://arxiv.org/html/2503.07010v2)). DevBench, retitled DevEval (preprint; abstract only), reports that current models "fail to solve the challenges" of the full lifecycle ([Li et al.](https://arxiv.org/abs/2403.08604)). None of these benchmarks scores architecture conformance or the integration of several features into one codebase.

Two practitioner positions from June 2025 frame the debate.

- **Anthropic** (vendor). A multi-agent research system beat single-agent Opus 4 by **90.2%** on an internal research evaluation, at about 15× the tokens of chat. Token usage alone explained 80% of performance variance on BrowseComp. The same post says most coding tasks have fewer truly parallelizable subtasks than research ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **Cognition** (vendor), "Don't Build Multi-Agents". It argues that "actions carry implicit decisions, and conflicting decisions carry bad results" and recommends a single-threaded agent ([Cognition](https://cognition.com/blog/dont-build-multi-agents)). Cognition's mechanism is the informal explanation of our arm B's losses.

## Parallel agents break at integration, and contracts restore reliability rather than speed

**CooperBench** (preprint; listed on an [ICLR 2026 page](https://iclr.cc/virtual/2026/10018462); abstract only) sets the baseline problem. It has more than 600 tasks across 12 libraries and 4 languages, and each task gives two agents features that may conflict. Agents working together average about **30% lower success** than one agent doing both features. The failure modes are jammed communication, broken commitments and wrong expectations about the other agent's plan ([CooperBench](https://arxiv.org/abs/2601.13295)).

**"The Specification Gap"** (preprint; abstract only) breaks this cost down. As specification detail is stripped from 51 class-generation tasks, two-agent integration falls from **58% to 25%** while a single agent falls from 89% to 56%. An AST conflict detector reaches 97% precision, yet its reports bring no benefit. Restoring the full specification recovers the 89% ceiling. The authors split the gap into 16 points of coordination cost and 11 of information asymmetry ([Chacón Sartori](https://arxiv.org/abs/2603.24284)). **Destefanis & Aste** (preprint; abstract only) report on 1,902 runs. Direct messaging grows almost quadratically with team size, and a designated coordinator brings no reliable gain. Agents also went looking for hidden grading material in about four fifths of 244 sealed runs, a warning for any evaluation harness ([Destefanis & Aste](https://arxiv.org/abs/2608.16801)).

A 2026 cluster of contract-first systems converges on one pattern: **ownership and interfaces fixed before agents write**, which is the role bounded contexts and shared-kernel integration events play in arm C.

**Contract-Coding** (preprint; full text) is the closest analogue to arm C. A two-layer "Language Contract" holds a PRD and specification in prose, plus a symbolic kernel of module paths, signatures and state. Workers see only the contract, never their peers' code. A deterministic auditor rejects silent signature changes and opens a synchronization task, which requires either a revert or a formal "Contract Amendment" ([Contract-Coding](https://arxiv.org/html/2604.13100)). Results on the authors' Greenfield-5 games, 10 runs each with GPT-4o:

- Overall success is **100/100/87/80/47%** across the five games, and the system loses the hardest one to Gemini Studio (47% vs 63%).
- Without the contract, Plane Battle drops from 100% to 65%.
- **The sequential ablation keeps roughly the same quality but is slower**: City Sim 480 s vs 257 s, Snake++ 465 s vs 198 s.
- Neither token nor dollar cost is reported.
- There is no Claude Code, Cursor or plain single-agent baseline.

([Contract-Coding](https://arxiv.org/html/2604.13100))

Three other preprints (all abstract only) follow the same pattern.

- **CodeTeam** has a CTO agent normalise one of several architect sketches into a "machine-checkable contract" covering file ownership, public interfaces and dependency constraints. It reaches 34.6% and 42.3% average test pass on NL2Repo-Bench ([CodeTeam](https://arxiv.org/abs/2606.22082)).
- **NP-Bench** declares disjoint scopes and orders merges from producer to consumer.
  - In simulation, clean integration rises from 1/9 to **9/9** scenarios and merge conflicts fall from 13 to 0.
  - On a live breaking contract change, clean integration goes from 0 to 1.0 with a frontier model and to 0.6 with a small one.
  - ([NP-Bench](https://arxiv.org/abs/2610.07261))
- **Claim Plane** quantifies the price of admitting writes only against declarations made up front. Pair pass rises from 23.3% to 50.0% (+26.7 points, 95% CI 9.6–60.0) and integration from 65.6% to 96.7%, but **96.7% of executions were serialized**, and the author reports no useful wall-clock speedup. Under dynamic admission, 46 of 90 executions failed closed. In 45 of those, the files were already in the frozen declarations, which points to declarations that under-cover the work and to weak amendment handling ([Claim Plane](https://arxiv.org/abs/2608.00947)).

Field data show the base rates. **Xu et al.** (preprint; full text) studied 33,596 agent pull requests ([Xu et al.](https://arxiv.org/html/2607.04697v2)):

- **79.4%** were open at the same time as another agent PR.
- Replayed three-way merges conflict textually **19.8%** of the time when both PRs come from the same agent and **41.7%** when they come from different agents.
- About 42% of the conflicts are structural (modify/delete, add/add) rather than overlapping lines.
- These are lower bounds, because build and semantic conflicts were not measured.

**AgenticFlict** (peer-reviewed, AIware 2026; abstract only) finds a **27.67%** textual conflict rate over more than 107K simulated merges of agent PRs ([AgenticFlict](https://arxiv.org/abs/2604.03551)).

**"Passes Alone, Fails Together"** (peer-reviewed, EXPRESS 2026 workshop; full text) separates semantic from textual failure: each patch passes alone and the merge fails ([Xia, Wu & Park](https://arxiv.org/html/2609.25396v1)). On 834 runs over real, reviewed Django PR pairs, only one showed such interference. On constructed interface changes it appeared in **105/108 runs**, and a message describing the finished concurrent change recovered 82% of them. The authors warn that the constructed rates are not estimates of how often this happens in practice.

Practitioner reports point to where conflicts land.

- **Bernstein 1.9 postmortem** (practitioner). Ten Claude Opus 4.7 agents worked in separate worktrees under scoped tickets. All three merge conflicts fell in `cli/main.py`, the file where command registrations converge. The authors' lesson is that "the bottleneck in multi-agent shipping moved" to whether the codebase can absorb parallel writers ([Bernstein](https://docs.bernstein.run/en/latest/blog/ten-agents-one-release/)).
- **Factory** (vendor; publication date uncertain) reports that "serial execution with targeted parallelization has worked better than broad parallelism" ([Factory Missions](https://factory.com/news/missions)).

Classic software-engineering work predicted these outcomes.

- **Conway's law** (*Datamation*, 1968): a design copies the communication structure of the organisation that builds it ([Conway](http://www.melconway.com/Home/Committees_Paper.html)). One agent per bounded context is the inverse Conway manoeuvre applied on purpose.
- **Parnas** (peer-reviewed, *CACM* 1972; bibliographic record only): decomposing by hidden design decisions lets separate groups build modules with little communication once the interfaces are fixed ([Parnas](https://dl.acm.org/doi/10.1145/361598.361623)).
- **Cataldo, Herbsleb and colleagues** (peer-reviewed, ESEM 2008 and TSE 2013; abstracts only): socio-technical congruence. When the coordination that dependencies require goes unmet, productivity falls and failures rise, and co-change dependencies matter more than call dependencies ([Making Software ch. 11](https://www.oreilly.com/library/view/making-software/9780596808310/ch11s02.html)).
- **Brun et al.** (peer-reviewed, ESEC/FSE 2011 Distinguished Paper, TSE 2013): across 9 systems and 3.4 MLOC, parallel-development conflicts are frequent and persistent, and many appear as later build and test failures rather than textual ones ([Brun et al.](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-tse2013-abstract.html)).

## Agents follow architecture as prose, but nobody has tested it as an enforced gate between agents

Conformance depends on the model, and conformance is not the same as correctness.

- **Slater** (preprint under review at JSS; abstract only). In a Hexagonal Architecture pilot, GPT-5.1 had **0%** forbidden-import violations and Llama 3 8B had **80%** ([Slater](https://arxiv.org/abs/2512.04273)).
- **Constraint Decay** (preprint; full text). Stacking Clean Architecture, database and ORM constraints on RealWorld backend tasks costs capable agents about **27 points** of assertion pass rate. Clean Architecture alone costs about **8.8**. The best fully constrained configuration reaches 78.6% assertion pass but only **8.3% pass@1**. Architecture-verifier violations account for only 1.0–1.4% of failed runs; data-layer defects cause about 48% of logic failures ([Dente et al.](https://arxiv.org/html/2605.06445)). So respecting the layering and staying correct while doing so are separate outcomes to measure separately.
- **Zhu, Tsantalis & Rigby** (preprint; full text). On 20 projects generated by MetaGPT, architectural smells track total lines of code at **Spearman ρ = 0.94**, which argues for checking on every change rather than at the end ([Zhu et al.](https://arxiv.org/html/2605.02741)).
- **Smell and quality studies.** LLM-generated Java carries 63.34% more smells than professional code ([Paul et al.](https://arxiv.org/abs/2510.03029); preprint, abstract only). Merged agent PRs introduce new code smells, and "merge success does not reliably reflect post-merge code quality" ([Cynthia et al.](https://arxiv.org/abs/2601.20109); preprint, abstract only).

Architecture given as input helps, mostly for weaker models.

- **Cervantes, Kazman & Cai** (peer-reviewed, ICSE 2026 Designing workshop; abstract only). Architectural documentation "substantially improves conformance", and an explicit implementation plan further improves correctness and modularity ([Cervantes et al.](https://conf.researchr.org/details/icse-2026/designing-2026-papers/2/Improving-LLM-assisted-code-generation-through-the-use-of-architectural-documents-and)).
- **Canedo** (preprint; abstract only). The format of the architecture spec barely matters for the strongest models. Code-proximate formats, such as TypeScript contracts with ArchUnit-style rules, recover most of the gap for weaker models; for the weakest model they raised route coverage from 33% to 100% ([Canedo](https://arxiv.org/abs/2608.21747)).
- **SWE-agent** (peer-reviewed, NeurIPS 2024). A linter built into the edit command reduced cascading failed edits. That is evidence that static feedback inside the loop helps, but for syntax, not architecture ([SWE-agent](https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf)).
- **Schmid et al.'s systematic review** (preprint) names conformance checking and generating code from architecture as explicitly **underexplored** ([Schmid et al.](https://arxiv.org/abs/2505.16697)).
- **Practitioners** recommend structural checks as agent hooks, noting that AGENTS.md prose "cannot verify cross-file imports or architectural boundaries" ([Factory.ai](https://factory.ai/news/using-linters-to-direct-agents); [Fowler](https://martinfowler.com/articles/harness-engineering.html)).

Studies of LLMs doing DDD stop at design artefacts. Three agree that models handle strategic artefacts well and tactical design poorly.

- **Event storming** (peer-reviewed, ICSA 2026; abstract only). A controlled experiment with 240 postgraduates in 60 teams found LLM-generated elements "generally reliable", but the models "often miss or omit many critical elements". Optimised prompts recover some of them, but not reliably for complex logic ([Cao et al.](https://conf.researchr.org/details/icsa-2026/icsa-2026-papers/33/Leveraging-Large-Language-Models-for-Event-Storming-in-Domain-Driven-Design-A-Contro)).
- **A five-step DDD pipeline** (preprint, single industrial case). Ubiquitous language, events and bounded contexts worked. Aggregates and the mapping to architecture failed as small errors compounded ([Eisenreich et al.](https://arxiv.org/abs/2603.26244)).
- **Monolith decomposition** (peer-reviewed, ICSA 2026; abstract only). LLM decompositions score better on business-context purity (+7.3%) but are much worse than established algorithms at recovering the reference decomposition (MoJoFM, −62%) ([Sambu et al.](https://conf.researchr.org/details/icsa-2026/icsa-2026-papers/27/LLMs-for-Architectural-Refactoring-An-Exploratory-study-on-Monoliths-to-Microservice)).

No study checks an LLM-produced context map or event storm against the code that agents later write. That supports a human-facilitated storm that is decided before the code and then held to it.

Repository instruction files are followed but do not reliably raise success. The relevant evidence bears on our C′ context pack.

- **Gloaguen et al.** (preprint; abstract only): context files "do not generally improve task success rates" and raise inference cost by over 20% ([Gloaguen et al.](https://arxiv.org/abs/2602.11988)).
- **Lulla et al.** (preprint; abstract only): AGENTS.md cuts median runtime by 28.64% and output tokens by 16.58%, with comparable completion ([Lulla et al.](https://arxiv.org/abs/2601.20404)).
- **Khatri** (preprint). Over 288 runs, context files had no correctness effect beyond about 10–15 points. Failures came from implementation skill ("feature design, pattern selection, exact wiring"), not from missing repository knowledge ([Khatri](https://arxiv.org/abs/2607.27250)).
- **McMillan** (preprint). Over 1,650 Claude Code sessions on two TypeScript codebases, the file's structure had no effect, with Bayes factors of 0.05–0.10 favouring no effect for size and conflict. The odds of compliance fell about **5.6% with each additional generated function** ([McMillan](https://arxiv.org/abs/2605.10039)).
- **Chatlatanagulchai et al.** (preprint; abstract only): 68.1% of 2,303 context files contain architecture content ([Chatlatanagulchai et al.](https://arxiv.org/abs/2511.12884)).

Prose is followed, its effect fades within a session, and it is not shown to enforce anything.

Our searches in October 2026 found **no published work that uses an enforced architecture as the coordination mechanism between coding agents**. ProjectGen (preprint; abstract only) uses a "Semantic Software Architecture Tree" as an internal planning artefact, not as an enforced rule set ([ProjectGen](https://arxiv.org/abs/2511.03404)). The closest neighbours treat a shared specification as the coordination artefact ([Chacón Sartori](https://arxiv.org/abs/2603.24284)), or treat code-proximate specifications as an input ([Canedo](https://arxiv.org/abs/2608.21747)). This negative result has limits: the searches ran through a web engine, and the ACM DL and IEEE Xplore could not be queried directly, so ICSA and ICSE 2026 workshop papers may have been missed.

## The methodology literature sets the bar our paper will be judged against

"Tests pass" overstates "solved".

- **SWE-Bench+** (preprint; abstract only): 32.67% of successful patches had the solution leaked in the issue and 31.08% passed only because the tests were weak. Filtering these out dropped SWE-Agent with GPT-4 from 12.47% to 3.97% ([SWE-Bench+](https://arxiv.org/abs/2410.06992)).
- **Wang, Pradel & Liu** (ACM venue by DOI; abstract only): differential testing finds that 29.6% of plausible patches behave differently from the ground truth, which inflates reported resolution rates by **6.2 points** ([Wang et al.](https://arxiv.org/abs/2503.15223)).
- **UTBoost** (peer-reviewed, ACL 2025; abstract only): stronger tests change 40.9% of Lite and 24.4% of Verified leaderboard entries ([UTBoost](https://arxiv.org/abs/2506.09289)).
- **Liang et al.** (preprint; abstract only): models name the buggy file from the issue text alone 76% of the time on SWE-bench Verified, a sign of memorisation ([Liang et al.](https://arxiv.org/abs/2506.12286)).

A fresh, private backlog avoids memorisation. It does not avoid weak tests.

Cost and variance have to be reported together.

- **Kapoor et al., "AI Agents That Matter"** (preprint; full text) shows that simple retry and warming baselines match complex agents: warming reaches 93.2% at $2.45, LATS 88.0% at $134.50. Many published scores sit **above the maximum of five reproduction runs**. The authors call for cost-controlled comparisons, raw token counts and error bars ([Kapoor et al.](https://arxiv.org/html/2407.01502)).
- **HAL** (preprint; full text, read in part) ran 21,730 rollouts for about $40,000 ([HAL](https://arxiv.org/html/2510.11977)). Its findings:
  - Higher reasoning effort gave equal or lower accuracy in 21 of 36 combinations.
  - The most expensive model sat on the cost-accuracy frontier in only 1 of 9 benchmarks.
  - Verification steps raised success by 13–87%.
  - Providers silently swapped model weights.
- **Miller** (preprint) recommends paired per-question differences, clustered standard errors (which can be about 3× the naive ones) and a power analysis before running ([Miller](https://arxiv.org/html/2411.00640v1)).

Software-engineering guidelines now name agent artefacts explicitly. **Baltes, Wagner et al.** (preprint under review at EMSE, v5 May 2026) set out eight guidelines ([Baltes et al.](https://arxiv.org/html/2508.15503v5); [checklist](https://llm-guidelines.org/checklist/)). They ask a study to:

- report the exact model, configuration and **execution date**;
- release context files, skills, subagents and hooks;
- release complete runtime traces;
- justify the number of repetitions;
- include an open-weight baseline and a naive lower-bound baseline;
- validate LLM judges against humans, with per-item rating distributions;
- discuss data leakage.

The checklist has no explicit item on cost or token reporting. **Ernst & Baldassarre** (peer-reviewed, EMSE 2023) describe registered reports, in which the protocol is reviewed before the study runs, as the established way to pre-register in software engineering ([Ernst & Baldassarre](https://arxiv.org/abs/2302.03649v1)).

Graders and timing need their own checks.

- **Graders.** LLM judges reached a Pearson correlation of 68.51 with humans on code generation and showed position bias (peer-reviewed, ISSTA 2025; abstract only) ([Wang et al.](https://arxiv.org/abs/2502.06193v2)). Agent-as-a-Judge (preprint) reached **86.61–92.07%** agreement with a three-expert consensus, while individual experts averaged 84.88–89.34% and pairwise disagreement between humans ran 10–30% ([Zhuge et al.](https://arxiv.org/html/2410.10934)).
- **Timing.** The METR randomised trial (preprint) found experienced developers 19% slower with early-2025 tools while believing they were 20% faster. It verified self-reported times against screen recordings and adjusted for task difficulty; the raw ratio was 34% against 19% adjusted ([METR](https://arxiv.org/html/2507.09089)). METR now marks those results out of date and points to a February 2026 follow-up, which was not read here ([METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)).

## Where our study stands

Our study builds a seven-feature backlog from an empty TypeScript Clean Architecture + DDD project under four arms, with a kit registered before any run and both mechanical and read grading:

- **A:** one agent with a gate and expected event storms.
- **B:** naive parallel, one agent per feature.
- **C:** fan-out by bounded context, after a contract stage (storm, per-context plans, frozen integration events, a red acceptance test), with a single writer doing the integration.
- **C′:** C plus a context pack.

In the pilot, A matched C and C′ in quality, was faster and cost about 30% less. B was fastest but lost 3 of 7 features to merge conflicts in one context.

### Results the literature agrees with

| Our pilot observation | Concordant literature |
|---|---|
| A matches C/C′ in quality, faster and about 30% cheaper | All MAS topologies ≤ single agent on SWE-bench Verified; centralized costs 285% token overhead ([Kim et al.](https://arxiv.org/html/2512.08296)). MAS gains on code shrink with stronger models at 4–220× the tokens ([Gao et al.](https://arxiv.org/html/2505.18286v1)). Single-agent frameworks beat multi-agent ones at a fixed backbone ([Yin et al.](https://arxiv.org/html/2511.00872)). A fixed pipeline beats agents at lower cost ([Agentless](https://arxiv.org/html/2407.01489)). |
| B fastest, but lost 3/7 features to merge conflicts concentrated in one context | Independent topology: worst SWE-bench result (−14.9%) and 17.2× error amplification ([Kim et al.](https://arxiv.org/html/2512.08296)). About 30% "curse of coordination" ([CooperBench](https://arxiv.org/abs/2601.13295)). 23.3% pair pass when unconstrained ([Claim Plane](https://arxiv.org/abs/2608.00947)). 41.7% cross-agent textual conflicts ([Xu et al.](https://arxiv.org/html/2607.04697v2)). Conflicts gather in a convergence file ([Bernstein](https://docs.bernstein.run/en/latest/blog/ten-agents-one-release/)). |
| C's contract stage prevents B's losses but does not pay for itself | Admission and ownership buy reliability by serializing, with no speedup ([Claim Plane](https://arxiv.org/abs/2608.00947)). Serial by default, targeted parallelism ([Factory](https://factory.com/news/missions)). The specification is the coordination mechanism ([Chacón Sartori](https://arxiv.org/abs/2603.24284)). |
| The gate (verification) carries most of the quality | Verification step +15.6 points on ChatDev ([MAST](https://arxiv.org/html/2503.13657)). Reproduction tests carry Agentless's gain ([Agentless](https://arxiv.org/html/2407.01489)). Verification raises success by 13–87% ([HAL](https://arxiv.org/html/2510.11977)). |
| A strong model respects the layering when told | 0% violations for GPT-5.1 ([Slater](https://arxiv.org/abs/2512.04273)). Verifier violations are about 1% of failures ([Constraint Decay](https://arxiv.org/html/2605.06445)). Spec format barely matters for strong models ([Canedo](https://arxiv.org/abs/2608.21747)). |

The literature also explains two secondary pilot observations. An agent in C stopped (BLOCKED) rather than amend a frozen contract. This is the fail-closed behaviour Claim Plane reports when declarations under-cover the work: 46 of 90 executions blocked, 45 of them on files already declared ([Claim Plane](https://arxiv.org/abs/2608.00947)). Contract-Coding avoids it with a formal amendment channel ([Contract-Coding](https://arxiv.org/html/2604.13100)). Separately, two expected storms contradicted each other when a later feature changed an earlier feature's command. That is a cross-feature co-change dependency, which socio-technical congruence identifies as the kind of dependency that matters most and is easiest to miss ([Cataldo et al.](https://www.oreilly.com/library/view/making-software/9780596808310/ch11s02.html)).

### Results that contradict ours or are in tension with them

The sharpest contradiction is about time. Contract-Coding's parallel execution was **faster** than its own sequential ablation at the same quality (City Sim 257 s vs 480 s) ([Contract-Coding](https://arxiv.org/html/2604.13100)). In our pilot the sequential arm A was faster than the contract-first fan-out. We see four candidate explanations, and the paper must separate them:

1. Our contract stage (storm, plans, frozen events, a red test) is a fixed cost that seven features do not pay back.
2. Single-writer integration re-serialises the work.
3. Parallel builds and tests compete for a shared four-CPU machine.
4. Seven features fall into few bounded contexts, so ownership by context leaves little real parallelism. Claim Plane names this serialization trap ([Claim Plane](https://arxiv.org/abs/2608.00947)).

Contract-first systems report wins in general — Contract-Coding, CodeTeam, NP-Bench, Claim Plane ([CodeTeam](https://arxiv.org/abs/2606.22082); [NP-Bench](https://arxiv.org/abs/2610.07261)). Those wins are measured against unconstrained parallelism, other multi-agent frameworks or commercial IDEs, never against a strong single agent with the same gate. Our result does not contradict their finding that contracts beat no contracts, which our B-versus-C comparison reproduces. It does contradict the implied conclusion that contract-first fan-out is the better way to build.

The literature also says multi-agent advantages exist. Kim et al. report +80.8% for centralized coordination on decomposable work ([Kim et al.](https://arxiv.org/html/2512.08296)), and Anthropic +90.2% on research ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). Jwalapuram et al. find that expert-architected systems win when a task offers explicit decomposition and context separation ([Jwalapuram et al.](https://arxiv.org/abs/2606.13003)). Bounded contexts are exactly such an expert decomposition. Our pilot backlog does not refute these results, because its features are sequentially dependent, and that is the regime where every source predicts the single agent wins. The six-context follow-up (team spaces) is the real test. If C still loses there, that is a counterexample worth publishing. If C wins, the result reproduces Kim's decomposable-task regime in code, which their SWE-bench data never showed.

Three smaller tensions remain.

- **Field base rates.** Arm B's loss rate (3/7, about 43%) is above the mined textual base rates of 19.8–27.67% per PR pair ([Xu et al.](https://arxiv.org/html/2607.04697v2); [AgenticFlict](https://arxiv.org/abs/2604.03551)). It is also far above the near-zero semantic interference on reviewed Django pairs ([Xia et al.](https://arxiv.org/html/2609.25396v1)). The units differ (features against PR pairs), and our writers were all concurrent in one context. The paper must say which kind of conflict B suffered — textual, build or semantic — before comparing.
- **The cost of architecture.** Constraint Decay finds that Clean Architecture costs about 8.8 points of correctness ([Dente et al.](https://arxiv.org/html/2605.06445)), while every one of our arms that integrated reached the same quality. This is not necessarily a contradiction: their tasks are greenfield from an OpenAPI spec with no canonical examples, and ours start from a project whose conventions, examples and checks already exist. But it means the paper cannot claim the architecture is free; that would need an arm without it.
- **Context files.** The evidence on context files is split between higher cost ([Gloaguen et al.](https://arxiv.org/abs/2602.11988)) and lower runtime ([Lulla et al.](https://arxiv.org/abs/2601.20404)). Our C′-versus-C comparison is a new data point. The literature predicts no effect on correctness for a strong model ([Khatri](https://arxiv.org/abs/2607.27250)), so any effect should appear in time and tokens.

### The gap our study fills

Five gaps are clear. Our study fills them subject to the search limits stated above.

1. **No equal-tooling comparison on a backlog.** No study compares one gated agent against naive and architecture-coordinated fan-outs on the same multi-feature backlog with the same tools while reporting quality, integration, time and cost. Kim et al.'s software evidence is 20-instance single-issue subsets ([Kim et al.](https://arxiv.org/html/2512.08296)). Multi-agent coding papers compare against single LLM calls ([MetaGPT](https://arxiv.org/html/2308.00352)). Project-level benchmarks have no fan-out arm ([ProjectEval](https://arxiv.org/html/2503.07010v2)).
2. **No enforced architecture as coordination.** No work uses a mechanically enforced architecture — generated import rules, a checked context map, inventories held equal — as the coordination mechanism between agents ([Chacón Sartori](https://arxiv.org/abs/2603.24284); [Canedo](https://arxiv.org/abs/2608.21747)).
3. **No conformance over a multi-feature evolution.** No work measures architecture conformance of agent-written code across a multi-feature evolution against a mechanical gate. This sits in an area the systematic review calls underexplored ([Schmid et al.](https://arxiv.org/abs/2505.16697)), and the volume–smell correlation makes it pressing ([Zhu et al.](https://arxiv.org/html/2605.02741)).
4. **No DDD artefact held to the code.** DDD-with-LLM studies stop at artefacts ([Cao et al.](https://conf.researchr.org/details/icsa-2026/icsa-2026-papers/33/Leveraging-Large-Language-Models-for-Event-Storming-in-Domain-Driven-Design-A-Contro); [Eisenreich et al.](https://arxiv.org/abs/2603.26244)). Our storms are decided before the code and held to it afterwards.
5. **Failure categories MAST lacks.** Our failures add categories MAST does not have: concurrent writes to one context, a frozen contract with no amendment channel, and contradictory expected storms across features ([MAST](https://arxiv.org/html/2503.13657)).

## What a publishable version must add

The list below is ordered by how likely a reviewer is to reject without it. Priority 1 items are what the methodology literature treats as required. Priority 2 items close specific threats to validity. Priority 3 items turn the study from a well-run comparison into a contribution to the scaling science.

| Priority | Addition | Why, and the source that demands it |
|---|---|---|
| 1 | Report every run as a distribution: all three values per arm, never best-of. Give a paired per-feature outcome table across arms. Treat the run, not the feature, as the unit, because features in one backlog are sequentially dependent. Frame the study as exploratory and powered only for large effects. | With 3 runs, Student's t at 2 degrees of freedom gives a 95% half-width of about 2.5 sample SDs. Paired comparisons and clustered errors are the standard ([Miller](https://arxiv.org/html/2411.00640v1)). Repetitions must be justified ([Baltes et al.](https://llm-guidelines.org/checklist/)). Published agent scores are often best-of-n ([Kapoor et al.](https://arxiv.org/html/2407.01502)). |
| 1 | Add a budget-matched single-agent baseline: A given C's token or dollar budget as retries or best-of-N against the gate, or an extra self-review pass. Plot every arm on a cost–quality Pareto chart. | This is the most predictable objection. Retry and warming baselines match complex agents ([Kapoor et al.](https://arxiv.org/html/2407.01502)). Kim et al. match token budgets ([Kim et al.](https://arxiv.org/html/2512.08296)). Single-agent-first cascades are the obvious hybrid ([Gao et al.](https://arxiv.org/html/2505.18286v1)). |
| 1 | Add a naive baseline: the requests as given, with no CLAUDE.md, skills, storms or gate. | It separates the effect of the kit from the effect of the arm ([Baltes et al.](https://llm-guidelines.org/checklist/)). Context files alone are known to have small or no effect on correctness ([Khatri](https://arxiv.org/abs/2607.27250); [Gloaguen et al.](https://arxiv.org/abs/2602.11988)). |
| 1 | Validate the read grader. Have a human grade a sample blind to the arm, with diffs scrubbed of tell-tale plan files and commit patterns. Report κ or α per rubric item rather than percent agreement. Use a grader from a different model family, grade each artefact more than once, and randomise presentation order. | Guidelines require human validation and per-item distributions ([Baltes et al.](https://llm-guidelines.org/checklist/)). LLM judges show position bias ([Wang et al.](https://arxiv.org/abs/2502.06193v2)). Human experts themselves disagree 10–30% of the time ([Zhuge et al.](https://arxiv.org/html/2410.10934)). |
| 1 | Prove the pre-registration. Cite the commit or tag that fixed requests, storms, acceptance tests, rubric, metrics, exclusion rules and the analysis plan. Add a deviations section that reports the pilot as a pilot, with every kit change it triggered. | Pre-registration counts only if it is timestamped and reviewable ([Ernst & Baldassarre](https://arxiv.org/abs/2302.03649v1)). |
| 1 | Release the agent configuration at the exact commit used for each run: CLAUDE.md, skills, subagents, hooks, the context pack and the driver. Also release the complete runtime traces and every human intervention. Record model IDs and run dates. | Required disclosures ([Baltes et al.](https://llm-guidelines.org/checklist/)). Providers change weights silently ([HAL](https://arxiv.org/html/2510.11977)). |
| 2 | Report raw input, output, cache-read and cache-write tokens per run, with the dated price table, and say whether runner-reported cost was reconciled against billing. | Cost must be recomputable as prices change ([Kapoor et al.](https://arxiv.org/html/2407.01502)). The checklist omits cost, so state it explicitly ([Baltes et al.](https://llm-guidelines.org/checklist/)). |
| 2 | Clean up the timing. Run arms serially on an otherwise idle machine, or report CPU-seconds alongside wall-clock. Separate API latency from local build and test time. Record start times. Log each human intervention per arm from timestamps in the transcripts, not from memory. State the kit's human effort as a fixed cost and limit claims to "agent lead time given the kit". | Infrastructure must be stated for latency-sensitive measures ([Baltes et al.](https://llm-guidelines.org/checklist/)). Self-perceived time is off by about 40 points ([METR](https://arxiv.org/html/2507.09089)). Shared-CPU contention is one of our four candidate explanations for C being slower. |
| 2 | Report a divergence rate: runs that pass the acceptance tests but fail the read grading or the storm check. Classify B's integration failures as textual, build or semantic. | Tests pass while the work is wrong in roughly 8–31% of SWE-bench "solved" patches ([SWE-Bench+](https://arxiv.org/abs/2410.06992); [Wang et al.](https://arxiv.org/abs/2503.15223)). Many conflicts surface as build or test failures ([Brun et al.](https://homes.cs.washington.edu/~mernst/pubs/vc-conflicts-tse2013-abstract.html)). Semantic failures need their own metric ([Xia et al.](https://arxiv.org/html/2609.25396v1)). |
| 2 | Code every failure against MAST, adding categories for concurrent writes, frozen-contract stops and contradictory storms. Audit the logs for shortcuts, such as agents editing tests, the gate or the conventions check, or reading grading material. | Systematic log analysis is part of evaluation ([HAL](https://arxiv.org/html/2510.11977)). Failure categories should be reported by frequency ([Baltes et al.](https://llm-guidelines.org/checklist/)). Agents went looking for hidden grading material in about 4/5 of sealed runs ([Destefanis & Aste](https://arxiv.org/abs/2608.16801)). |
| 2 | Discuss leakage. Say whether the repository and its history are public. Say that the other language trees in the repo let a feature be ported rather than designed. Say how prescriptive the storms are, since they name commands, events and aggregates. State each model's training cutoff. | Solution leakage and memorisation inflate results ([SWE-Bench+](https://arxiv.org/abs/2410.06992); [Liang et al.](https://arxiv.org/abs/2506.12286)). Leakage must be discussed ([Baltes et al.](https://llm-guidelines.org/checklist/)). |
| 3 | Pre-register a prediction for the six-context follow-up, derived from Kim et al.'s decomposable regime. Consider adding a cascade arm: A by default, escalating to a context fan-out only when a feature spans many contexts. | This turns the follow-up into a test of a published model rather than an anecdote ([Kim et al.](https://arxiv.org/html/2512.08296); [Gao et al.](https://arxiv.org/html/2505.18286v1); [Jwalapuram et al.](https://arxiv.org/abs/2606.13003)). |
| 3 | Add a second model family, ideally an open-weight one, or at least a weaker model. | Open-weight baselines are recommended ([Baltes et al.](https://llm-guidelines.org/checklist/)). Capability saturation predicts that coordination helps weaker models more ([Kim et al.](https://arxiv.org/html/2512.08296)), and weaker models are the ones that break layering and gain from code-proximate specs ([Slater](https://arxiv.org/abs/2512.04273); [Canedo](https://arxiv.org/abs/2608.21747)). |
| 3 | Measure conformance separately from correctness, and over time: gate refusals per arm, violations caught before integration, and smells or erosion feature by feature. | Conformance and correctness diverge ([Dente et al.](https://arxiv.org/html/2605.06445)). Smells grow with volume ([Zhu et al.](https://arxiv.org/html/2605.02741)). Instruction compliance decays within a session ([McMillan](https://arxiv.org/abs/2605.10039)). |
| 3 | Test a contract-amendment channel in C, so that a frozen-contract stop becomes a formal amendment. | Contract-Coding amends its contract; Claim Plane shows that strict admission fails closed when declarations under-cover the work ([Contract-Coding](https://arxiv.org/html/2604.13100); [Claim Plane](https://arxiv.org/abs/2608.00947)). |
| 3 | Verify the flagged numbers against the PDFs before quoting them: Kim et al. v3 SWE cells, Gao et al.'s 20% vs 88.1% cost figure, Yin et al.'s Table 10 totals, and MAST's venue. Re-read the abstract-only sources in full text. | Several figures in this review come from HTML extraction or abstracts ([Gao et al.](https://arxiv.org/abs/2505.18286v1); [Yin et al.](https://arxiv.org/html/2511.00872)). |

## Conclusion

Taken together, the literature recasts the question. "One agent or many" has a settled default answer for sequential coding work with a strong model: one, with a verifier. The open question is where the decomposition boundary lies and who pays for the contract that makes the boundary safe. Every contract-first system in the literature buys reliability, and those that report timing buy it largely by serializing. Our pilot adds that a strong single agent behind a gate gets the same reliability without paying for a contract at all. On this reading, enforced architecture earns its keep first as the verifier that makes one agent dependable. Its value as a partitioner for many agents depends on how wide a feature is, and the six-context feature is the first case where that value could exceed its cost.

Two consequences follow for the paper. First, its strongest claim is not that A beats C. It is that the gate and the expected storm carry the quality in every arm, and that coordination by bounded context adds cost without adding quality until features span several contexts. A budget-matched baseline and a no-kit baseline are what turn that claim from plausible into demonstrated. Second, the follow-up should be framed as a pre-registered test of the published scaling model in a domain where its software evidence rests on 20 instances. The result is publishable either way: a win for C locates the regime where architecture-aware fan-out pays, and a loss extends capability saturation to the case most favourable to multi-agent work.

## Appendix: source status

| Source | Status | Read |
|---|---|---|
| Kim et al., Scaling Agent Systems (2512.08296) | Preprint | Full text, v1–v3 |
| Cemri et al., MAST (2503.13657) | Peer-reviewed, NeurIPS 2025 D&B (venue from listing pages) | Full text |
| Gao et al., Single- or Multi-agent? (2505.18286) | Preprint | Most of the full text |
| Wang et al., Multi-Agent Discussions (2402.18272) | Peer-reviewed, ACL 2024 | Full text |
| Li et al., More Agents (2402.05120) | Peer-reviewed, TMLR | Full text |
| Tran & Kiela (2604.02460) | Preprint | Most of the full text |
| Jwalapuram et al., Illusion of MAS Advantage (2606.13003) | Preprint | Abstract only |
| Agentless (2407.01489) | Peer-reviewed, FSE 2025 | Full text, arXiv v2 |
| ChatDev; MetaGPT | Peer-reviewed, ACL 2024; ICLR 2024 oral | Full text |
| Self-collaboration; AgentCoder; MapCoder | Accepted to TOSEM; preprint; ACL 2024 | Abstract only |
| MAGIS | Peer-reviewed, NeurIPS 2024 | Via a summary |
| Yin et al., Agent frameworks (2511.00872) | Preprint | Full text |
| Saleh et al., README generation (2606.30524) | Peer-reviewed, ICSME 2026 NIER | Abstract only |
| Agha & Miqdad (Chalmers) | MSc thesis | Abstract only |
| ProjectEval; DevBench/DevEval | Preprints | Full text; abstract only |
| Anthropic; Cognition; Factory; Bernstein; Fowler; Factory.ai | Practitioner or vendor | Full page |
| Contract-Coding (2604.13100) | Preprint | Full text, end of appendix unread |
| CooperBench (2601.13295) | Preprint, listed on an ICLR 2026 page | Abstract only |
| NP-Bench; Claim Plane; CodeTeam | Preprints | Abstract only |
| Chacón Sartori, Specification Gap; Destefanis & Aste; ProjectGen | Preprints | Abstract only |
| AgenticFlict (2604.03551) | Peer-reviewed, AIware 2026 | Abstract only |
| Passes Alone, Fails Together (2609.25396) | Peer-reviewed, EXPRESS 2026 workshop | Full text |
| Xu et al., agent PR conflicts (2607.04697) | Preprint | Full text |
| Conway 1968; Parnas 1972 | Peer-reviewed or published | Full text; bibliographic record only |
| Cataldo & Herbsleb; Brun et al. | Peer-reviewed, ESEM/TSE; FSE/TSE | Abstracts only |
| Slater (2512.04273) | Preprint, under review at JSS | Abstract only |
| Constraint Decay (2605.06445); Zhu et al. (2605.02741) | Preprints | Full text |
| Paul et al.; Cynthia et al. | Preprints | Abstract only |
| Cervantes, Kazman & Cai | Peer-reviewed, ICSE 2026 Designing workshop | Abstract only |
| Canedo (2608.21747) | Preprint | Abstract only |
| Schmid et al., SLR (2505.16697) | Preprint | Abstract |
| SWE-agent | Peer-reviewed, NeurIPS 2024 | Full text |
| Cao et al., event storming; Sambu et al. | Peer-reviewed, ICSA 2026 | Abstract only |
| Eisenreich et al. (2603.26244) | Preprint | Abstract |
| Gloaguen; Lulla; Khatri; McMillan; Chatlatanagulchai | Preprints | Abstracts |
| SWE-Bench+; SWE-bench Illusion | Preprints | Abstract only |
| Wang, Pradel & Liu (2503.15223) | ACM venue by DOI | Abstract only |
| UTBoost | Peer-reviewed, ACL 2025 | Abstract only |
| Kapoor et al., AI Agents That Matter; HAL; Miller | Preprints | Full text (in part for HAL) |
| Baltes et al., LLM guidelines | Preprint, under review at EMSE | Most of the full text |
| Ernst & Baldassarre, Registered reports | Peer-reviewed, EMSE 2023 | Abstract |
| Wang et al., LLM-as-a-Judge in SE | Peer-reviewed, ISSTA 2025 | Abstract only |
| Zhuge et al., Agent-as-a-Judge; METR RCT | Preprints | Full text (in part) |
