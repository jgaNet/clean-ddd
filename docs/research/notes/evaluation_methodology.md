# Evaluation methodology for LLM coding agents: what a rigorous single-agent vs multi-agent comparison must report and control

Scope: what the methodology literature says a study comparing one LLM coding agent against multi-agent fan-outs on a real backlog must report and control. The study in question has 3 runs per arm, a kit pre-registered before any run, mechanical grading plus read grading by an independent agent, cost from the runner's figures, and lead time on a shared 4-CPU machine. Date of compilation: 2026-10-30. Where only an abstract or a summary was available, it is stated.

## 1. Critiques of SWE-bench and similar benchmarks: contamination, weak tests, solution leakage

### Takeaway
On SWE-bench, "tests pass" overstates "issue solved" by a measurable margin:
- About 30% of passing patches in several audits are suspect.
- Absolute resolution rates are inflated by roughly 6 points or more.
- Leaderboard rankings change once tests are strengthened.
- Models show signs of memorizing the benchmark repositories.

A study on a private, new backlog avoids most contamination. It inherits the weak-test problem, though, unless correctness is checked beyond the acceptance tests.

### Cited Findings
- **SWE-Bench+ (Aleithan, Xue, Mohajer, Nnorom, Uddin, Wang; arXiv 2410.06992, 9 Oct 2024, preprint, no peer-reviewed venue listed; abstract only read):**
  - 32.67% of successful patches were "cheating": the solution was given in the issue report or its comments ("solution leakage").
  - 31.08% of passed patches were suspicious because the tests were too weak to verify correctness.
  - After filtering problematic issues, SWE-Agent + GPT-4's resolution rate fell from 12.47% to 3.97%.
  - The same problems exist in SWE-bench Lite and Verified.
  - Over 94% of issues predate the models' knowledge cutoffs (contamination risk).
  - Original SWE-bench: 2,294 issues from 12 Python repositories.
  - [arXiv abstract](https://arxiv.org/abs/2410.06992)
- **"Are 'Solved Issues' in SWE-bench Really Solved Correctly? An Empirical Study" (You Wang, Michael Pradel, Zhongxin Liu; arXiv 2503.15223, v1 19 Mar 2025, v2 9 Sep 2025; DOI 10.1145/3744916.3764576, an ACM venue the abstract page does not name; abstract only read):**
  - 7.8% of patches counted as correct fail the full developer-written test suite.
  - Differential patch testing ("PatchDiff") finds that 29.6% of plausible patches behave differently from the ground-truth patch.
    - 46.8% of those differences come from similar but divergent implementations.
    - 27.3% come from patches that change more behaviour than the ground truth.
  - Manual inspection: 28.6% of the behaviourally divergent patches are certainly incorrect.
  - Reported resolution rates are inflated by 6.2 absolute percentage points.
  - Covers three state-of-the-art tools on SWE-bench Verified.
  - [arXiv abstract](https://arxiv.org/abs/2503.15223)
- **UTBoost (Boxi Yu, Yuxuan Zhu, Pinjia He, Daniel Kang; arXiv 2506.09289, 10 Jun 2025, ACL 2025; abstract only read):**
  - Found 36 task instances with insufficient tests and 345 erroneous patches labelled as passed.
  - The corrections affect 40.9% of SWE-bench Lite and 24.4% of SWE-bench Verified leaderboard entries.
  - They cause 18 ranking changes on Lite and 11 on Verified.
  - The original PR tests are "often insufficient, allowing generated patches to pass the tests without resolving the underlying issue."
  - [arXiv abstract](https://arxiv.org/abs/2506.09289)
- **"The SWE-Bench Illusion: When State-of-the-Art LLMs Remember Instead of Reason" (Shanchao Liang, Spandan Garg, Roshanak Zilouchian Moghaddam; arXiv 2506.12286, v1 14 Jun 2025, v4 1 Dec 2025, preprint; abstract only read):**
  - Given only the issue text, with no repository structure, top models identify the buggy file path with up to 76% accuracy on SWE-bench Verified. On repositories outside SWE-bench the figure is up to 53%.
  - Consecutive 5-gram verbatim function reproduction reaches up to 35% on SWE-bench Verified/Full, against up to 18% on other coding benchmarks.
  - The authors conclude that gains may be "partially driven by memorization rather than genuine problem-solving."
  - [arXiv abstract](https://arxiv.org/abs/2506.12286)
- **SWE-bench Verified (OpenAI, August 2024).** The primary page returned HTTP 403 to my fetch, so these figures are from search-result snippets of the OpenAI page and secondary sources:
  - 93 Python-experienced software developers screened the samples.
  - They annotated 1,699 random samples of the SWE-bench test set.
  - Samples were removed when the problem statement was underspecified or the FAIL_TO_PASS tests were unfair or too specific.
  - The result is a 500-sample, human-verified subset.
  - A secondary summary claims "68.3% filtered out". This does not reconcile with 500/1,699 (about 70.6% removed), so treat it as unverified.
  - [OpenAI, Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) (403 to my fetch)
- **AI Agents That Matter (Kapoor et al., 2024)** on benchmark shortcuts. On WebArena, the top leaderboard agent STeP (35.8%) hardcodes task-specific policies. The authors argue that "Benchmark developers must do their best to ensure that shortcuts are impossible." [arXiv 2407.01502 full text](https://arxiv.org/html/2407.01502)
- **HAL (2025)** found the same kind of shortcuts in agent logs:
  - Eight cases of agents finding gold answers on HuggingFace or arXiv.
  - Agents hard-coding "plausible" solutions to pass unit tests on CORE-Bench and SciCode.
  - A scaffold (TAU-bench Few Shot) leaking benchmark examples into its few-shot data. It was excluded only after log analysis exposed it.
  - [arXiv 2510.11977 full text](https://arxiv.org/html/2510.11977)

### Inferences
- Contamination risk for this study:
  - A new backlog written after the models' training cutoff largely removes the "memorized solution" threat.
  - It is not zero if the repository (or an earlier version, or the reference implementation in other languages) is public on GitHub. Agents can also read the other three language trees inside the repo. That is legitimate "in-context leakage" by design, but it must be stated: for a feature already present in TypeScript, porting is a different task from designing.
  - Reviewers will ask for the cutoff date of each model and the repo's public history.
- Weak tests are the main threat to mechanical grading. The literature puts tests-pass-but-wrong at roughly 8 to 31% of "passing" patches on SWE-bench.
  - The study's layering (gate + acceptance tests + storm/inventory check + read grading) is a direct mitigation, and the paper should frame it that way.
  - Better still: report how many runs passed the acceptance tests but failed the read grading or the storm check. That is the study's own "PatchDiff-like" divergence rate.
- Solution leakage analogue: if the requests, storms or plans spell out the implementation, the task measures transcription, not engineering. Reviewers will ask how prescriptive the storms are, since they name commands, events and aggregates.

### Gaps
- I could not read OpenAI's SWE-bench Verified post (HTTP 403). Exact percentages, such as the share filtered for underspecification vs. for tests, and GPT-4o's before/after scores, remain unverified.
- I did not verify any 2026 SWE-bench analyses, for example claims that Verified is saturated or contaminated, or SWE-bench Pro, SWE-rebench or "live" variants. Not searched within budget.
- Venue of 2503.15223: DOI only, venue not confirmed.

## 2. Guidance on evaluating agents: variance and runs, confidence intervals, cost-aware evaluation, HAL, token/cost reporting

### Takeaway
The agent-evaluation literature agrees on what to report:
- Report cost (and raw token counts) jointly with accuracy, on a Pareto frontier.
- Compare against simple, compute-matched baselines such as retry or warming.
- Run repeatedly and report error bars, not best-of runs.
- Use paired, per-task comparisons.
- Inspect logs for shortcuts and harness bugs.

With 3 runs per arm, any confidence interval will be wide. The defensible framing is descriptive (ranges, per-task paired outcomes), not inferential.

### Cited Findings
- **"AI Agents That Matter" (Sayash Kapoor, Benedikt Stroebl, Zachary S. Siegel, Nitya Nadgir, Arvind Narayanan, Princeton; arXiv 2407.01502, 1 Jul 2024; full text read up to about 70%). Cost-accuracy Pareto, HumanEval with 164 problems and 5 runs each:**

  | Configuration | Accuracy | Cost |
  |---|---|---|
  | Warming (GPT-4) | 93.2% | $2.45 |
  | Retry (GPT-4) | 92.0% | $2.51 |
  | Escalation | 85.0% | $0.27 |
  | LDB | 91.0% | $2.19 |
  | Reflexion | 87.8% | $3.90 |
  | LATS (GPT-4) | 88.0% | $134.50 |

  - "Accuracy alone cannot identify progress because it can be improved by scientifically meaningless methods such as retrying."
  - Reflexion and LDB cost more than 50% more than warming. LATS costs more than 50x more.
  - [arXiv full text](https://arxiv.org/html/2407.01502)
- **Kapoor et al. on variance:**
  - Most agents were run 5 times, with confidence intervals from Student's t because of the small sample.
  - "Many reported accuracy scores were above the maximum of five runs that we performed in our reproduction attempts." Published numbers tend to be best-of-n.
  - Agent evaluations are "rarely accompanied by error bars," largely because of cost.
  - [arXiv full text](https://arxiv.org/html/2407.01502)
- **Kapoor et al. on overfitting and holdouts:**
  - Four levels of generality.
  - Of 17 benchmarks: distribution-specific 1/1 have appropriate holdouts, task-specific 3/6, domain-general 1/8, fully general 0/2. Seven have no holdout and no plan for one.
  - [arXiv full text](https://arxiv.org/html/2407.01502)
- **Kapoor et al. on reproducibility:**
  - WebArena's Reddit clone rate-limits posting, so task order affects results.
  - HumanEval lacks example tests for 3 of 164 problems.
  - Reflexion and LATS dropped problems, and LDB added tests.
  - LATS and STeP evaluation bugs marked incorrect tasks as correct.
  - Agent and model results are mixed on the same leaderboards.
  - [arXiv full text](https://arxiv.org/html/2407.01502)
- **Kapoor et al. on downstream vs. model evaluation.** Downstream developers should use dollar cost: "Downstream developers don't care about the number of active parameters when they're using an API." Report input and output token counts so costs can be recomputed as prices change. [arXiv full text](https://arxiv.org/html/2407.01502)
- **Kapoor et al., recommendations (summarised):**
  - Report cost alongside accuracy, in cost-controlled comparisons.
  - Report token counts.
  - Keep model and downstream evaluations separate.
  - Use holdouts matched to the intended generality.
  - Use standardized evaluation scripts.
  - Report multiple runs with error bars.
  - Compare only results produced by the same evaluation method.
  - Study human-in-the-loop performance.
  - [arXiv full text](https://arxiv.org/html/2407.01502)
- **HAL, "Holistic Agent Leaderboard: The Missing Infrastructure for AI Agent Evaluation" (Kapoor, Stroebl, Kirgis + 28 others incl. Percy Liang, Arvind Narayanan, Dawn Song, Yu Su; arXiv 2510.11977, 13 Oct 2025, preprint; full text read up to about 53%). Scale and scope:**
  - 21,730 rollouts, 9 models, 9 benchmarks, about $40,000, 2.5B tokens of logs released.
  - Models: o3, GPT-4.1, GPT-5, o4-mini, Claude 3.7 Sonnet, Claude Opus 4.1, DeepSeek V3/R1, Gemini 2.0 Flash.
  - Benchmarks include SWE-bench Verified Mini, USACO, CORE-Bench Hard, SciCode, GAIA, TAU-bench Airline, AssistantBench, Online Mind2Web, ScienceAgentBench.
  - [arXiv full text](https://arxiv.org/html/2510.11977)
- **HAL findings:**
  - Higher reasoning effort gave equal or lower accuracy in 21 of 36 model-agent-benchmark combinations.
  - The most expensive model sat on the accuracy-cost Pareto frontier in only 1 of 9 benchmarks. Fewer than one-third of models were on the frontier for a given benchmark.
  - Scaffold choice: on Online Mind2Web, $171 vs. $1,577 (9x) for about 2 accuracy points.
  - Task-specific scaffolds beat the generalist scaffold in 11 of 12 matched runs on SWE-bench Verified Mini. The generalist was cheaper in 20 of 24 comparisons.
  - Token usage correlated positively with accuracy on 6 of 9 benchmarks.
  - [arXiv full text](https://arxiv.org/html/2510.11977)
- **HAL log analysis (1,634 transcripts):**
  - Agents violated a benchmark instruction in their final answer in over 60% of failed tasks on AssistantBench and CORE-Bench.
  - Environmental barriers appeared in about 40% of failed tasks.
  - Verification steps raised success by 13 to 87%.
  - [arXiv full text](https://arxiv.org/html/2510.11977)
- **HAL infrastructure pitfalls:**
  - Providers silently swapped model weights.
  - OpenRouter served different quantizations under the same endpoint name.
  - An OpenAI API change removed a parameter some scaffolds relied on.
  - A logging bug and a LiteLLM gap in GPT-5 reasoning support.
  - HAL recommends systematic log analysis as part of evaluation, standardized infrastructure, and reporting cost, tokens, failure modes and scaffold-model interactions.
  - [arXiv full text](https://arxiv.org/html/2510.11977)
- **"Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations" (Evan Miller; arXiv 2411.00640, 1 Nov 2024, preprint, stat.AP; full text read):**
  - Report the CLT standard error (for binary scores, sqrt(p(1−p)/n)) and a 95% CI of ±1.96 SE.
  - Use clustered standard errors when questions come in groups. These can be about 3x the naive SE (DROP: 1.34 vs. 0.44).
  - Resample each question K times and average. Do not pool the K×N answers as independent.
  - Do not lower temperature to cut variance.
  - Compare models with **paired** per-question differences, since positive correlation between models shrinks the SE.
  - Do a power analysis before running. The example (3-point effect, 80% power, α=5%) needs about 969 questions. Going from 1 to 10 samples per question cut the minimum detectable effect from 13.2% to 7.5%.
  - "Treat evals as experiments rather than contests."
  - [arXiv full text](https://arxiv.org/html/2411.00640v1)
- **Baltes et al. LLM guidelines checklist (see section 3):**
  - "Justify the number of repetitions, e.g., via power analysis or convergence of descriptive statistics."
  - "Repeat experiments because LLMs are non-deterministic, and report the result distribution."
  - For model comparisons, use inferential statistics (hypothesis tests, effect sizes).
  - [llm-guidelines.org checklist](https://llm-guidelines.org/checklist/)

### Inferences
- **Three runs per arm.**
  - With Student's t at 2 degrees of freedom, the 97.5% quantile is 4.30 (standard t-table value). A 95% CI on a 3-run mean is about ±2.5 sample SDs, so most differences between arms will not be statistically distinguishable.
  - Miller's power formula makes this concrete.
  - Defensible framing: report all three values (ranges, never best-of), the paired per-request outcome table across arms, and an explicit statement that the study is exploratory and powered only to detect large effects.
  - Clustering matters: requests within one backlog share a codebase and are sequentially dependent (feature N builds on N−1). Runs are the unit, not requests.
- **Compute-matched simple baseline.** This is the single most predictable reviewer objection.
  - Kapoor shows retry and warming baselines match complex agents.
  - A multi-agent fan-out spends more tokens. Reviewers will ask whether a single agent given the same token or dollar budget (retry or best-of-N against the gate, or one extra self-review pass) closes the gap.
  - The study should either include one or plot every arm on a cost-quality Pareto chart and discuss it.
- **Cost from the runner's reported figures.** Report raw input, output, cache-read and cache-write tokens per run and the price table with its date, so cost can be recomputed (Kapoor). State that runner-reported cost is an estimate if it is not reconciled against billing. HAL shows providers can silently change weights or quantization, so record the exact model ID and dates.
- **Log inspection.** HAL's finding that over 60% of failures violated instructions argues for a systematic read of transcripts. Categorise failures, which Baltes et al. ask for as "error analysis". This also catches agents editing tests or the gate to pass, which is a shortcut.

### Gaps
- HAL's appendices (any explicit reporting checklist) were not read (truncated).
- I did not read the remaining 30% of Kapoor et al. (appendices).
- No source found that gives a principled minimum number of runs for agent studies. Guidance is "justify it" (power analysis or convergence).

## 3. Empirical SE guidance: threats to validity, pre-registration and registered reports, guidelines for LLM studies in SE

### Takeaway
The current SE standard for LLM studies is Baltes, Wagner et al.'s eight guidelines (llm-guidelines.org, under review at EMSE, v5 May 2026). It requires disclosure of:
- the exact model, version and date;
- the full configuration;
- prompts and **agent configuration artefacts (context files, skills, subagents, hooks)**;
- full runtime traces;
- a justified number of repetitions;
- human validation of LLM judges;
- leakage discussion.

It recommends an open-weight baseline. Registered reports, in SE since MSR 2020, are the established vehicle for pre-registration.

### Cited Findings
- **"Guidelines for Empirical Studies in Software Engineering involving Large Language Models" (Sebastian Baltes, Florian Angermeir, Chetan Arora, Marvin Muñoz Barón, Chunyang Chen, Lukas Böhme, Fabio Calefato, Neil Ernst, Davide Falessi, Brian Fitzgerald, Davide Fucci, Junda He, Christoph Treude, Marcos Kalinowski, Stefano Lambiase, Daniel Russo, Mircea Lungu, Cristina Martinez Montes, Lutz Prechelt, Paul Ralph, Rijnard van Tonder, Stefan Wagner):**
  - arXiv 2508.15503, submitted 26 Aug 2025, v5 10 May 2026.
  - Its structure was revised during review at *Empirical Software Engineering*. Acceptance is not stated on the page.
  - It grew out of the ISERN 2024 meeting and is modelled on CONSORT.
  - Seven study types: LLMs as annotators, as judges, for synthesis, as subjects, studying LLM usage, LLMs for new SE tools, benchmarking LLMs for SE tasks.
  - Eight guidelines: declare usage and role; model version/configuration/customizations; system and prompt design (architecture beyond the model); session traces; baselines, benchmarks and metrics; open LLM as baseline; human validation; limitations and mitigations.
  - [arXiv v5 full text, partially read](https://arxiv.org/html/2508.15503v5); [llm-guidelines.org](https://llm-guidelines.org/guidelines/)
  - Precursor: Wagner, Muñoz Barón, Falessi, Baltes, "Towards Evaluation Guidelines for Empirical Studies involving LLMs" (arXiv 2411.07668, WSESE 2025). [arXiv](https://arxiv.org/abs/2411.07668v3)
- **MUST vs SHOULD.**
  - "MUST" items are typically disclosure: model versions, prompts, architecture, limitations.
  - "SHOULD" items are methodological recommendations: baselines, validation, statistics.
  - A deviation from a SHOULD must be justified when it could compromise validity or reproducibility.
  - Supplementary material follows the ACM SIGSOFT Open Science Policies.
  - Reviewers apply the "reasonable efforts" principle of the ACM SIGSOFT Empirical Standards.
  - [llm-guidelines.org](https://llm-guidelines.org/guidelines/); [arXiv v5](https://arxiv.org/html/2508.15503v5)
- **Checklist items directly relevant here.** The fetched copy did not distinguish MUST from SHOULD visually. Items are paraphrased from [llm-guidelines.org/checklist](https://llm-guidelines.org/checklist/).
  - Model and configuration:
    - Report the exact model or tool version, configuration and **execution date**.
    - Report default parameters too.
    - Explain version choices, including pilot comparisons.
    - Acknowledge the reproducibility limits of commercial tools.
  - Agent configuration and tools:
    - [context-files] Describe configuration mechanisms ("context files, skills, subagents, hooks, settings, rules") and include all of them as supplementary material.
    - [tool-use] Summarise the tools exposed and include tool schemas and MCP servers.
    - [agents] Specify agent roles, reasoning frameworks and communication flows. Distinguish the model's reasoning, its tool calls and its interactions with users, the environment or other agents.
  - Harness and infrastructure:
    - [benchmarking] Describe the evaluation harness.
    - [latency-sensitive] State the infrastructure and hardware for time-sensitive measurements, and report latency when it can affect outcomes.
  - Traces:
    - Include full interaction logs.
    - [agents] Include human-in-the-loop exchanges (feedback, approvals, refinements).
    - [agents] Include the complete runtime trace (tool or artifact name, arguments, result, order, and which configured artifacts were activated) and any exposed plans.
    - Consider an open trace format such as OpenTelemetry GenAI.
  - Repetitions and statistics:
    - Justify the number of repetitions (power analysis or convergence).
    - Repeat runs and report the distribution.
    - Use inferential statistics and effect sizes for comparisons.
    - Include a naive lower-bound baseline and traditional (non-LLM) baselines where possible.
  - Construct and error analysis:
    - Give an operational definition of the target phenomenon.
    - Identify confounders and acknowledge them as construct-validity threats.
    - Categorise failures by frequency.
    - Describe and justify the sampling of problems, and discuss generalisability for non-probability samples.
  - Raters: [multi-rater-scoring] for ratings that vary across raters or runs, human or LLM-as-judge, report the per-item rating distribution, not only aggregates.
  - Baselines: [commercial-models] include an open-weight LLM baseline and report inter-model agreement.
  - Leakage and generalisation:
    - Discuss data leakage.
    - State whether generalisation across LLMs or over time was assessed.
  - Mitigations: replication packages, human validation, longitudinal re-runs, triangulation, sensitivity analysis.
  - Claims: "Don't claim more than the evaluation verified."
  - The checklist has **no explicit item on temperature, seed, or cost/token reporting**. Cost appears only as "justify LLM usage in light of its resource demands."
- **"Registered reports in software engineering" (Neil A. Ernst, Maria Teresa Baldassarre; *Empirical Software Engineering* 28(2):55, online 11 Mar 2023; arXiv 2302.03649; abstract/snippets only):**
  - A registered report starts with peer review and approval of the detailed protocol, including research questions, before the study runs.
  - It curbs questionable research practices and gives early design feedback.
  - Introduced in SE at MSR 2020. At the time of writing it was used at three conferences and two journals, including EMSE.
  - [arXiv](https://arxiv.org/abs/2302.03649v1); [Springer PDF](https://rd.springer.com/content/pdf/10.1007%2Fs10664-022-10277-5.pdf)
- **Threats-to-validity sections.** Baltes et al.'s guideline 8 is structured around internal, construct and external validity, plus reliability and reproducibility, ethics, and environmental constraints. Majority voting improves reliability but raises cost. [arXiv v5](https://arxiv.org/html/2508.15503v5)

### Inferences
- The study's pre-registered kit (requests, storms, acceptance tests, rubric committed before any run) is pre-registration in the Ernst & Baldassarre sense only if it is timestamped and immutable, for example a git commit or tag cited in the paper.
  - It should also fix the analysis plan: metrics, how ties and failures are scored, what counts as a run, and the exclusion rules.
  - Reviewers will look for a "deviations from protocol" section. The pilot (one run per arm, then the full campaign) must be reported as a pilot, together with any kit changes it triggered.
- The agent configuration (CLAUDE.md, skills, subagent definitions, hooks, the pack/driver code) is now an explicit reporting item. Ship it at the exact commit used per run.
- Likely reviewer flags against the Baltes checklist:
  - **No open-weight baseline.** It is a SHOULD, so justify the deviation (for example, that the harness is tied to one vendor's runner).
  - **No naive baseline.** For example "the request as-is with no skills, CLAUDE.md or storms".
  - **Repetitions not justified by power.**
  - **Single model family across arms and grader.**
  - **No longitudinal re-run.** Vendor models change silently, per HAL.
- Mapping the study's threats onto the Wohlin et al. categories:
  - **Conclusion validity:** 3 runs; low power.
  - **Internal validity:** shared-machine contention; sequential backlog dependence; the same author wrote the kit and the harness; model drift across run dates.
  - **Construct validity:** do acceptance tests plus a rubric measure "right shape"? Agent-graded rubric.
  - **External validity:** one codebase (a DDD reference built to be agent-learnable), one vendor, one language, or four.
  - **Reliability:** non-determinism.
  - This mapping is my synthesis. I did not fetch Wohlin's book in this session.

### Gaps
- I did not fetch Wohlin et al., *Experimentation in Software Engineering* (Springer, 2012; 2nd ed. 2024) in this session. The four-category threat classification (conclusion, internal, construct, external) is standard, but it is not verified here with a URL.
- Exact MUST/SHOULD levels per checklist item: the fetched checklist did not render the distinction. The individual guideline pages (/guidelines/model-version/, /design/, /traces/, /human-validation/, /benchmarks-metrics/) were not fetched.
- MSR or EMSE registered-report track requirements, such as the exact template and how deviations are handled: not fetched.
- ACM SIGSOFT Empirical Standards ("Engineering Research", "Benchmarking" standards): not fetched.

## 4. LLM-as-judge and agent-as-grader reliability for code grading; inter-rater agreement expectations

### Takeaway
LLM judges correlate well with humans on some code tasks, but they are order-sensitive and task-dependent. An agentic judge reached about 90% agreement with a 3-expert human consensus on requirement satisfaction. Individual human experts reached about 85 to 89%, and pairwise human disagreement ran 10 to 30%.

Current guidelines require that an LLM grader replacing humans be validated against human judgments. The study must report agreement and per-item rating distributions.

### Cited Findings
- **"Can LLMs Replace Human Evaluators? An Empirical Study of LLM-as-a-Judge in Software Engineering" (Ruiqi Wang et al.; arXiv 2502.06193; ISSTA 2025, DOI 10.1145/3728963; abstract and summaries only):**
  - Seven general-purpose LLM-as-judge methods and two fine-tuned evaluator LLMs, compared on code translation, code generation and code summarization against human scores.
  - The best output-based methods reached Pearson correlations with humans of 81.32 (translation) and 68.51 (generation). ChrF++, one of the best conventional metrics, reached 34.23 and 64.92.
  - **Low agreement when the order of response pairs is swapped** (position bias).
  - LLM judges "can potentially replace" humans only in certain SE tasks.
  - [arXiv abstract](https://arxiv.org/abs/2502.06193v2); [ISSTA 2025 page](https://conf.researchr.org/details/issta-2025/issta-2025-papers/85/Can-LLMs-replace-Human-Evaluators-An-Empirical-Study-of-LLM-as-a-Judge-in-Software-E)
- **"Agent-as-a-Judge: Evaluate Agents with Agents" (Mingchen Zhuge, ..., Jürgen Schmidhuber, Meta/KAUST; arXiv 2410.10934, 14 Oct 2024, preprint; full text read up to about 65%):**
  - DevAI benchmark: 55 tasks with 365 hierarchical requirements.
  - Agreement with the 3-expert human consensus:

    | Judge | Agreement range |
    |---|---|
    | Agent-as-a-Judge, gray-box | 86.61 to 92.07% |
    | Agent-as-a-Judge, black-box | 83.88 to 90.44% |
    | LLM-as-a-Judge | 60.38 to 84.15% |
    | Individual human experts | 76.23 to 92.63% (averages 84.88 to 89.34%) |
    | Human majority vote | 93.98 to 95.08% (6.01% overall error) |

  - Pairwise human disagreement: about 10 to 30%.
  - Cost: human evaluation took 86.5 hours (about $1,297.50 at an assumed $15/h). The agent judge cost $30.58 and took 118 minutes.
  - Caveats:
    - Single backend model (gpt-4o-2024-05-13).
    - Class imbalance makes the alignment rate misleading, so precision-recall curves are used as well.
    - The human consensus is not guaranteed ground truth.
    - Gray-box needs trajectories.
  - [arXiv full text](https://arxiv.org/html/2410.10934)
- **Baltes et al. checklist on LLM judges:**
  - When LLMs replace humans, justify it and report inter-model and model-to-human agreement.
  - Validate LLM judgments against human judgment and report aggregation methods.
  - For ratings that vary across raters or runs, report per-item rating distributions.
  - [llm-guidelines.org checklist](https://llm-guidelines.org/checklist/)
- **Kapoor et al. on evaluation bugs.** LATS and STeP evaluation bugs marked failures as successes. This argues for auditing the grader itself. [arXiv full text](https://arxiv.org/html/2407.01502)

### Inferences
- An "independent agent" grader is independent of the run, but probably not of the model family.
  - If the grader and the agents use the same vendor and model, reviewers will raise **self-preference bias** and shared blind spots.
  - Mitigations: a different model for grading; a human (author) grading of a sample of runs blind to the arm, with agreement reported (Cohen's κ or Krippendorff's α per rubric item); grading each artefact more than once to report grader variance; randomised presentation order.
- **Blinding.** The read-grader should not know which arm produced a diff. Fan-out arms may leave tell-tale traces (plan files, many commits), so state what was scrubbed.
- **Expected agreement level.** Agent-as-a-Judge's numbers suggest roughly 85 to 90% item-level agreement with humans is achievable on requirement checks. Human experts themselves disagree 10 to 30% pairwise, so a rubric must be operationalised precisely, item by item, with examples.
- Class imbalance: if most rubric items pass, raw percent agreement is inflated. Report κ or α or precision-recall rather than percent agreement alone.

### Gaps
- No verified source in this session on conventional κ thresholds (for example Landis & Koch). Not fetched.
- Self-preference or self-enhancement bias of LLM judges for code specifically: no verified source fetched here. The bias is documented in general LLM-judge work, for example Zheng et al.'s MT-Bench paper, which was not fetched.
- The Wang et al. ISSTA paper's full text, including its exact agreement metrics and whether it reports κ, was not read.

## 5. Human-in-the-loop time accounting in agent studies (METR RCT and related)

### Takeaway
The METR RCT is the reference for measuring human time with AI:
- Tasks defined before randomisation.
- Self-reported time verified by screen recordings.
- Time decomposed into activities, including prompting, waiting on AI, reviewing AI output and idle.
- Regression adjustment for task difficulty.
- Forecasts recorded and compared with outcomes.

Its headline result was that experienced developers were 19% slower with early-2025 AI while believing they were 20% faster. Self-perceived time savings are therefore unreliable. Kapoor et al. note that human-in-the-loop results depend on operator skill.

### Cited Findings
- **"Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity" (Joel Becker, Nate Rush, Elizabeth Barnes, David Rein, METR; arXiv 2507.09089, v1 12 Jul 2025, v2 25 Jul 2025, preprint; blog 10 Jul 2025):**
  - 16 experienced developers on large open-source repositories, averaging 5 years on the project.
  - 246 issues randomly assigned to AI-allowed (136) or AI-disallowed (110). Tasks averaged about 2 hours. Developers were paid $150/h.
  - Main tools: Cursor Pro with Claude 3.5/3.7 Sonnet.
  - AI-allowed issues took about 19% longer.
  - Forecasts: developers predicted −24% time beforehand and still estimated −20% afterwards. Economics experts predicted −39%, ML experts −38%.
  - [arXiv abstract](https://arxiv.org/abs/2507.09089); [arXiv full text](https://arxiv.org/html/2507.09089); [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- **METR time measurement:**
  - Self-reported total implementation time per issue, including time after PR review.
  - Screen recordings checked compliance. Issues were dropped for cheating, for a recording broken more than 10% of its time, or for self-report differing from the recording by more than 20%.
  - Post-review time for unreviewed or unmerged issues was imputed with the condition mean.
  - The estimate comes from a log-linear regression adjusting for forecast difficulty. The raw ratio of means was 34%, against 19% adjusted, because AI-allowed issues were slightly harder after randomisation.
  - [arXiv full text](https://arxiv.org/html/2507.09089)
- **METR time decomposition:**
  - 143 hours of recordings manually labelled at about 10-second resolution (about 29% of total hours). 84 hours were used after filtering.
  - With AI allowed: less active coding and searching, more prompting, waiting on AI (about 4% of time), reviewing and cleaning AI output (about 9%), and idle.
  - Developers accepted fewer than 44% of AI generations.
  - [arXiv full text](https://arxiv.org/html/2507.09089)
- **METR uncertainty and caveats:**
  - The blog states that clustered standard errors were "not reported in the released paper, but forthcoming," and that 246 issues give "just enough" power to reject zero effect. I did not see a numeric CI in the parts read.
  - Not blinded. Experimental artefacts cannot be fully ruled out.
  - The authors do not claim that AI fails to speed up most developers, other settings or future systems.
  - Learning effects beyond about 50 hours of Cursor use cannot be ruled out.
  - [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); [arXiv full text](https://arxiv.org/html/2507.09089)
- **Follow-up.** The METR blog page now marks these early-2025 results as "out of date" and points to new data published in February 2026 on late-2025 tools. I did not read that follow-up. [METR blog](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- **Kapoor et al. on human in the loop:**
  - Most evaluations test chatbots or fully autonomous agents, which does not match real use.
  - Simple human feedback raised GPT-4 from 0% to over 86% on hard programming problems (citing Shi et al.).
  - Human-in-the-loop evaluation is costly and depends on the skill of the human operators.
  - [arXiv full text](https://arxiv.org/html/2407.01502)
- **Baltes et al. checklist.** [agents] Include logs of human-in-the-loop exchanges (feedback, approvals, refinements). [agents] Report how often agent proposals were accepted and how they were modified. [llm-guidelines.org checklist](https://llm-guidelines.org/checklist/)

### Inferences
- **Human time in this study.** Human effort sits outside the measured runs: writing requests, facilitating storms and deciding hot spots, writing acceptance tests and the rubric, and any intervention during or after runs (answering questions, fixing harness failures, resuming killed runs).
  - Reviewers will ask that it be counted, or that the claim be limited to "agent lead time and cost given a fixed, pre-built kit".
  - The kit is a shared fixed cost across arms, so it does not bias the comparison. It does bias any claim about end-to-end productivity.
  - Any per-arm human intervention (for example, a fan-out arm needing a merge-conflict fix) is arm-specific and must be logged and counted, ideally timestamped from transcripts rather than recalled. METR found self-perception off by about 40 points.
- **Lead time on a shared 4-CPU machine.** This is a measurement confound.
  - Parallel sub-agents compete for 4 CPUs during builds and tests, so fan-out wall-clock is partly a function of hardware.
  - Concurrent runs of different arms on the same machine would contaminate each other.
  - Baltes et al.'s [latency-sensitive] items ask for the infrastructure to be stated.
  - Options:
    - Run arms serially on an otherwise idle machine and say so.
    - Report CPU-seconds alongside wall-clock.
    - Report API latency separately from local build and test time.
    - Treat wall-clock as indicative only.
  - API latency also varies with provider load and time of day. Record run start times.

### Gaps
- METR's numeric confidence interval for the 19% figure was not found in the parts read. It was said to be in Appendix D or forthcoming.
- The February 2026 METR follow-up results (late-2025 tools) were not read. Numbers unknown.
- No source found on accounting for the human effort of building evaluation kits (task specs, tests) in agent-vs-agent comparisons, as distinct from human-with-AI RCTs.
