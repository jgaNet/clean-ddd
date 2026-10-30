# Architecture conformance, DDD and "architecture as context" in LLM-generated code

Scope note: compiled 2026-10-30. Most items below are arXiv preprints (2025–2026) with no peer-reviewed venue listed on the arXiv page. Where only the abstract or a conference programme page was read, this is stated. "Abstract only" means the numbers come from the abstract or listing page, not from the full text.

## 1. Empirical studies of architectural violations and design quality in LLM- and agent-generated code

### Takeaway
A small but growing body of empirical work (almost all 2025–2026 preprints) finds that LLM and agent code respects a prescribed layering inconsistently. Conformance depends strongly on the model: in one pilot, GPT-5.1 had 0% violations against 80% for Llama 3 8B. Prescribing Clean Architecture costs functional correctness, about 8.8 points of assertion pass rate in one benchmark. Architectural smells grow with generated code volume (ρ = 0.94). Smell-level studies agree that LLM code carries more smells than human code. No study was found that measures conformance of agent-written code over a long multi-feature evolution against a mechanically enforced dependency table.

### Cited findings
**Direct architecture conformance (layering, dependency direction)**
- Slater, "Quantitative Analysis of Technical Debt and Pattern Violation in Large Language Model Architectures" (arXiv 2512.04273, Dec 2025, single author). The arXiv page says it is under review at the Journal of Systems and Software special issue on Impactful Software Architecture.
  - Design: a pilot study in which three models (GPT-5.1, Claude 4.5 Sonnet, Llama 3 8B) each implemented a Book Lending microservice under strict Hexagonal Architecture. Conformance was checked by AST parsing for forbidden imports, giving an "Architectural Violation Rate".
  - Results: GPT-5.1 had a 0% violation rate. Llama 3 8B had 80%, "often bypassing interface adapters and creating circular dependencies between Domain and Infrastructure layers". The abstract reports that open-weights models produced 60% fewer logical lines of code ("Implementation Laziness").
  - Conclusion: the author argues automated architectural linting is needed.
  - Abstract only: Claude's rate is not given in the abstract. One task, three models. — [arXiv 2512.04273](https://arxiv.org/abs/2512.04273)
- Dente, Satriani, Papotti, "Constraint Decay: The Fragility of LLM Agents in Backend Code Generation" (arXiv 2605.06445, v2 18 Sep 2026; EURECOM / Univ. Basilicata; no venue listed). Full HTML read.
  - Tasks: 80 greenfield and 20 feature tasks on the RealWorld/Conduit OpenAPI spec (19 endpoints), in 8 frameworks across Python and Node.
  - Constraints: Clean Architecture, database engine and ORM, stacked from L0 to L3.
  - Agents and evaluation: Mini-SWE-Agent and OpenHands with models from Devstral-Small to GPT-5.4. Scored on 291 assertions plus static verifiers for architecture, database and ORM. The architecture verifier checks layer dependency order by scanning imports.
  - Decay: capable configurations lose about 27 points of assertion pass rate from L0 to L3 (27.28 on average in the abstract). The range is 17 to 45 points.
  - Marginal cost of each constraint: Clean Architecture about −8.8 points, PostgreSQL −20.4, SQLite −16.1, SQLAlchemy −4.8.
  - Best result: the best L3 configuration reaches 78.6% assertion pass but only 8.3% pass@1.
  - Failure causes: data-layer defects cause about 48% of logic failures on average (36.5–60.9%). Verifier (constraint) violations are only 1.0–1.4% of failed runs. — [arXiv 2605.06445](https://arxiv.org/html/2605.06445)
- Zhu, Tsantalis, Rigby (Concordia), "AI-Generated Smells: An Analysis of Code and Architecture in LLM- and Agent-Driven Development" (arXiv 2605.02741, May 2026; venue not stated). Full HTML read.
  - Design: MetaGPT with Qwen-Coder 480B generated 20 projects (5 scenarios × 4 incremental prompts). Smells were detected with PyExamine.
  - Volume effect: total LOC correlates with architectural smells at Spearman ρ = 0.94 (p < 0.001), and number of files at ρ = 0.72. The authors call this a "Volume-Quality Inverse Law".
  - Most prevalent smells: include Scattered Functionality and Unstable Dependency.
  - Single-LLM algorithmic tasks: Qwen-480B produced 11–13 Long Method instances against 1 for the human baseline. — [arXiv 2605.02741](https://arxiv.org/html/2605.02741)
- Cervantes, Kazman, Cai, "Improving LLM-assisted code generation through the use of architectural documents and implementation plans" (ICSE 2026 Designing workshop, 13 Apr 2026, Rio; DOI 10.1145/3786152.3788588).
  - Design: a ReAct-style agent and three experiments, with modularity measured by DV8.
  - Results: "architectural documentation substantially improves conformance". An explicit implementation plan further improves functional correctness and modularity.
  - Abstract only: no numbers in the abstract, and the ACM page returned 403. — [ICSE 2026 Designing programme](https://conf.researchr.org/details/icse-2026/designing-2026-papers/2/Improving-LLM-assisted-code-generation-through-the-use-of-architectural-documents-and); [DOI](https://doi.org/10.1145/3786152.3788588)
- Canedo, "Architecture as Capability Equalizer for Coding Agents" (arXiv 2608.21747, 22 Aug 2026; single author; no venue).
  - Design: five informationally equivalent architecture-spec formats: prose, Mermaid with constraints and ADRs, OpenAPI, C4/Structurizr, and TypeScript contracts with ArchUnit-style rules. Six models from Anthropic, OpenAI and Google, 90 multi-turn agent trials.
  - Strongest models (Sonnet 4.6, GPT-5): format barely matters, with quality spread 0.17–0.92.
  - Weaker models: spread 0.83–2.42 points. Code-proximate formats (OpenAPI, TS contracts) "recover most of the capability gap". For the weakest model, TS contracts tripled API route coverage (33%→100%).
  - Self-validation: rates ranged from 100% (Sonnet) to 0% (Gemini Flash).
  - Abstract only. — [arXiv 2608.21747](https://arxiv.org/abs/2608.21747)

**Code- and design-smell studies (classic quality, not layering)**
- Paul, Zhu, Bayley, "Investigating The Smells of LLM Generated Code" (arXiv 2510.03029, v2 27 Sep 2026; no venue).
  - Design: Java code generated by Gemini Pro, ChatGPT, Codex and Falcon, compared with professional reference solutions.
  - Overall: smell incidence was on average +63.34% higher. Implementation smells were +73.35% and design smells +21.42%.
  - By model: Falcon +42.28%, Gemini +62.07%, ChatGPT +65.05%, Codex +84.97%.
  - The gap was worse for complex tasks and OO topics. Abstract only. — [arXiv 2510.03029](https://arxiv.org/abs/2510.03029)
- ENIAC (SBC, Brazil) study using Designite on 64 code units from ChatGPT, DeepSeek, CodeWhisperer and Copilot: 60.9% of units contained at least one smell related to cohesion, coupling or organization.
  - Seen only via a search-engine summary, not fetched, so treat it as unverified. — [SBC ENIAC](https://sol.sbc.org.br/index.php/eniac/article/view/38735)

**Mining studies of agent-authored PRs**
- Cynthia, Muttakin, Roy, "Beyond Bug Fixes: post-merge code quality issues in agent-generated PRs" (arXiv 2601.20109, Jan 2026; related ACM DOI 10.1145/3793302.3793615, likely MSR 2026).
  - Data: 1,210 merged agent bug-fix PRs from the AIDev dataset (Python, 5 agents), analysed differentially with SonarQube.
  - Results: code smells are the most frequent new-issue category, especially critical and major. Differences between agents mostly vanish after normalising by churn. "Merge success does not reliably reflect post-merge code quality."
  - Abstract only. — [arXiv 2601.20109](https://arxiv.org/abs/2601.20109)
- Other 2026 AIDev-based studies on agent code redundancy, churn and maintenance appeared in searches (arXiv 2607.21832, 2605.06464, 2601.17581). They were not fetched and are listed for follow-up only. — [arXiv 2607.21832](https://arxiv.org/html/2607.21832v1); [arXiv 2605.06464](https://arxiv.org/html/2605.06464v1)

### Inferences
- The two direct conformance studies point the same way: frontier models mostly respect a stated layering, while weaker models violate it often. However, they disagree on where the cost is.
  - Slater measures violations.
  - Constraint Decay finds that verifier violations are rare (about 1% of failures), yet imposing the architecture still costs correctness (about −8.8 points for Clean Architecture alone).
  - So "respecting the layering" and "staying correct while doing so" are separate outcomes that a paper should measure separately.
- The "Volume-Quality Inverse Law" (architectural smells track LOC, ρ = 0.94) suggests erosion accumulates as agents add features. This motivates checking the dependency table on every change rather than at the end.
- Canedo's result, that code-proximate formats such as ArchUnit-style rules help weaker models most, is the closest published evidence to "a dependency table that generates lint rules". It is still a spec format given as input, not an enforcement gate in the loop.

### Gaps
- No study found that measures architectural drift of agent-written code over a multi-feature evolution of a DDD/Clean Architecture codebase with a mechanical gate (lint rules generated from a dependency table, a context-map check, an event-storm/inventory check).
- Full-text numbers for Cervantes/Kazman/Cai (Designing 2026) and Claude's violation rate in Slater were not available.
- The GitClear-style industry reports on Copilot duplication and churn were not verified in this pass.

## 2. LLMs and software architecture in general: reviews, decision generation, conformance checking

### Takeaway
Reviews from 2025 agree that LLM use in architecture is growing but immature. Conformance checking and code generation from architecture are explicitly named as underexplored. ADR generation is feasible but below human level, and context selection matters more than model scale.

### Cited findings
- Schmid, Hey, Armbruster, Corallo, Fuchß, Keim, Liu, Koziolek (KIT), "Software Architecture Meets LLMs: A Systematic Literature Review" (arXiv 2505.16697, 22 May 2025).
  - Covers 18 articles and five RQs.
  - Finds that LLMs "often outperform baselines". Underexplored areas include generating source code from architectural designs, cloud-native architecture, and checking architectural conformance.
  - Most approaches use simple prompting. — [arXiv 2505.16697](https://arxiv.org/abs/2505.16697)
- Esposito, Li, Moreschini, Ahmad, Cerny, Vaidhyanathan, Lenarduzzi, Taibi, "Generative AI for Software Architecture. Applications, Challenges, and Future Directions" (Journal of Systems and Software 231, 112607; arXiv 2503.13310, Mar/Jun 2025).
  - A multivocal review (peer-reviewed plus grey literature).
  - Findings: GenAI is mostly used for decision support and architectural reconstruction, at early lifecycle stages, with monoliths and microservices as the main targets.
  - Challenges: precision, hallucination, lack of architecture datasets, and the absence of sound evaluation frameworks.
  - Based on a search summary of the abstract; the full text was not read. — [arXiv 2503.13310](https://arxiv.org/pdf/2503.13310)
- Dhar, Vaidhyanathan, Varma, "Can LLMs Generate Architectural Design Decisions? An Exploratory Empirical Study" (arXiv 2403.01709, Mar 2024).
  - Design: GPT and T5 models, zero-shot, few-shot and fine-tuned, on 95 ADRs.
  - Result: they can generate decisions but not at human level.
  - Search-summary level; not fetched. — [arXiv 2403.01709](https://arxiv.org/pdf/2403.01709)
- Follow-up ADR generation paper (arXiv 2604.03826, 2026): over 4,500 sequential ADRs from 750 repositories. Context selection dominates model scale, and a window of the last 3–5 ADRs performs about as well as the full history.
  - Search-summary level; not fetched, so verify before citing. — [arXiv 2604.03826](https://arxiv.org/html/2604.03826)
- On conformance checking with LLMs: no peer-reviewed work was found in which LLMs generate and maintain ArchUnit-style rules in a closed loop.
  - Practitioner sources do recommend ArchUnit/structural checks as agent hooks. These are opinion, not evidence: Fowler, "Harness engineering", and Factory.ai, "Using Linters to Direct Agents". The Factory.ai post notes that AGENTS.md prose "cannot verify cross-file imports or architectural boundaries". — [martinfowler.com](https://martinfowler.com/articles/harness-engineering.html); [factory.ai](https://factory.ai/news/using-linters-to-direct-agents)
- SWE-agent (Yang et al., NeurIPS 2024) built a linter into the agent's edit command. Linting reduced cascading failed edits.
  - This is evidence that in-loop static feedback helps agents, but for syntax, not architecture. — [SWE-agent, NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf)

### Inferences
- The SLR's explicit "underexplored: conformance checking; code from architecture" is a citable framing of the gap that mechanically enforced architecture for agents addresses.

### Gaps
- SAKE (arXiv 2606.29520, an architectural-knowledge benchmark for LLMs) appeared in searches and was not read.
- The ICSA 2026 "LLMs for Architectural Design" session likely has more relevant papers that were not enumerated.

## 3. LLM-assisted DDD, event storming and microservice decomposition

### Takeaway
There are now direct studies. Results are consistent: LLMs produce useful early DDD artifacts (ubiquitous language, events, candidate bounded contexts) but omit critical elements, and errors compound in later steps (aggregates, mapping to code). LLM decompositions are domain-coherent but do not reproduce reference decompositions. Every study positions the LLM as a sparring partner, not an autonomous designer.

### Cited findings
- Cao, Zhang, Li, Zhong (Nanjing Univ.), D. Li, Fan, Y. Zhang, Zdun (Univ. Vienna), "Leveraging Large Language Models for Event Storming in Domain-Driven Design: A Controlled Experiment" (ICSA 2026 Research track, short paper, 24 June 2026).
  - Design: a controlled experiment with 240 postgraduate participants in 60 teams and three arms (manual; LLM with basic prompts; LLM with optimized prompts). Outputs were scored on accuracy, completeness and consistency.
  - Results: LLM-generated elements are "generally reliable" but LLMs "often miss or omit many critical elements". Optimized prompts recover some of them. For complex business logic, a single optimized prompt does not consistently give good models.
  - Abstract only: no numeric results on the programme page. — [ICSA 2026 programme](https://conf.researchr.org/details/icsa-2026/icsa-2026-papers/33/Leveraging-Large-Language-Models-for-Event-Storming-in-Domain-Driven-Design-A-Contro)
- Eisenreich, Jusic, Wagner (Univ. Stuttgart), "Automating Domain-Driven Design: Experience with a Prompting Framework" (arXiv 2603.26244, 27 Mar 2026; IEEE template, venue unclear).
  - Design: a five-step pipeline (ubiquitous language → simulated event storming → bounded contexts → aggregates → mapping to technical architecture), run as a case study on real FTAPI enterprise requirements.
  - Results: steps 1–3 "worked well". Steps 4–5 were impractical because small errors compounded.
  - Conclusion: useful as a collaborative aid for glossaries and context maps, not as full automation. Qualitative, single case. — [arXiv 2603.26244](https://arxiv.org/abs/2603.26244)
- Sambu, Capuano, O'Dea, Vaidhyanathan, Muccini (L'Aquila / Groningen / IIIT Hyderabad), "LLMs for Architectural Refactoring: An Exploratory Study on Monoliths to Microservices" (ICSA 2026 Research track).
  - Design: 7 summarisation strategies × 4 LLMs on 4 open-source systems that have both monolith and microservice versions, evaluated with 6 metrics.
  - LLM advantages: decompositions beat traditional techniques on Cycle Independence (+15%), Data Transaction Purity (+8.5%) and Business Context Purity (+7.3%).
  - Established algorithms' advantages: much better at recovering the ground truth (MoJoFM +62%) and a modest modularity edge.
  - Abstract only. — [ICSA 2026 programme](https://conf.researchr.org/details/icsa-2026/icsa-2026-papers/27/LLMs-for-Architectural-Refactoring-An-Exploratory-study-on-Monoliths-to-Microservice)
- Other LLM-assisted decomposition work, seen only in search results:
  - Pattern-driven LLM-assisted decomposition of ML monoliths (ÉTS). — [ÉTS](https://pure.etsmtl.ca/en/publications/a-pattern-driven-andllm-assisted-approach-fordecomposing-monolith/)
  - MonoEmbed, contrastive fine-tuned embeddings for partitioning. — [arXiv 2502.04604](https://arxiv.org/abs/2502.04604v1)
  - A CLEI paper on an LLM semantic layer over alternative decompositions. — [CLEI](https://ejbeta.clei.org/cleiej/article/view/807)
- Background, not LLM-specific: a large-scale empirical characterisation of DDD in open source (arXiv 2607.06471) appeared in search and was not read. — [arXiv 2607.06471](https://arxiv.org/pdf/2607.06471)

### Inferences
- Two independent sources describe the same shape: good at early strategic artifacts, weak at tactical design and integration, and prone to omission. This is the argument for a human-facilitated storm whose output is then held to the code mechanically, rather than letting the LLM both decide and implement the model.
- No found work checks LLM-produced DDD artifacts (context map, event storm) against the code that agents later write. The DDD work stops at design artifacts.

### Gaps
- Numeric results of the ICSA 2026 event-storming experiment and the full text of the monolith study were not available.
- No study was found of LLMs maintaining a context map or detecting undeclared cross-context dependencies.

## 4. Repository instruction files (AGENTS.md, CLAUDE.md, .cursorrules) and "architecture as context"

### Takeaway
The evidence is mixed and mostly null on correctness. Context files do not reliably raise task success: in one study they cost more than 20% extra inference, while another found them associated with 28.64% lower median runtime and 16.58% fewer output tokens. Agents do follow the instructions, but adherence decays within a session, and the file's structure does not matter. Architecture content is common in such files (68.1%). Architecture documents help conformance (Cervantes et al.) and help weaker models (Canedo). Prose context alone is not shown to enforce anything.

### Cited findings
- Gloaguen, Mündler-Sasahara, Müller, Raychev, Vechev (ETH/LogicStar), "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" (arXiv 2602.11988; v1 12 Feb, v3 29 Sep 2026).
  - Design: SWE-bench tasks with LLM-generated files, plus a new set of issues from repos with developer-committed files.
  - Results: context files "do not generally improve task success rates" and increase inference cost by over 20%. Agents follow the instructions well. Repository overviews do not help.
  - Recommendation: files are useful for specifying non-standard practices.
  - Abstract v3 only. A search snippet attributed to an earlier version said LLM-generated files had a small negative effect; this is not verified against the current abstract. — [arXiv 2602.11988](https://arxiv.org/abs/2602.11988)
- Lulla, Mohsenimofidi, Galster, Zhang, Baltes, Treude, "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents" (arXiv 2601.20404; v2 30 Mar 2026; 5 pages).
  - Design: 10 repos, 124 PRs, Codex/Claude Code with and without AGENTS.md.
  - Results: −28.64% median wall-clock runtime and −16.58% output tokens, with "comparable" task completion. Abstract only. — [arXiv 2601.20404](https://arxiv.org/abs/2601.20404)
- Khatri, "Do Context Files Help Coding Agents? A Two-Agent Ablation Study on Real Repositories" (arXiv 2607.27250, 28 Jul 2026).
  - Design: Claude Code and Codex, 17 tasks from 3 Python repos, 288 runs. Three conditions: no context, full AGENTS.md, on-demand topic files.
  - Results: no measurable correctness effect, bounded by equivalence testing to about 10–15 pp. Failures came from implementation skill (feature design, pattern selection, exact wiring), not from missing repo knowledge. The real AGENTS.md never turned a near-miss into a pass.
  - Task difficulty is agent-specific (Spearman ρ = 0.75), which the author proposes as the explanation for contradictory prior results. — [arXiv 2607.27250](https://arxiv.org/abs/2607.27250)
- McMillan, "Instruction Adherence in Coding Agent Configuration Files: A Factorial Study of Four File-Structure Variables" (arXiv 2605.10039, 11 May 2026).
  - Design: 1,650 Claude Code sessions with 16,050 function-level observations, on two TypeScript codebases, with Sonnet 4.6, Opus 4.6 and Opus 4.7.
  - File structure: file size, instruction position, file architecture and inter-file conflict have no detectable effect. For size and conflict, Bayes factors give BF10 0.05–0.10, i.e. evidence for no effect.
  - Within-session decay: each additional generated function had about 5.6% lower odds of compliance (OR = 0.944). The relationship is non-monotonic and was found post hoc, but replicated. — [arXiv 2605.10039](https://arxiv.org/abs/2605.10039)
- Chatlatanagulchai et al. (incl. Adams, Hassan), "Agent READMEs: An Empirical Study of Context Files for Agentic Coding" (arXiv 2511.12884; v2 Aug 2026).
  - Data: 2,303 context files from 1,925 repos.
  - Character of the files: hard to read, evolving like configuration code through frequent small additions.
  - Content: testing 75.9%, implementation details 70.8%, architecture 68.1%, security 14.8%, performance 14.5%. — [arXiv 2511.12884](https://arxiv.org/abs/2511.12884)
- Architecture documents as input: Cervantes/Kazman/Cai found that architectural documentation substantially improves conformance (abstract only). Canedo found code-proximate architecture specs equalise weaker models. See section 1. — [ICSE Designing 2026](https://conf.researchr.org/details/icse-2026/designing-2026-papers/2/Improving-LLM-assisted-code-generation-through-the-use-of-architectural-documents-and); [arXiv 2608.21747](https://arxiv.org/abs/2608.21747)

### Inferences
- The literature supports a specific claim: prose context is followed but not sufficient, and its adherence decays with session length. That motivates moving architecture from a guide into executable checks, with the guide kept for what cannot be checked.
- Khatri's failure analysis ("pattern selection, exact wiring") is exactly what a feature-shape checklist and canonical examples target. This is a testable hypothesis for the paper.
- Note that these studies test SWE-bench-like bug fixes and small features in ordinary repos. None tests a repo whose architecture is itself the subject and is machine-checked, so their null results do not directly transfer.

### Gaps
- No controlled study was found of ADRs specifically, as distinct from architecture overviews, as agent context.
- No study was found of .cursorrules effects beyond McMillan's structural factorial.

## 5. Is enforced architecture used as the coordination mechanism between multiple agents?

### Takeaway
No published work was found that uses a mechanically enforced architecture as the coordination mechanism between multiple coding agents. Examples of such enforcement would be a dependency table compiled to lint rules, a checked context map, or an inventory or event storm held equal across agents' output. The closest work treats a shared specification or contract as the coordination artifact, or has a single architecture-design agent inside one pipeline. Measured multi-agent coordination is poor: −30% success on CooperBench, and a 25–39 pp gap that richer specs close.

### Cited findings
- Chacón Sartori, "The Specification Gap: Coordination Failure Under Partial Knowledge in Code Agents" (arXiv 2603.24284, 25 Mar 2026).
  - Design: 51 class-generation tasks, with spec detail stripped from L0 to L3.
  - Two-agent vs single-agent: two-agent integration falls from 58% to 25%, while a single agent falls from 89% to 56%. That is a 25–39 pp coordination gap, consistent across Sonnet and Haiku and three runs.
  - Conflict detection vs spec: an AST conflict detector reaches 97% precision, but conflict reports give no benefit. Restoring the full spec recovers the 89% ceiling.
  - Decomposition of the gap: coordination cost +16 pp, information asymmetry +11 pp.
  - Conclusion: "specification-first" multi-agent generation, where the spec is the coordination mechanism. — [arXiv 2603.24284](https://arxiv.org/abs/2603.24284)
- Khatua, Zhu, …, Diyi Yang (Stanford/SAP), "CooperBench: Why Coding Agents Cannot be Your Teammates Yet" (arXiv 2601.13295, v2 26 Jan 2026; an ICLR 2026 page lists it as "CooperBench: Benchmarking Cooperation in Coding Agents").
  - Design: more than 600 two-agent tasks across 12 libraries and 4 languages.
  - Result: success averages 30% lower working together than one agent doing both features (the "curse of coordination").
  - Failure modes: vague or inaccurate communication, broken commitments, wrong expectations about others' plans.
  - Abstract-level numbers. A search summary also gave "25% two-agent success for GPT-5/Sonnet 4.5" from v1; not verified. — [arXiv 2601.13295](https://arxiv.org/abs/2601.13295); [ICLR 2026](https://iclr.cc/virtual/2026/10018462)
- Destefanis, Aste, "When Agents Coordinate: Measuring Coordination in Multi-Agent AI Coding" (arXiv 2608.16801, 17 Aug 2026).
  - Design: 1,902 runs analysed as temporal networks.
  - Results:
    - Direct messaging grows near-quadratically with team size.
    - Shared-spec tasks give dense teams, while pipeline tasks give sparse networks around local interfaces.
    - Shared files cut output tokens by about 42% at eight agents on message-heavy work.
    - A designated coordinator gives no reliable gain.
    - Agents sought hidden grading material in about four fifths of 244 sealed runs. — [arXiv 2608.16801](https://arxiv.org/abs/2608.16801)
- Zhao et al., "Towards Realistic Project-Level Code Generation via Multi-Agent Collaboration and Semantic Architecture Modeling" (ProjectGen, arXiv 2511.03404, Nov 2025).
  - Design: a pipeline of architecture-design, skeleton and code-filling agents built around a "Semantic Software Architecture Tree".
  - Results: 52/124 DevBench tests (+57% over baselines) and 310 tests on CodeProjectEval (about 10× baselines).
  - Here the architecture is an internal planning artifact, not an enforced rule set. Abstract only. — [arXiv 2511.03404](https://arxiv.org/abs/2511.03404)
- Related systems, not fetched in detail: SEMAP, a protocol-driven multi-agent SE approach naming "under-specified role boundaries and weak interface definitions" as failure causes; CodeCRDT (5–10% semantic conflicts reported); Claim Plane (pre-write admission). — [arXiv 2510.12120](https://arxiv.org/pdf/2510.12120); [arXiv 2510.18893](https://arxiv.org/pdf/2510.18893); [arXiv 2608.00947](https://arxiv.org/pdf/2608.00947)
- Non-academic tools that combine enforcement with agents: agent-arch (PyPI) installs a pre-commit hook blocking layering violations and appends the rules to AGENTS.md. Single-agent, vendor claims, not evaluated. — [PyPI agent-arch](https://pypi.org/project/agent-arch/)
- Explicit negative result. Queries tried (WebSearch, Oct 2026), none returning work that uses enforced architecture (lint rules from a dependency table, a checked context map, held-equal inventories) as the inter-agent coordination mechanism:
  - "multi-agent LLM software development architecture as coordination module boundaries contract agents"
  - "parallel coding agents shared architecture specification interfaces coordination conflicts empirical"
  - "architecture-aware multi-agent code generation clean architecture layers agents enforced dependency constraints"
  - "linter feedback dependency rules guide LLM agents module boundaries enforced static analysis agentic coding study"
  - "LLM architecture conformance checking ArchUnit rules generation agents erosion"

### Inferences
- The specification-gap result (a full spec recovers the single-agent ceiling; conflict detection does not) and CooperBench's failure modes (broken commitments, wrong expectations of others) together make the case for a shared, checkable contract. A contract that agents cannot break, because a gate refuses the change, addresses "broken commitments" directly. Prose specs and messaging do not.
- Canedo (code-proximate specs help) and Chacón Sartori (spec as coordination) are the closest neighbours. The proposed contribution of an enforced architecture as coordination appears novel as of Oct 2026, subject to the search limits above.

### Gaps
- Searches were web-engine based. The ACM DL and IEEE Xplore could not be queried directly (ACM returned 403), so workshop papers (e.g., ICSA 2026 or ICSE 2026 workshops on agents) may have been missed.
- No evidence was found either way on whether enforced architecture reduces multi-agent merge conflicts.
