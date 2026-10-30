# The robustness campaign: its starting trees and its starting point

The [campaign's protocol](../../benchmark/robustness/README.md) is written. Its runs have not started yet. This directory keeps what they start from, so that they can run later in any container, from exactly the trees the starting point was graded on.

## The trees

Each tree is a git bundle of one tree from [the extensions' E4](../../2026-10-30-flow-extensions.md#e4--real-persistence): the application after the seven-feature backlog and the move to SQLite, with its whole history.

| Bundle | Arm | Head | What the head is |
| --- | --- | --- | --- |
| [`a2.bundle`](trees/a2.bundle) | A | `f3ddb77` | E4's tree, plus the `clean-ddd` 0.2.0 tooling (`gate --fix`), vendored in `vendor/` |
| [`a3.bundle`](trees/a3.bundle) | A | `b6ef284` | the same |
| [`d1.bundle`](trees/d1.bundle) | D | `76fdcb7` | E4's tree |
| [`d2.bundle`](trees/d2.bundle) | D | `bf24ddd` | E4's tree |
| [`p2.bundle`](trees/p2.bundle) | P | `34c95e5` | E4's tree |
| [`p3.bundle`](trees/p3.bundle) | P | `d7a742d` | E4's tree |

**Why the A heads differ.** The A trees' only commit after E4 upgrades their tooling package to 0.2.0, so that the agent's gate does the bookkeeping itself ([ADR 31](../../../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md)). The package is vendored so that the tree installs anywhere. The gate passes on that head.

**Restoring a tree:**

```bash
git clone -b main docs/evaluations/flow/robustness/trees/a2.bundle /somewhere/a2/app
cd /somewhere/a2/app && yarn install
```

The campaign's runs start from `main` as restored.

## The starting point

`base-<tree>.json` holds the grader's verdict on each tree, as it is, against the campaign's kit. Each file is redacted: no model name, no local path. The protocol gives the table and what it shows:
- two A trees lose notices under a crash;
- one tree of six keeps every change across two processes;
- no tree has the drill or the outside service yet.

The two-process figures were measured on their own, after the first grading, as the protocol says.
