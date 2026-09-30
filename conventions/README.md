# Conventions

The architecture of this repository, written as data so that tooling can hold the code to it, and so that another project — in another language — can start from the same table instead of from prose.

| File | What it holds | Who reads it |
|---|---|---|
| [`architecture.yaml`](architecture.yaml) | the contexts, the layers, and which layer may import from which | [`eslint.config.js`](../eslint.config.js) turns it into import rules, one per context and per layer; [`check-conventions.ts`](../tools/check-conventions.ts) checks the tree has that shape |
| [`concepts.yaml`](concepts.yaml) | every concept the README teaches: its canonical files, the rules that govern it, the decisions that explain it; plus the vocabulary | [`check-conventions.ts`](../tools/check-conventions.ts) checks every file and rule exists and renders the README's map tables from it |

```bash
yarn check:conventions    # in CI: the contract is sound, the tree matches it, README and CLAUDE.md are rendered from it, every doc link resolves
yarn conventions:write    # regenerate the rendered blocks after editing either file
yarn architecture …       # ask the contract: inspect, rules, concepts, rule <ID>, concept <id>, can-import <file> <specifier>; --json for tools
```

Both files carry a `schemaVersion`; [`tools/architecture-contract`](../tools/architecture-contract) loads them into one typed contract, validates it and answers the questions above. Every rule has a stable id (`ARCH-*` dependencies and layout, `DOMAIN-*`, `EVENT-*`, `QUERY-*`, `CTX-*`, `CONC-*`), a reason, a remediation and an `enforcement` (`eslint`, `check`, `types`, `tests`, `review`, `evaluations`) — `review` being the honest word for a rule that people and agents apply and no tool checks yet. ESLint refusals start with the rule id.

## How the rules are written

`architecture.yaml` says what a layer **may** import, in eight words: `own.<Layer>`, `own.wiring`, `architecture.<Layer>` (the building blocks), `kernel.<Layer>` (the shared kernel), `others.<Layer>`, `others.wiring`, `bootstrap`, `libraries`. Anything not listed is forbidden. The linter needs the complement, so `eslint.config.js` enumerates every unit a file could import and forbids the ones the table leaves out; the two formulations are checked equal by construction, not by hand.

Writing the allow-list rather than the deny-list is deliberate: a new layer, context or library is forbidden everywhere until the table says otherwise.

## Adding to it

- **A new context**: add it to `contexts` in `architecture.yaml`. Until you do, `yarn check:conventions` fails, because no import rule would apply to it.
- **A new concept file worth pointing at**: add a row to `concepts.yaml`, run `yarn conventions:write`. If a concept already has its canonical file, point to it rather than adding a second example.
- **A new infrastructure library**: add it to `libraries`, so the domain and the use cases are kept from importing it.
- **A new rule** about what may import what: change the table, run `yarn lint`, and fix the code the new rule refuses. Never the other way round: an `eslint-disable` is a violation with a comment.

## What the contract answers

Beyond the rules and the concepts, `architecture.yaml` holds two tables that used to live only in prose, both asked for by the first agent that worked with the contract ([record](../docs/evaluations/2026-09-29-bookmarks.md)):

- **`http.verbs`** — which verb and path shape a use case takes, by intent (`read`, `create`, `act`, `create-under`, `replace`, `replace-part`, `change-part`, `remove`, and the one exception), each with an example route: `yarn architecture verb remove`.
- **`checklists`** — what a new aggregate, value object, domain service, command, query or context is made of, and where it goes: `yarn architecture checklist aggregate`, or `yarn architecture place domain-service` for the path alone. Each names the concept whose canonical file shows it, and the check refuses a checklist naming a concept that does not exist.

`can-import` takes several pairs in one call (`can-import <file> <specifier> <file> <specifier> …`), on one ESLint instance, so a planned layout is checked in a single command; it exits non-zero if any pair is refused.

### Feature plans

A **plan** ([`plans/share-a-note.yaml`](plans/share-a-note.yaml)) is what someone intends to change, written before writing it: the context, the changes by kind and name, the invariants it adds, the events it records, how it crosses a context boundary if it does, and whether it means to touch the protected trees. `yarn architecture plan validate <file>` answers whether that shape is legal against the contract *and* against the tree; `plan explain <file>` expands it into the files, with the checklists' placeholders filled with the plan's own names, the canonical examples and the rules it is bound by.

A plan generates no code and is not a source of truth — the code is. Every plan under `plans/` is validated by `yarn check:conventions`, so the examples cannot rot. While the work is only planned, its changes carry no `new:` line and the check confirms that none of it exists yet; once the work is done, the same entries say `new: false` and the check confirms that each part is where the plan said it would be. A plan kept in the repository is therefore edited once, at the end — and that is what makes it a test rather than a note.

### Modes

`architecture.yaml` also holds the two **modes** a change can be made in ([ADR 9](../docs/adr/0009-work-is-done-in-one-of-two-modes.md)), checked against a diff rather than the tree:

```bash
yarn architecture mode feature                  # refuses any change to the protected trees
yarn architecture mode architecture             # allows them, asks for the ADR that explains them
yarn architecture mode feature --base working   # what is uncommitted right now
```

The plan validator reads the same lists, so a plan's `architectureChanges` and the feature mode cannot drift apart. Neither mode is a CI gate — the maintainer changes the architecture on purpose, and a gate they must fight is a gate they will remove.

Still deliberately absent: anything that writes code.

## Using it elsewhere

`architecture.yaml` names no TypeScript. In another stack, keep the table and swap the enforcer: ArchUnit (JVM), deptrac (PHP), import-linter (Python), dependency-cruiser (JS), `go vet` with depguard (Go). `concepts.yaml` is the reading list: rewrite its paths to point at your files and keep its vocabulary, which is the part that does not depend on the language.
