---
name: feature
description: Add a feature to this codebase in the shape the architecture requires — ask the contract what to write and where, follow the canonical example, then prove the change stayed inside the architecture. Use for any new use case, aggregate, value object, command, query, route or cross-context reaction.
---

# Adding a feature

This repository's architecture is data, not prose: `conventions/architecture.yaml` and
`conventions/concepts.yaml` are the source of truth, and `yarn architecture` answers from them.
**Ask it instead of guessing.** Every command takes `--json` (a `schemaVersion`, a structured
error, a non-zero exit on an unknown id), so the answers can be parsed.

Nothing here replaces `CLAUDE.md` — read it first. This is the order of operations.

## 1. Find out what exists

```bash
yarn architecture inspect          # contexts, trees, layers, how much of everything
yarn architecture concepts         # every concept, with the file that shows it
```

A project with no contexts yet needs its first one declared in `conventions/architecture.yaml`
before any import rule applies to it: `yarn architecture checklist context` says what it is
made of.

## 2. Ask for the shape before writing it

```bash
yarn architecture checklist <aggregate|value-object|domain-service|command|query|context|…>
yarn architecture place <kind>     # the path alone
yarn architecture verb <read|create|act|create-under|replace|replace-part|change-part|remove>
```

The checklist names the **concept whose canonical file shows it**. Open that file and follow
it. Do not invent a second shape for something that already has one — if a concept has a
canonical example, the right move is to copy it, not to improve on it.

Before writing any import that crosses a boundary, ask:

```bash
yarn architecture can-import <file> <specifier> [<file> <specifier> …]
```

It asks the real linter and names the rule that refuses. Several pairs in one call check a
whole planned layout at once; it exits non-zero if any pair is refused.

## 3. Write a plan when the change is worth stating first

```bash
yarn architecture plan validate conventions/plans/<name>.yaml
yarn architecture plan explain  conventions/plans/<name>.yaml
```

`validate` refuses an undeclared context, an unknown kind, a route whose method contradicts its
intent, a cross-context strategy that is neither an integration event nor an owned port, and
anything marked new where something already exists. `explain` expands the plan into the files
to write, with each checklist's placeholders filled with the plan's own names, the canonical
examples to copy, and the rules the work is bound by. It generates no code.

A plan is optional for a small change and worth it for anything that crosses a boundary.

## 4. Write it, following the canonical example

Domain first: the rule goes in the aggregate, which records the event. Then the handler, then
infrastructure only if a port changed, then the route, then the wiring. `CLAUDE.md` has the
step-by-step and answers the questions that come up (where the spec goes, whether an event
needs a handler, which verb, how to compare things in a spec).

## 5. Prove it

A feature is written **inside** the architecture, never around it:

```bash
yarn architecture mode feature --base <ref>     # or --base working for uncommitted work
```

This refuses any change to the building blocks, the shared kernel, the conventions, the
decisions or the tools. The integration events are the exception — publishing a fact is what a
cross-context feature does.

Then the six checks, all of which must pass:

```bash
yarn check:conventions && yarn format:check && yarn lint && yarn typecheck \
  && yarn test:units && yarn test:e2e
```

## If you need to change a protected tree, stop

If the work seems to need a building block, the shared kernel's model or the dependency table
changed, **that is the finding, and it is worth more than the workaround.** Say what you
needed and why, and stop. It is not a feature any more: it is an architecture change, which
runs under `yarn architecture mode architecture` and owes a decision record in `docs/adr`.

Never fix a boundary violation with an `eslint-disable` — the conventions check refuses one
anyway. Fix it with a port, an integration event, or a move.
