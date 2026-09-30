# 9. Work is done in one of two modes

## Context

Two kinds of change happen in this repository, and they deserve different care. Adding a feature means writing inside the architecture: an aggregate, a use case, a route, tests. Changing the architecture means moving what everything else stands on: a building block, the shared kernel's model, the table that says what may import what. The second kind is rare, consequential, and easy to do by accident — a rule bends because one feature found it inconvenient, and nobody notices until the next reader wonders why the rule has an exception.

Until now the difference was a matter of attention. The plan format already distinguished them (`architectureChanges: true`), and the evaluation protocol told agents "do not modify README, CLAUDE.md, docs/ or conventions/" — an instruction that could only be checked by reading the diff and trusting the report.

## Decision

The two kinds of change are named, written into the contract as data (`modes` in [`architecture.yaml`](../../conventions/architecture.yaml)) and checkable against a diff:

- **`yarn architecture mode feature`** refuses any change under the building blocks, the shared kernel, the conventions, the ADRs, the ESLint config or the tools. The exceptions are the integration events (publishing a fact is what a cross-context feature does) and `conventions/plans` (a feature may bring its plan). If the work seems to need one of the protected trees changed, **that is the finding**: it stops being a feature and becomes an architecture change, with its own reasoning.
- **`yarn architecture mode architecture`** allows them, and asks for the decision: a change touching `src/Architecture`, `src/SharedKernel/Domain` or the dependency table must carry an ADR in the same change.

Both compare against a base ref (`--base origin/main` by default, `--base working` for uncommitted work) and both answer in `--json`. The plan validator reads the same lists from the contract, so a plan's `architectureChanges` and the feature mode cannot drift apart.

**Neither is a CI gate.** The maintainer changes the architecture on purpose, and a gate they must fight is a gate they will remove. These are for whoever has agreed to work under a constraint: an agent asked for a feature and nothing else, an evaluation whose rules of engagement were previously honour-system, a reviewer asking what kind of change they are reading.

## Consequences

- The evaluation protocol's "do not touch the docs" becomes mechanical: the grader runs `mode feature` on the result branch instead of taking the report's word for it.
- An agent constrained to a feature can prove it, and can tell the difference between "I am stuck" and "this needs an architecture decision" — the second being a far more useful thing to report.
- The first change the architecture mode judged was its own: adding `modes` to the contract touches the dependency table's file, so it demanded this record. That is the behaviour working, not a nuisance.
- A mode says nothing about whether the change is *good*. It says which rules it is being held to.

## When to revisit

If the protected list grows to the point where ordinary features trip on it, the list is wrong, not the mode. If a third kind of change appears that is neither (a dependency bump, a release), it does not need a mode: it needs no protection, and `mode feature` will say so honestly by refusing — at which point either the list or the claim of mode is what changes.
