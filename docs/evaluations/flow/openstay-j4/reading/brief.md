# Brief for the readers of OpenStay's J4 trees

You read six finished application trees, each the same booking marketplace (OpenStay) built feature by feature by coding agents, in two arms:
- simple-1, simple-2, simple-3: a plain TypeScript project, no imposed architecture;
- clean-1, clean-2, clean-3: built on the clean-ddd architecture (bounded contexts, layers, ports, an outbox).

The trees are at /runs/openstay/<tree>/app, read at `main` (the working tree is at main).

The rubric is ./docs/evaluations/benchmark/openstay/j4/reading.md. Read it first and apply only the items you are given, to all six trees, in the same way for both arms. The requests the agents built from are in ./docs/evaluations/benchmark/openstay/j4/backlog/ (26 to 50 are J4's; 1 to 25 earlier), read them to know what each rule is.

Commits, for diffs:
| tree | J4 start | J3 start |
| --- | --- | --- |
| simple-1 | 819690e | a495b01 |
| simple-2 | 6a4f582 | d94a13c |
| simple-3 | e2be1f1 | 955dd98 |
| clean-1 | 0551a20 | 159c51d |
| clean-2 | 26457bc | 141b51f |
| clean-3 | f3c2c17 | 81b3aa0 |
Request 40 (storage on PostgreSQL) is one commit or a few in each tree: find them with `git log --oneline --grep` or by the commit titles between the J4 start and main.

Rules:
- Read only. Do not run, build, install or test anything in any tree, do not change any file, do not start a server or a database.
- Do not open: any `acceptance` directory or `*.acceptance.ts` file; anything under /runs/openstay/j4 except this brief and your own output file; any `*.flow` directory; any file under ./docs/evaluations other than the J4 rubric and the J4 backlog. You must not know how the trees were graded.
- Grade behaviour and placement, never style. You cannot be blind to the arm; do not reward or penalise following an architecture for its own sake.
- Every verdict (pass, partial, fail, or n/a with a reason) cites a file and line as evidence. When reading alone cannot settle it, say "suspected" and why.
- Prefer `git grep`, `git show main:<path>`, `git diff --stat <a> main` and reading the functions that matter to reading whole trees.

Write your report, in English, to the output file you are given: a summary table (trees by items), then for each item and each tree the verdict, the evidence (path:line) and one or two sentences. State at the top any convention you used to apply an item, so the same rule is applied to every tree.
