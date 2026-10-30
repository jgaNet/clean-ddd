# The control: the same backlog without the architecture, and without its tooling

**Date:** 2026-10-30 · **Protocol, written before the runs:** [`benchmark/control/`](benchmark/control/README.md) · **Reading rubric:** [`reading.md`](benchmark/control/reading.md) · **Before it:** [the campaign](2026-10-30-flow-phase-4-campaign.md) · **Logs, grades, metrics, readings:** [`flow/control/`](flow/control)

Phase 4 compared ways of staffing agents. Every one of its arms had the same architecture, Clean Architecture and DDD, and the same tooling, `clean-ddd`. It could not say whether either one helps an agent. This record adds two control arms on the same backlog, with the same model, the same driver and the same hidden acceptance tests:

- **P:** a plain TypeScript project.
- **D:** the architecture with its tooling taken out, given as prose.

## The result

| Arm | Runs | Features passing the hidden tests | Active time | Reported cost | Source lines added | Test cases |
| --- | --- | --- | --- | --- | --- | --- |
| **A**: architecture and tooling | 3 (phase 4) | 7/7 in each | 35.3–45.6 min | $10.39–12.11 | 3,335–3,766 | 179–202 |
| **D**: architecture as prose, no tooling | 2 | 7/7 in each | 32.7–32.8 min | $8.70–9.87 | 3,544–3,694 | 160–163 |
| **P**: plain project | 3 | 7/7 in each | 14.0–18.6 min | $2.30–3.36 | 680–893 | 72–94 |

- **On delivery, no arm differs.** Every run of every arm passes every hidden acceptance test.
- **On time and cost, P differs from A and D, and A and D do not differ from each other.** The ranges of P do not overlap those of A or D. P was about 2.5 times sooner and about 4 times cheaper than A. Its feature 1 included the asynchronous command protocol, which A and D found in their created project. D sits at the low edge of A's range on time and below it on cost, with two runs.
- **What the architecture costs is mostly reading and writing more.** A and D wrote about four times the source and twice the test cases of P for the same behaviour. A single conversation pays for every token it reads again.

## A large change: feature 8

One fresh agent took feature 8, team spaces, on one finished tree of each arm. A and C′ are the campaign's.

| | Active time | Cost | Feature 8's tests | Features 1–7 afterwards | Source lines added · removed |
| --- | --- | --- | --- | --- | --- |
| A, one agent | 23.8 min | $8.67 | 8/8 | no regression | 3,747 · 100 |
| C′, six slices | 18.9 min | $15.07 | 8/8 | no regression | — |
| D, one agent | 19.3 min | $6.86 | **7/8** | no regression | 3,088 · 89 |
| P, one agent | **8.6 min** | **$1.71** | 8/8 | no regression | 696 · 24 |

**D's failure.** D's tree records the space's creator as `member-joined`, which the test does not expect. That failure is real, and reproduced twice. The request says the activity records members "joined" without saying whether a creator joins. A's storm settled it, since the creation of a space is a separate fact there. D and P had only the request; P happened to read it as the test does.

**The prediction, written before the runs, was that if the architecture pays anywhere, it is here. It did not pay here.** The plain tree took the largest change of the benchmark sooner, cheaper, and with fewer lines changed than any architecture arm, with no regression. This is one run per arm: it shows a direction, not a result.

## What the tests cannot see: the reading

Two agents that had not run the benchmark read the eight trees, under neutral names. The rubric was written before the reading and applies to any structure. The two readers read three items differently; [the harmonized table](flow/control/reading/README.md) applies one reading to every tree.

| Arm | Items passed of 7, one decision per behaviour | Items passed of 7, one function per rule as worded |
| --- | --- | --- |
| A | 6–7 | 5–6 |
| D | 6–7 | 6–7 |
| P | 6–7 | 5–6 |

- **No difference is shown under either reading.** The failures differ in kind:
  - Layered trees duplicated a rule across two contexts: the reminder's due check, in Notes and again in Notifications (A run 2, D run 2).
  - A layered tree answered a missing field with a 400 instead of an `ERROR` outcome (A run 3).
  - Plain trees coupled notes and notifications through internal types (P runs 1 and 2).
- **Changes were more local in the plain trees.** These counts come from the change probes: the files a developer would edit, without making the change.

  | Probe | P trees | A and D trees |
  | --- | --- | --- |
  | 1. Titles up to 200 characters | 2 | 3 to 4 |
  | 2. Case-insensitive tags | 2 | 3 to 6 |
  | 3. A due reminder also emailed | 5 | 10 to 12 |

  A layered change spreads across more, smaller files, and finding them meant reading about twice as many lines.
- **Security went both ways.**
  - P's tokens never expire. A's and D's are signed and expire in 24 hours.
  - A's pilot signs its tokens with a fixed fallback secret, so a token can be forged when no secret is configured. It took that pattern from the reference itself: `typescript/src/Bootstrap/Fastify/application.settings.ts` falls back to a fixed development secret. That is a defect of this repository, to fix.
  - Login timing reveals whether an email is registered in five trees of all three arms.

## What the tooling did

- **The architecture held without its tooling.**
  - D1's tree passes every import rule the tooling would have generated: 0 refusals over 177 files. This was checked by injecting a violation, which the rules refused.
  - D2's tree has 20 refusals in 10 files, all in tests or import style:
    - 10 relative imports into a subdirectory;
    - 10 Domain tests importing an in-memory adapter.
  - No production file crosses a boundary.
  - A's trees have none by construction.
- **What the tooling caught in A's runs was mostly its own bookkeeping.** These counts come from the agents' transcripts.
  - Each run called the tooling 29–32 times. 1–6 of those calls failed, on:
    - a storm not yet marked done;
    - a document to regenerate;
    - a context or a relationship missing from the map.
  - One catch was substantive: feature 7 reshaped a command of feature 1, and the storm check said so.
  - The import rules never had to refuse an import in production code.
- **The fan-out is where the tooling did work no prose could.**
  - In the pilot, naive parallel agents (B) lost three features to conflicts in one context.
  - The architecture-aware fan-out, with the context as conflict key, a frozen contract and one writer, delivered all seven.
  - On feature 8 it was 21% sooner than one agent on the architecture. It was not sooner than one agent on a plain project.

## What it says

**On this backlog, with this model, Clean Architecture and DDD did not improve an agent's development.**
- Delivery was the same, and so was quality as two readers judged it.
- It took 2 to 4 times the time and cost, and changes touched more files.
- The prediction written before the runs said this was a possible outcome, and it is the one observed.

**The tooling did what it claims, but what it claims bought little here.**
- It holds the code to the architecture exactly. A strong model held it almost as well from prose.
- Its storms and map are ceremony a single agent pays for.
- It made a parallel fan-out safe. On this benchmark, that fan-out was not worth having against a plain single agent.

**What this does not show**, and would have to be measured before anyone concludes the architecture never pays:
- **A longer horizon.** Eight features and about 4,000 lines are small. Phase 4's related work found that architectural smells grow with code size, which this backlog never reaches.
- **Real infrastructure.** Every adapter here is in memory. The outbox, optimistic concurrency and transactions the architecture brings are never exercised by a test.
- **Weaker models.** The literature finds architecture documentation helps them most.
- **People reading the code.** Here only agents read it.
- **Several people or agents changing one codebase over months.**

## Biases

- **The kit was written by the architecture's author.** The API's asynchronous protocol came from the architecture, and P had to build it. P was still sooner.
- **The readers cannot be blind to the arm,** since the structure shows it. They graded behaviour and placement against a rubric written before reading.
- **One model, one backlog, few runs.** These are three runs of A and P and two of D on the backlog, and one per arm on feature 8.
- **A container restart interrupted the first P and D runs.** The harness defect they revealed is recorded in the protocol's amendment: Yarn 1's built-in `check` shadowed the script. Those two runs are excluded.

## Cost

| | Reported |
| --- | --- |
| P, three runs | $8.15 |
| D, two runs | $18.57 |
| Feature 8, P and D | $8.57 |
| The two interrupted runs | $3.17 reported, plus two killed sessions that reported nothing |
| **The control** | **about $40**, beside the readers' sessions |
