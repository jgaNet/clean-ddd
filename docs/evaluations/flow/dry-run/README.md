# Rehearsing a kit: the horizon kit, after the fact

[`dry-run.mjs`](../../../../.claude/flow/dry-run.mjs) rehearses a kit before any agent runs. To know whether it would have caught anything, it was run on a kit whose defects are known: the horizon kit of the [extensions](../../2026-10-30-flow-extensions.md#e3--a-longer-horizon), as it was at commit `9dd2d5b`, before its three [amendments](../../benchmark/extensions/README.md#amendments).

**The trees** are E3's, one per arm ([the plan](horizon-retro.yaml)):
- `before`: the commit each run started from;
- `solved`: the same tree after its run wrote the five features.

The regression kit is the benchmark's features 1–7. The rehearsal cost no agent and took about twenty minutes of machine time.

## What it said

The verdict is **defect**, from [the report](horizon-retro.json). Each of its findings is one of the three amendments, which were found by grading after the runs had been paid for:

| The rehearsal | Amendment |
| --- | --- |
| The formatter refuses `9-comments`, `11-editors` and `12-delete-account`. The linter and the type checker refuse an unused `call` in `13-search`. This happens in every tree, before and after. | 1: the hidden tests failed the project's own gate |
| `delete-account` fails on every solved tree (a3, d2, p2): *suspect the kit first* | 2: the deletion test followed its outcome with the token it deletes |
| To read: feature 4's `share-a-note` passes before and fails after the features, on d2 and p2 | 3: feature 11 changes a rule that feature 4's test still holds |

It found nothing else. Every horizon test failed on every `before` tree, so none tests nothing. The other four features pass on every solved tree.

## What it does not show

- **A solved tree is needed for solvability and for regression.** This rehearsal had three, because the runs had happened. Before a campaign, a solved tree is one written by hand, or by an earlier run of a similar request. Without one, the rehearsal holds only hygiene and discrimination, which would still have caught amendment 1.
- **Amendment 3 is a decision, not a defect.** The rehearsal points at it. Whether feature 11 supersedes feature 4's assertion or the trees regressed is read by a person, as it was.
- **One kit.** The rehearsal was built after these defects were known, and is tested on the defects it was built for. The robustness kit is its first real use.
