# Evaluations: can a newcomer add a feature from the documentation alone?

The README and CLAUDE.md claim that a developer (or an agent) who has never seen this repository can add a feature in the right shape by reading them. That claim is tested the only way it can be: periodically, a **fresh agent** with no other context is handed the repository and a small feature request, and is told to follow the repository's own guidance and to report every hesitation. What it gets right confirms the docs; what it guesses, or gets wrong, becomes a documentation fix. Each run is recorded here.

## Protocol

1. **Fresh context.** A new agent session (or a developer new to the project), working in a clean worktree of `main`, with `node_modules` installed. Nothing from the maintainers' conversation is available to it.
2. **A small feature request in product words**, touching every layer: a domain rule, a use case, a persistence change, an endpoint, wiring, tests. It must not name any file, class or pattern. Example: *"Users want to pin a note. A user can pin one of their own notes and unpin it later. Pinning an archived note is not allowed. In 'my notes', pinned notes come first."*
3. **Rules of engagement** given to the agent: read what the repository tells a newcomer to read, in that order; implement completely; run every check the repository requires; commit on a branch `eval/<feature>`; do not push, do not open a PR; do **not** edit README, CLAUDE.md, `docs/`, `conventions/` or the ESLint config (the docs are what it is tested against); do not ask questions — decide, and write down that it was unclear.
4. **A structured report**: files changed; for each of nine decisions, what was chosen and *which sentence or file said so*, or "guessed"; a candid friction log; the verification commands and their counts; time spent and what was read. The nine decisions: where the rule lives and how refusal is expressed · events and handlers · sync call vs published, and the HTTP answer · verbs and paths · read model and ordering · persistence changes and how coverage of every adapter was known · where each test went · barrels · authorization.
5. **Grading**, by a maintainer, against a rubric written **before** seeing the result (domain, application, infrastructure, presentation, wiring and hygiene; one line per expectation). Each item is PASS / PARTIAL / FAIL with evidence. The five checks are re-run by the grader, not taken from the report.
6. **Every friction-log claim about the documentation is verified against the documentation.** An agent can misreport what it read. A claim that "nothing says X" when CLAUDE.md says X is not a gap in the content; it is a gap in *findability*, and is fixed differently (a heading, a pointer from the step that raises the question).
7. **Follow-up PR**: the docs fixes, the evaluation record, and nothing of the feature itself unless the maintainers want the feature. The eval branch is pushed as a reference and linked from the record.

## Records

| Date | Feature | Result | Record |
|---|---|---|---|
| 2026-09-29 | Pin a note | every rubric item PASS; 4 documentation gaps fixed, 3 findability issues fixed | [`2026-09-29-pin-note.md`](2026-09-29-pin-note.md) |

## When to run one

After any change to CLAUDE.md's "How to add a feature", after adding a concept to the map, and before a release. A run costs about forty minutes of agent time and half an hour of grading.
