# When multi-agent LLM systems beat single agents, and why they fail

Scope note: these notes cover the general science (scaling laws for agent topologies, failure taxonomies, single-vs-multi comparisons on equal budgets). Full texts were read for 2512.08296 (v1, v2, v3 HTML), 2503.13657 (v3 HTML), 2505.18286 (v1 HTML, first ~100k chars), 2604.02460 (v2 HTML, first ~100k chars), 2402.18272 (v1 HTML), 2402.05120 (HTML). Only the abstract page was read for 2606.13003 ("The Illusion of Multi-Agent Advantage"). Retrieval was through an extraction tool over the HTML. Exact numbers below are as extracted; spot-check them against the PDF before you quote them in the paper.

Our study, for reference: a 7-feature backlog built from an empty TypeScript Clean Architecture + DDD project. Arm A is one agent with a gate and expected storms. Arm B is naive parallel, one agent per feature. Arm C is architecture-aware fan-out by bounded context, with a contract stage and single-writer integration. Arm C′ is C plus a context pack. In the pilot, A dominated C/C′ (same quality, faster, about 30% cheaper). B was fastest but failed 3/7 features on merge conflicts in one context. The follow-up tests one feature that spans six contexts.

---

## Q1. "Towards a Science of Scaling Agent Systems" (Kim et al., arXiv 2512.08296)

### Takeaway
On 260 controlled configurations in v3 (180 in v1/v2), multi-agent systems have no average advantage (mean MAS effect −0.3%). The result depends on the task. Centralized MAS gain +80.8% on parallelizable financial analysis and every MAS topology loses 39–70% on sequential PlanCraft. Coordination returns turn negative once the single agent already scores above about 45% (capability saturation). Independent (no-verification) topologies amplify errors 17.2×, against 4.4× for centralized. On SWE-bench Verified every MAS topology was at or below the single agent. This is the closest prior work to our A-vs-C result. It predicts that our sequential, tool-heavy backlog with a strong model favours A, and that the six-context feature is the case where a centralized fan-out could pay.

### Cited Findings
**Bibliographic**
- Title "Towards a Science of Scaling Agent Systems". 20 authors: Yubin Kim, Ken Gu, Chanwoo Park, Chunjong Park, Samuel Schmidgall, A. Ali Heydari, Yao Yan, Zhihan Zhang, Yuchen Zhuang, Yun Liu, Mark Malhotra, Paul Pu Liang, Hae Won Park, Yuzhe Yang, Xuhai Xu, Yilun Du, Shwetak Patel, Tim Althoff, Daniel McDuff, Xin Liu. arXiv cs.AI preprint. No venue or journal reference is listed. — [arXiv abs](https://arxiv.org/abs/2512.08296)
- Affiliations (from v1): Google Research (most authors), Google DeepMind (Chunjong Park, Schmidgall, Zhuang), MIT (Chanwoo Park, Paul Pu Liang, Hae Won Park). Yubin Kim lists both Google Research and MIT. — [v1 HTML](https://arxiv.org/html/2512.08296v1)
- Versions: v1 on 9 Dec 2025, v2 on 17 Dec 2025, v3 on 8 Apr 2026. arXiv gives no changelog comment. — [arXiv abs](https://arxiv.org/abs/2512.08296)

**Version differences (reconstructed by reading each version; the authors do not state them)**
- v1: 180 configurations (14,742 instance runs, Table 5), with token budgets matched across architectures. 4 benchmarks: Finance-Agent, BrowseComp-Plus, PlanCraft, WorkBench. Cross-validated R² = 0.513. Saturation interaction β = −0.408 (p < 0.001). Leave-one-domain-out R² = 0.89. Best architecture predicted for 87% of held-out configurations. Finance-Agent centralized +80.9%. PlanCraft −39.0% (Hybrid) to −70.0% (Independent). — [v1 HTML](https://arxiv.org/html/2512.08296v1)
- v2: still 180 configurations and 4 benchmarks, but 15,750 instance runs. Cross-validated R² = 0.524 (±0.033), training R² 0.613. Saturation β = −0.404 (p < 0.001), threshold about 45%. Finance-Agent centralized +80.8% (0.631 vs SAS 0.349), decentralized +74.5% (0.609), hybrid +73.1% (0.604). PlanCraft centralized −50.3% (0.282 vs 0.568), decentralized −41.5% (0.332), hybrid −39.1% (0.346), independent −70.1% (0.170). — [v2 HTML](https://arxiv.org/html/2512.08296v2)
- v3: grows to 260 configurations by adding SWE-bench Verified and Terminal-Bench (6 benchmarks). The predictive model weakens to a cross-validated R² of 0.373 (±0.170) with the Intelligence Index, or 0.413 (±0.130) with a new task-grounded "Agentic Capability Index" (training R² 0.463 / 0.481). The saturation interaction shrinks to β̂ = −0.236 (p = 0.004). The 87% best-architecture selection accuracy is retained (vs 20% random, 54% capability-only). — [v3 HTML](https://arxiv.org/html/2512.08296) and [abs](https://arxiv.org/abs/2512.08296)
- For citation: cite v3 (8 Apr 2026). It is the only version that contains software-engineering benchmarks, and its R² values (0.373/0.413) differ from the widely quoted 0.513/0.524 of v1/v2.

**Method (v3)**
- Five architectures. One Single-Agent System (SAS) and four MAS:
  - Independent: parallel agents with synthesis-only aggregation and no cross-validation.
  - Centralized: an orchestrator.
  - Decentralized: peer debate.
  - Hybrid: an orchestrator plus peer communication.
  - Tools, prompts and compute are controlled across all five. — [v3 HTML](https://arxiv.org/html/2512.08296)
- Benchmarks: BrowseComp-Plus, Finance-Agent, PlanCraft and WorkBench (45 configurations each: 9 models × 5 architectures); SWE-bench Verified (7 tools) and Terminal-Bench (2 tools) (40 configurations each: 8 models × 5 architectures). — [v3 HTML](https://arxiv.org/html/2512.08296)
- Models: GPT-5-nano/mini/GPT-5; Gemini 2.0 Flash, 2.5 Flash, 2.5 Pro; Claude Sonnet 3.7, 4, 4.5 (Sonnet 3.7 is excluded from SWE-bench and Terminal-Bench). Intelligence Index range 42–71. — [v3 HTML](https://arxiv.org/html/2512.08296)
- SWE-bench Verified uses a 20-instance subset drawn from 500 by deterministic shuffle (seed 42). Terminal-Bench uses the first 20 of 86 instances. The authors give bootstrap CIs of about ±20 points per cell and call per-pair comparisons "underpowered at n = 20". — [v3 HTML](https://arxiv.org/html/2512.08296)

**Results: parallelizable vs sequential tasks (v3, relative to SAS)**
- Finance-Agent: centralized +80.8% (0.631 vs 0.349), decentralized +74.5%, hybrid +73.1%. — [v3 HTML](https://arxiv.org/html/2512.08296)
- PlanCraft: independent −70.0%, centralized −50.3%, decentralized −41.5%, hybrid −39.1%. — [v3 HTML](https://arxiv.org/html/2512.08296)
- BrowseComp-Plus: decentralized +9.2%; independent about −35%. WorkBench: decentralized +5.6%; centralized and hybrid −1.2%. — [v3 HTML](https://arxiv.org/html/2512.08296)
- SWE-bench Verified: hybrid −2.1%, centralized −3.1%, decentralized −5.4%, independent −14.9%. — [v3 HTML](https://arxiv.org/html/2512.08296)
- Terminal-Bench: independent +1.7%, centralized −19.2%. — [v3 HTML](https://arxiv.org/html/2512.08296)
- Mean MAS effect −0.3% (95% CI −58.7% to +77.2%). Mean success rates: SAS 0.466, decentralized 0.477, centralized 0.463, hybrid 0.452, independent 0.370. — [v3 HTML](https://arxiv.org/html/2512.08296)
- The authors say "sequential interdependence, rather than complexity alone, determines coordination viability". Their abstract concludes that "architecture-task alignment determines collaborative success." — [v3 HTML](https://arxiv.org/html/2512.08296); [abs](https://arxiv.org/abs/2512.08296)
- Domain complexity D ∈ [0,1] is an ordinal score built from sequential interdependence, state-space complexity and coordination-overhead sensitivity, calibrated against observed MAS performance. Scores: WorkBench 0.000, SWE-bench Verified 0.255, Finance 0.407, Terminal-Bench 0.414, PlanCraft 0.419, BrowseComp-Plus 0.839. Below about D ≈ 0.40 MAS tend to gain; above it they tend to lose. There is no separate formal definition of "decomposability". — [v3 HTML](https://arxiv.org/html/2512.08296)

**Capability saturation**
- Interaction P_SA × log(1+n_a): β̂ = −0.236, p = 0.004. The threshold is P_SA* ≈ 0.45: past a single-agent accuracy of about 45%, more agents give negative returns. The 45% threshold matches 94% of 16 model×benchmark configurations (binomial p < 0.001). The authors call it the most robust finding. — [v3 HTML](https://arxiv.org/html/2512.08296)
- On SWE-bench, where single-agent baselines are high, the paper says it "shows limited MAS gains". — [v3 HTML](https://arxiv.org/html/2512.08296)

**Error amplification by topology**
- Trace-level error amplification: independent 17.2×, decentralized 7.8×, hybrid 5.1×, centralized 4.4×, SAS 1.0×. — [v3 HTML](https://arxiv.org/html/2512.08296) (same figures in [v1](https://arxiv.org/html/2512.08296v1))
- Caveat: after controlling for the other metrics, the main effect of error amplification on performance is not significant (β̂ = 0.014, p = 0.658). Task-level amplification is about 1.1–1.3. — [v3 HTML](https://arxiv.org/html/2512.08296)
- Centralized, hybrid and decentralized architectures cut error rates by about 22.7% on average (peak 31.4% on Finance-Agent). Independent MAS shows no correction (+4.6% amplification). "Coordination failures" occur only in MAS; hybrid has the highest rate, 12.4%. — [v3 HTML](https://arxiv.org/html/2512.08296)

**Tool-coordination trade-off and cost**
- Efficiency × tool-count interaction: β̂ = −0.096, 95% CI [−0.154, −0.037], p = 0.002. Tool-heavy tasks suffer most from coordination overhead. — [v3 HTML](https://arxiv.org/html/2512.08296)
- Token overhead vs SAS: independent 58%, decentralized 263%, centralized 285%, hybrid 515%. Successes per 1K tokens: SAS 67.7, independent 42.4, decentralized 23.9, centralized 21.5, hybrid 13.6. Turns: SAS 7.2, centralized 27.7, decentralized 26.1, hybrid 44.3. The authors name an "optimal" coordination band at about 200–300% overhead. — [v3 HTML](https://arxiv.org/html/2512.08296)

**Stated limitations (v3, Section 5)**
- At most nine agents; communication overhead grows superlinearly.
- Homogeneous agents. In 13 mixed-model configurations, centralized heterogeneous teams trailed strong homogeneous ones by 12.6 points.
- Prompts are identical across conditions and not tuned per architecture.
- Six benchmarks, with 20-instance SWE subsets.
- Token-based communication imposes cost and latency floors.
- Only six dataset-level clusters, so several predictors lose significance and dataset-level effects are "descriptive patterns".
- Held-out transfer (MAE 0.061 MAS-only, 0.077 overall) is "preliminary transfer within one benchmark".
- Source: [v3 HTML](https://arxiv.org/html/2512.08296)

### Inferences
- Our pilot fits the paper's predictions on three counts. The backlog is sequentially interdependent (later features build on earlier contexts), it is tool-heavy (an editor, a shell, a gate), and the model is strong (well past the 45% saturation point). The paper predicts SAS ≥ MAS in that regime, with centralized topologies losing least. That matches A ≥ C/C′ at the same quality and higher cost.
- Arm B maps to the paper's "Independent" topology: parallel workers, synthesis-only aggregation, no cross-validation. That is the topology with the 17.2× error amplification. B's merge-conflict failures are a concrete software instance of that amplification. Arms C/C′ (contract stage, single-writer integration) are closer to "Centralized" (4.4×).
- Our follow-up (one feature spanning six contexts) moves toward the Finance-Agent profile: decomposable sub-analyses whose results are synthesized. That is the regime where centralized MAS gained +80.8%. The paper's SWE-bench data (−2% to −15%) says this gain has not been shown for code. Our follow-up would therefore test whether the paper's parallelizable-task gain transfers to software when the architecture provides the decomposition.
- The paper controls compute (matched token budgets) and measures accuracy. Our study measures wall-clock time and dollar cost as well as quality. The paper's 285% centralized overhead fits our observation that C costs about 30% more than A. The ratios are not comparable, because our arms are not budget-matched.

### Gaps
- The authors do not explain why v3 added two SWE benchmarks and why the R² dropped; the reconstruction above comes from reading each version. No OpenReview record or venue was found.
- Per-model SWE-bench Verified numbers per architecture, and Appendix C's exact formula for D, were not extracted in full.
- The paper's MAS on SWE-bench decompose by role or debate, not by codebase structure. Nothing in it tests decomposition along architectural boundaries such as bounded contexts.

---

## Q2. "Why Do Multi-Agent LLM Systems Fail?" (Cemri et al., arXiv 2503.13657, NeurIPS 2025 Datasets & Benchmarks)

### Takeaway
MAST is a taxonomy of 14 failure modes in 3 categories, built with Grounded Theory from 150+ traces and then applied to 1,642 traces from 7 frameworks. Human inter-annotator agreement is κ = 0.88 and the LLM judge reaches κ = 0.77. The most frequent modes are step repetition (15.7%), reasoning-action mismatch (13.2%), unawareness of termination conditions (12.4%) and disobeying the task specification (11.8%). Prompt and topology interventions helped (+9.4% to +15.6% on ChatDev) but left success low, and the authors call for structural redesign. Most MAST modes come from chat-based role-play MAS. Concurrent writes to a shared artifact (our merge conflicts) are not a MAST category.

### Cited Findings
**Bibliographic**
- Authors: Mert Cemri, Melissa Z. Pan, Shuyi Yang, Lakshya A Agrawal, Bhavya Chopra, Rishabh Tiwari, Kurt Keutzer, Aditya Parameswaran, Dan Klein, Kannan Ramchandran, Matei Zaharia, Joseph E. Gonzalez, Ion Stoica (UC Berkeley). arXiv v3 revised 26 Oct 2025. — [arXiv HTML v3](https://arxiv.org/html/2503.13657)
- Venue: NeurIPS 2025, Datasets and Benchmarks Track (poster). — [NeurIPS virtual poster page](https://neurips.cc/virtual/2025/poster/121528); [mlanthology](https://mlanthology.org/neurips/2025/cemri2025neurips-multiagent). The venue was confirmed through search results listing these pages; the pages themselves were not opened. No source labelled it a spotlight.

**Dataset and agreement**
- MAST-Data has 1,642 annotated traces ("1600+" in the abstract). MAST-Data-human has 21 traces, each annotated by three experts. — [arXiv HTML](https://arxiv.org/html/2503.13657)
- 7 frameworks: ChatDev, MetaGPT, HyperAgent, AppWorld, AG2 (MathChat), Magentic-One, OpenManus. Models: GPT-4, GPT-4o, GPT-4o-mini, Claude 3.7 Sonnet, Qwen2.5-Coder-32B-Instruct, CodeLlama-7b-Instruct. Tasks: coding (ProgramDev, ProgramDev-v2, SWE-Bench Lite), math (GSM-Plus, OlympiadBench), general (GAIA, AppWorld Test-C, MMLU). — [arXiv HTML](https://arxiv.org/html/2503.13657)
- The taxonomy was derived with Grounded Theory from 150+ traces across five frameworks. Human inter-annotator Cohen's κ is 0.88 in the final rounds. — [arXiv HTML](https://arxiv.org/html/2503.13657)
- LLM-as-judge (OpenAI o1): zero-shot accuracy 0.89, F1 0.64, κ 0.58; few-shot accuracy 0.94, recall 0.77, precision 0.833, F1 0.80, κ 0.77. Generalization to unseen MAS and benchmarks (OpenManus, Magentic-One; MMLU, GAIA) reaches κ = 0.79. — [arXiv HTML](https://arxiv.org/html/2503.13657)
- Failure rates across the open-source MAS evaluated range from 41% to 86.7%. — [arXiv HTML](https://arxiv.org/html/2503.13657)

**The 14 failure modes (v3 names, prevalence over MAST-Data)**

FC1, System Design Issues (the paper glosses it as "failures stemming from system architecture, prompt specifications, or state management"; the abstract and the NeurIPS listing phrase it as "specification issues"):

| Code | Name | Prevalence |
|---|---|---|
| FM-1.1 | Disobey task specification | 11.8% |
| FM-1.2 | Disobey role specification | 1.5% |
| FM-1.3 | Step repetition | 15.7% |
| FM-1.4 | Loss of conversation history | 2.80% |
| FM-1.5 | Unaware of termination conditions | 12.4% |

FC2, Inter-Agent Misalignment:

| Code | Name | Prevalence |
|---|---|---|
| FM-2.1 | Conversation reset | 2.20% |
| FM-2.2 | Fail to ask for clarification | 6.80% |
| FM-2.3 | Task derailment | 7.40% |
| FM-2.4 | Information withholding | 0.85% |
| FM-2.5 | Ignored other agent's input | 1.90% |
| FM-2.6 | Reasoning-action mismatch | 13.2% |

FC3, Task Verification:

| Code | Name | Prevalence |
|---|---|---|
| FM-3.1 | Premature termination | 6.20% |
| FM-3.2 | No or incomplete verification | 8.20% |
| FM-3.3 | Incorrect verification | 9.10% |

- Source for all three tables: [arXiv HTML](https://arxiv.org/html/2503.13657)
- MetaGPT has 60–68% fewer FC1/FC2 failures than ChatDev on ProgramDev but 1.56× more FC3 (verification) failures. — [arXiv HTML](https://arxiv.org/html/2503.13657)

**Interventions and measured effects (Table 5, accuracy %)**

| Configuration | AG2 GSM-Plus (GPT-4) | AG2 GSM-Plus (GPT-4o) | ChatDev ProgramDev-v0 | ChatDev HumanEval |
|---|---|---|---|---|
| Baseline | 84.75 ± 1.94 | 84.25 ± 1.86 | 25.0 | 89.6 |
| Improved prompt | 89.75 ± 1.44 | 89.00 ± 1.38 | 34.4 | 90.3 |
| New topology | 85.50 ± 1.18 | 88.83 ± 1.51 | 40.6 | 91.5 |

- Source for the table: [arXiv HTML](https://arxiv.org/html/2503.13657)
- What the interventions were: for ChatDev, the improved prompt gave the CEO the final say and sharpened the role specifications; the new topology added a high-level task-objective verification step. The text gives these effects as +9.4% and +15.6% task success on ProgramDev, which matches the 25.0 → 34.4 → 40.6 rows of the table. — [arXiv HTML](https://arxiv.org/html/2503.13657)
- Significance: with GPT-4, the improved prompt beat the baseline significantly, but the topology gain was not significant (Wilcoxon p = 0.4). With GPT-4o, both beat the baseline (p = 0.03). — [arXiv HTML](https://arxiv.org/html/2503.13657)
- The authors conclude that tactical fixes give inconsistent gains and leave completion low, and that "structural redesigns" are needed. — [arXiv HTML](https://arxiv.org/html/2503.13657)

**Stated limitations**
- The taxonomy is "a foundational first step" and does not claim exhaustiveness.
- Base-model limitations such as hallucination are not fully separated from design causes.
- Some failure modes correlate (up to 0.63), which can make a judge conflate root causes.
- Closed systems (e.g. Manus) were excluded.
- Source: [arXiv HTML](https://arxiv.org/html/2503.13657)

**Mapping to our study's failure types (our inference; MAST is the source of the definitions)**
- Underspecified contracts. The closest modes are FM-1.1 Disobey task specification (11.8%), FM-2.2 Fail to ask for clarification (6.8%: "proceeds on unclear or incomplete information without asking") and FM-2.4 Information withholding (0.85%). FC1 as a whole puts specification quality on the system designer, not the model. — [arXiv HTML](https://arxiv.org/html/2503.13657)
- Agents unable to change a frozen contract. No MAST mode names this. Nearest are FM-2.2 (an agent works around an ambiguity instead of raising it) and FM-2.5 Ignored other agent's input. FM-1.2 Disobey role specification is the opposite case, an agent stepping outside its remit, for example editing a contract it does not own. MAST assumes conversational agents that can talk back, so a frozen contract with no escalation channel is a design choice MAST does not study.
- Integration conflicts (concurrent edits to one context, as in arm B). Not a MAST category. MAST's traces are mostly turn-taking role-play (ChatDev, MetaGPT) with a single shared artifact stream, not parallel writers on one repository. The closest analogues are FM-2.4/FM-2.5 (agents not aware of each other's work) and FM-1.4/FM-2.1 (lost state). This gap is worth stating in the related-work section.
- Verification gaps. These map directly to FC3: FM-3.1 Premature termination (6.2%), FM-3.2 No or incomplete verification (8.2%), FM-3.3 Incorrect verification (9.1%). Together they are about 23.5% of labelled failures. The only intervention that changed topology was adding a verification step (+15.6% on ProgramDev). This supports our arms' use of a gate (arm A) and single-writer integration with checks (arms C/C′).

### Inferences
- MAST's main message — failures come mostly from system design, not model capability — supports our framing that architecture (bounded contexts, contracts, a gate) is a coordination mechanism. Two MAST results line up with ours. The verification-step intervention gave the largest gain, and our gate is a verification step. MetaGPT's trade-off (more structure, fewer misalignment failures, more verification failures) suggests that structure displaces failures rather than removing them.
- MAST's coding traces use ChatDev/MetaGPT-era waterfall role-play on small programs (ProgramDev) and SWE-Bench Lite. None looks like a multi-feature backlog in a layered codebase, so the taxonomy should be cited as a vocabulary, not as evidence about our setting.

### Gaps
- The extraction did not surface a separate topology change for AG2 beyond the table rows. The detailed AG2 prompt and topology changes are in Appendix L, which was not read in full.
- Earlier arXiv versions (v1 March 2025, v2) used fewer traces and somewhat different category wording. A version-by-version diff was not done. Cite v3 / the NeurIPS camera-ready.

---

## Q3. The UIUC paper with hybrid single/multi-agent routing

### Takeaway
The paper is "Single-agent or Multi-agent Systems? Why Not Both?" by Mingyan Gao, Yanzi Li, Banruo Liu, Yifan Yu, Phillip Wang, Ching-Yu Lin and Fan Lai (UIUC), arXiv 2505.18286, May 2025. Across 15 datasets and 9 frameworks, MAS gains shrink as models get stronger: HumanEval/MetaGPT goes from 10.7% to 3.0% and GSM8K/debate from 9% to 0.8%. MAS still costs 4–220× more prefill tokens, and about 80% of examples are ties. The paper proposes request-level routing (an LLM difficulty rater) and cascading (SAS first, escalate on verifiable failure) between SAS and MAS.

### Cited Findings
- Title, authors and affiliation (UIUC Siebel School of Computing and Data Science). Submitted 23 May 2025, cs.MA. No venue is listed on the arXiv page fetched. — [arXiv HTML v1](https://arxiv.org/html/2505.18286v1); [arXiv PDF](https://arxiv.org/pdf/2505.18286)
- Scope: 15 datasets across 7 tasks, run on 9 frameworks.
  - Code generation: HumanEval, MBPP, DS-1000, BigCodeBench (SelfCol, MetaGPT).
  - Software engineering: SWE-Bench, plus MAST traces from ChatDev, MetaGPT and HyperAgent.
  - Math: GSM8K, AIME, MATH-500 (Debate).
  - Travel planning (TDAG), financial analysis (FinRobot), RAG QA (HoVer) and scientific experimentation (Curie).
  - Source: [arXiv HTML v1](https://arxiv.org/html/2505.18286v1)
- Models: GPT-3.5-Turbo, GPT-4o, Gemini-1.5-Flash, Gemini-2.0-Flash (default), Gemini-2.5-Pro-Preview, LLaMA-3.1-8B/70B. The abstract also mentions LLaMA-4. — [arXiv HTML v1](https://arxiv.org/html/2505.18286v1); [search listing of abstract](https://arxiv.org/abs/2505.18286v1)
- Shrinking gap, comparing the gains reported with ChatGPT-era models to those with Gemini-2.0-Flash: MetaGPT-HumanEval 10.7% → 3.0%; SelfCol-MBPP 16.0% → 1.2%; MathDebate-GSM8K 9% → 0.8%. The headline claim is "the benefits of MAS over SAS diminish as LLM capabilities improve". — [arXiv HTML v1](https://arxiv.org/html/2505.18286v1)
- Cost: MAS uses about 4–220× more prefill tokens than SAS. About 80% of examples are ties (both pass or both fail), and SAS wins on a non-trivial subset where MAS fails. — [arXiv HTML v1](https://arxiv.org/html/2505.18286v1)
- Defect analysis over the agent graph:
  - Node level: performance is capped by the agent handling the hardest subtask.
  - Edge level: a downstream agent is overwhelmed by upstream inputs and overthinks edge cases.
  - Path level: indecisive errors propagate along chains, and correct intermediate results are lost in summarization.
  - Source: [arXiv HTML v1](https://arxiv.org/html/2505.18286v1)
- Hybrid methods:
  1. Confidence-guided tracing: agents self-report confidence from 1 to 10, and this identifies which agent to upgrade.
  2. Agent routing: Gemini-2.0-Flash rates request difficulty, and a threshold sends hard requests to MAS and easy ones to SAS. A binary SAS/MAS variant agreed with the score-based method on 1,282 of 1,319 cases. On GSM8K+AIME this gives about 2% higher accuracy than MAS at about 50% of its cost.
  3. Agent cascade: SAS runs first, its output is verified (exact match or pass@1), and failures escalate to MAS. This works only when outputs are easily verifiable.
  - Source: [arXiv HTML v1](https://arxiv.org/html/2505.18286v1)
- Headline: accuracy up by 1.1–12% and deployment cost down by up to 20% (abstract). The introduction and conclusion reportedly cite cost reductions of up to 88.1%, which is internally inconsistent with the abstract. — [arXiv HTML v1](https://arxiv.org/html/2505.18286v1); [abs](https://arxiv.org/abs/2505.18286v1)
- Stated limitations: general-purpose rather than fine-tuned models; task-solving agentic systems only. — [arXiv HTML v1](https://arxiv.org/html/2505.18286v1)

### Inferences
- This is independent support for the "capability saturation" finding of Q1, measured on coding tasks (HumanEval, MBPP, BigCodeBench). It precedes 2512.08296 by about six months.
- The cascade design (SAS first, escalate to MAS when verification fails) is a principled hybrid that sits between our arms. Arm A with its gate is the "SAS + verifier" half. A natural extension would be to escalate a feature to a context fan-out only when it spans many contexts, which is our follow-up's question. The paper's caveat that cascades need cheap verification fits our setting, where acceptance tests and the conventions check are cheap verifiers.

### Gaps
- The arXiv page fetched shows no venue. Acceptance at a conference was not verified.
- The last ~47k characters of the HTML (appendices, possibly per-dataset tables) were not read. The 20% vs 88.1% cost discrepancy should be checked in the PDF before citing a cost number.

---

## Q4. Single strong agent vs multi-agent on equal budgets

### Takeaway
Under matched compute or a strong prompt, a single agent usually matches or beats multi-agent setups.
- Debate/discussion: Wang et al., ACL 2024 — a single agent with demonstrations 75.63 vs CMD 74.46.
- Multi-hop reasoning under equal thinking tokens: Tran & Kiela 2026 — SAS 0.418 vs best MAS 0.388 at 1k tokens.
- Automatically designed MAS vs CoT-SC: Jwalapuram et al. 2026 — the MAS underperform at up to 10× the cost.

"More Agents Is All You Need" (TMLR) shows that sampling-and-voting does scale with agent count, but it buys accuracy with proportional compute, and the gains shrink for stronger models and the hardest tasks. MAS become competitive mainly when a single agent's context degrades or the task offers real decomposition and context separation. This is the condition our six-context follow-up creates.

### Cited Findings
**Wang et al., "Rethinking the Bounds of LLM Reasoning: Are Multi-Agent Discussions the Key?" (ACL 2024 Long, arXiv 2402.18272)**
- Authors: Qineng Wang, Zihao Wang, Ying Su, Hanghang Tong, Yangqiu Song (HKUST / UIUC / Zhejiang; the author-to-institution mapping was garbled in the HTML). Venue: ACL 2024 (2024.acl-long.331). — [arXiv HTML](https://arxiv.org/html/2402.18272v1); [ACL Anthology](https://preview.aclanthology.org/add_acl24_videos/2024.acl-long.331)
- Benchmarks: ECQA, GSM8K, FOLIO-wiki (460 cases). Models: ChatGPT-3.5 (gpt-35-turbo 0613), Gemini Pro, Bard (PaLM 2). Frameworks: Debate, MAD, ReConcile, and the authors' Conquer-and-Merge Discussion (CMD). — [arXiv HTML](https://arxiv.org/html/2402.18272v1)
- ChatGPT-3.5 average accuracy (Table 2):

| Setup | No demo | With demo |
|---|---|---|
| Single agent | 67.41 | 75.63 |
| MAD (3 agents) | 63.42 | 70.04 |
| Debate (3 agents) | 71.67 | 73.88 |
| Debate (6 agents) | 69.38 | 72.26 |
| CMD (6 agents) | 70.75 | 74.46 |

  - Source: [arXiv HTML](https://arxiv.org/html/2402.18272v1)
- In this setup, discussion beats a single agent only without demonstrations. With demonstrations the single agent is best. In the multi-LLM setting, CMD with demos scores 78.66 vs Gemini Pro alone 78.59. The paper identifies "Judge Mistake" and "Wrong Answer Propagation" as discussion failure modes. — [arXiv HTML](https://arxiv.org/html/2402.18272v1)
- Limitations: an "agent" is a simple LLM session, the tasks are reasoning only, and only three LLMs were tested. — [arXiv HTML](https://arxiv.org/html/2402.18272v1)

**Li et al., "More Agents Is All You Need" (TMLR; arXiv 2402.05120, v1 Feb 2024, v2 Oct 2024)**
- Tencent. The method is "Agent Forest": sample N outputs and take a majority vote. Benchmarks: GSM8K, MATH, MMLU, Chess state tracking, HumanEval. Models: Llama2-13B/70B-Chat, GPT-3.5-Turbo, with GPT-4 as a single-query reference. — [arXiv abs](https://arxiv.org/abs/2402.05120); [arXiv HTML](https://arxiv.org/html/2402.05120)
- An ensemble of Llama2-13B reaches 59% on GSM8K vs 54% for a single Llama2-70B. Small models match their larger counterparts at an ensemble size of about 15–20. GPT-3.5-Turbo goes from 0.73 to 0.85 on GSM8K with 40 agents, vs 0.88 for single-query GPT-4. — [arXiv HTML](https://arxiv.org/html/2402.05120)
- Gains depend on difficulty. They rise and then fall with inherent difficulty, tapering at the hardest level. They rise with the number of reasoning steps, and they are larger for weaker models. Token cost grows roughly linearly with agent count. Combining the method with debate caused failures on code generation for Llama2 models, which the authors attribute to noise from other agents' answers. — [arXiv HTML](https://arxiv.org/html/2402.05120)

**Tran & Kiela, "Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets" (Stanford; arXiv 2604.02460, v1 2 Apr 2026, v2 11 Apr 2026; no venue listed)**
- Theory: by the Data Processing Inequality, with a fixed reasoning-token budget and perfect context utilization, a single agent is more information-efficient. MAS become competitive when a single agent's context utilization degrades or more compute is spent. — [arXiv abs](https://arxiv.org/abs/2604.02460)
- Setup:
  - Datasets: FRAMES and MuSiQue (4-hop).
  - Models: Qwen3-30B-A3B, DeepSeek-R1-Distill-Llama-70B, Gemini 2.5 Flash/Pro.
  - SAS and SAS-L, against MAS Sequential, Subtask-parallel, Parallel-roles, Debate and Ensemble.
  - Budgets: 100 to 10k thinking tokens.
  - Source: [arXiv HTML](https://arxiv.org/html/2604.02460)
- Results:
  - SAS is best or statistically tied at every budget except 100 tokens.
  - At 1k tokens: SAS 0.418, SAS-L 0.397, Debate 0.388, Parallel-roles 0.381, Sequential 0.379, Subtask-parallel 0.369, Ensemble 0.333.
  - At 2k tokens: SAS 0.421 vs Sequential 0.389.
  - Source: [arXiv HTML](https://arxiv.org/html/2604.02460)
- Under heavy context degradation (masking/substitution at α = 0.7), Sequential MAS overtakes SAS. With distractors, SAS stays ahead. The authors also report that API budget control for Gemini 2.5 is approximate, which can inflate apparent MAS gains. — [arXiv HTML](https://arxiv.org/html/2604.02460)
- Limitations: text-only multi-hop reasoning with no tools, approximate Gemini accounting, and caps enforced rather than actual spend. — [arXiv HTML](https://arxiv.org/html/2604.02460)

**Jwalapuram et al., "The Illusion of Multi-Agent Advantage" (arXiv 2606.13003, v1 11 Jun 2026, v2 13 Jun 2026; Shafiq Joty, Giuseppe Carenini and others). Only the abstract was read.**
- Automatically generated MAS "consistently underperform CoT-SC despite being up to 10x more expensive", on reasoning datasets and BrowseComp-Plus. — [arXiv abs](https://arxiv.org/abs/2606.13003)
- On a synthetic diagnostic dataset with explicit task decomposition, context separation and parallelization potential, expert-architected MAS beat automatically generated MAS on both performance and cost-efficiency. — [arXiv abs](https://arxiv.org/abs/2606.13003)
- The authors find "architectural bloat" in the generated MAS and argue that current benchmarks don't test MAS advantages such as context protection, parallel processing and distributed decisions. — [arXiv abs](https://arxiv.org/abs/2606.13003)

### Inferences
- These papers agree that most reported MAS gains come from extra compute or weak baselines. Once compute or prompt quality is matched, a strong single agent is the default to beat. Our pilot (A beats C/C′ on cost at equal quality) reproduces this in software engineering, an agentic, tool-using, multi-feature setting that none of these papers test.
- Three works give the conditions where MAS should win: degraded single-agent context (Tran & Kiela), explicit decomposition with context separation and an expert-designed architecture (Jwalapuram et al.), and parallelizable sub-analyses with centralized synthesis (Kim et al., Finance-Agent). A feature spanning six bounded contexts, with a contract stage, combines all three. It is a fair test of whether "expert-architected" decomposition, here given by DDD, recovers the MAS advantage in code.
- "More Agents" is a different kind of MAS from ours: redundant sampling of the same task plus a vote, not division of labour. It should be cited to separate redundancy-based scaling, which buys accuracy with proportional compute, from decomposition-based fan-out, which is what our arms B, C and C′ do.

### Gaps
- No peer-reviewed venue was found for Tran & Kiela (2604.02460), Jwalapuram et al. (2606.13003) or Gao et al. (2505.18286); treat them as preprints.
- For Jwalapuram et al., only the abstract was read. The MAS names, the numbers and whether any coding benchmark is included were not verified.
- I found no compute-matched single-vs-multi comparison on a realistic multi-feature software backlog or a repository-level SWE task beyond Kim et al.'s 20-instance SWE-bench Verified and Terminal-Bench subsets. This is the gap our study fills.
