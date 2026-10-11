# Conventions

The architecture of this repository, written as data so that tooling can hold the code to it — in every language the reference is written in. The contract is cut along one line: what is true in every language is in two files that name no file of any language; what one language owns is in its **binding** ([ADR 11](../docs/adr/0011-one-reference-several-languages.md)).

| File | What it holds | Who reads it |
|---|---|---|
| [`architecture.yaml`](architecture.yaml) | the contract: the layers and which may import from which, every rule under its stable id, the HTTP verbs, the kinds of thing a feature is made of, the two modes, and the list of `languages` | every language's import linter and conventions check; `yarn architecture` |
| [`concepts.yaml`](concepts.yaml) | the vocabulary: every concept the documentation teaches, with its rules and its decisions; plus the words | the root README's map, each language's map |
| [`typescript.yaml`](typescript.yaml) | the TypeScript binding: the contexts, the trees and their aliases, the wiring file, the libraries, what holds each enforcement word there, the checks, what the modes protect, what a new thing of each kind is made of, the file that shows each concept and each rule, the test styles, where each word is shown | [`eslint.config.js`](../typescript/eslint.config.js), which turns the contract and the binding into import rules; [`check-conventions.ts`](../typescript/tools/check-conventions.ts), which checks the tree has the shape they describe |
| [`plans/`](plans) | feature plans, each written for one language, validated on every build | `yarn architecture plan` |

```bash
cd typescript
yarn check:conventions    # in CI: the contract and every binding are sound, the tree matches, the documents are rendered from them, every doc link resolves
yarn conventions:write    # regenerate the rendered blocks after editing any of the files
yarn architecture …       # ask the contract: inspect, rules, concepts, rule <ID>, concept <id>, can-import <file> <specifier>; --json for tools
yarn architecture create <dir>   # a new application with this architecture and none of this business
```

All three files carry a `schemaVersion`; [`typescript/tools/architecture-contract`](../typescript/tools/architecture-contract) loads the contract, the concepts and one binding into one typed contract, validates it and answers the questions above. It reads any binding, because a binding is data: the root README's map across languages is rendered by it. Every rule has a stable id (`ARCH-*` dependencies and layout, `DOMAIN-*`, `EVENT-*`, `QUERY-*`, `CTX-*`, `CONC-*`), a reason, a remediation and an `enforcement` (`linter`, `check`, `types`, `tests`, `review`, `evaluations`) — `review` being the honest word for a rule that people and agents apply and no tool checks yet. The binding's `enforcers` says which tool stands behind each word in its language; ESLint refusals start with the rule id.

## Paths

A binding's paths are written relative to its own directory (`src/Contexts/Notes/…` in `typescript.yaml`), because that is where its author stands; the loader prefixes them with the binding's `root`, so that a loaded contract, a tool's output, a document's link and a `git diff` all speak repository-relative paths (`typescript/src/Contexts/Notes/…`). The contract's and the concepts' own references point into `docs/` and `conventions/`, from the repository root. A document rendered from the contract gets its links relative to where it lives.

## How the rules are written

`architecture.yaml` says what a layer **may** import, in eight words: `own.<Layer>`, `own.wiring`, `architecture.<Layer>` (the building blocks), `kernel.<Layer>` (the shared kernel), `others.<Layer>`, `others.wiring`, `bootstrap`, `libraries`. Anything not listed is forbidden. The binding says what those words name in its language: the aliases of the trees, the wiring file, the libraries. The linter needs the complement, so `eslint.config.js` enumerates every unit a file could import and forbids the ones the table leaves out. That translation is where a mistake would hide, so `yarn check:conventions` asks the linter about it: it generates a probe for every row of the table — every tree, every layer, every unit, in both directions — and fails if the answer is not the one the table gives, or if a refusal does not name its rule. The probes are derived from the contract, so a new context is covered the day it is declared and a project with no contexts probes only what it has.

Writing the allow-list rather than the deny-list is deliberate: a new layer, context or library is forbidden everywhere until the table says otherwise.

## Adding to it

- **A new context**: add it to `contexts` in the language's binding. Until you do, `yarn check:conventions` fails, because no import rule would apply to it.
- **A new concept file worth pointing at**: add it under `concepts` in the binding, run `yarn conventions:write`. If a concept already has its canonical file, point to it rather than adding a second example. A new *concept* — a new row of the vocabulary — goes in `concepts.yaml`, and each binding then names the file that shows it, or leaves a gap the map shows.
- **A new infrastructure library**: add it to `libraries` in the binding, so the domain and the use cases are kept from importing it.
- **A new rule** about what may import what: change the table in `architecture.yaml`, run `yarn lint`, and fix the code the new rule refuses. Never the other way round: an `eslint-disable` is a violation with a comment. A rule goes in the contract and in no binding: a binding that carries one fails the check (ARCH-ONE-CONTRACT).
- **A new language**: a binding listed under `languages`, with its own linter and check; the recipe is in the [root README](../README.md#adding-a-language).

## What the contract answers

Beyond the rules and the concepts, the contract holds two tables that used to live only in prose, both asked for by the first agent that worked with it ([record](../docs/evaluations/2026-09-29-bookmarks.md)):

- **`http.verbs`** — which verb and path shape a use case takes, by intent (`read`, `create`, `act`, `create-under`, `replace`, `replace-part`, `change-part`, `remove`, and the one exception); the binding names the routes file that shows each: `yarn architecture verb remove`.
- **`checklists`** — the kinds of thing a feature is made of, each pointing at the concept that shows it; the binding says, for each kind, where it goes and what it is made of in its language: `yarn architecture checklist aggregate`, or `yarn architecture place domain-service` for the path alone. The check refuses a checklist naming a concept that does not exist, and a binding checklist for a kind the contract does not have.

`can-import` takes several pairs in one call (`can-import <file> <specifier> <file> <specifier> …`), on one ESLint instance, so a planned layout is checked in a single command; it exits non-zero if any pair is refused. A path typed on the command line is read from where it was typed, so `src/…` from `typescript/` and `typescript/src/…` from the root name the same file.

### Feature plans

A **plan** ([`plans/share-a-note.yaml`](plans/share-a-note.yaml)) is what someone intends to change, written before writing it: the language it is written for, the context, the changes by kind and name, the invariants it adds, the events it records, how it crosses a context boundary if it does, and whether it means to touch the protected trees. `yarn architecture plan validate <file>` answers whether that shape is legal against the contract *and* against the tree; `plan explain <file>` expands it into the files, with the checklists' placeholders filled with the plan's own names, the canonical examples and the rules it is bound by.

A plan generates no code and is not a source of truth — the code is. Every plan under `plans/` is validated by `yarn check:conventions`, against the binding it names, so the examples cannot rot. While the work is only planned, its changes carry no `new:` line and the check confirms that none of it exists yet; once the work is done, the same entries say `new: false` and the check confirms that each part is where the plan said it would be. A plan kept in the repository is therefore edited once, at the end — and that is what makes it a test rather than a note.

### Modes

`architecture.yaml` also holds the two **modes** a change can be made in ([ADR 9](../docs/adr/0009-work-is-done-in-one-of-two-modes.md)), checked against a diff rather than the tree. The contract protects what every language shares — the conventions and the decisions; the binding adds what the language owns — its building blocks, its shared kernel, its linter configuration and its tools:

```bash
yarn architecture mode feature                  # refuses any change to the protected trees
yarn architecture mode architecture             # allows them, asks for the ADR that explains them
yarn architecture mode feature --base working   # what is uncommitted right now
```

The plan validator reads the same lists, so a plan's `architectureChanges` and the feature mode cannot drift apart. Neither mode is a CI gate — the maintainer changes the architecture on purpose, and a gate they must fight is a gate they will remove.

Still deliberately absent: anything that writes code.

### Working here with an agent

The contract is a machine interface: every command takes `--json` — valid JSON only, a `schemaVersion`, a structured error and a non-zero exit — so an agent can ask what to write and where instead of guessing, and can check a planned import before writing it. That is the whole integration; there is no server and no plugin, because a second interface to the same data is a second thing to drift.

Two files make the loop the default rather than something an agent has to notice:

| File | What it is |
|---|---|
| [`.claude/skills/feature/SKILL.md`](../.claude/skills/feature/SKILL.md) | the order of operations for adding a feature: ask the contract for the shape, follow the canonical example the checklist names, prove the change with `mode feature` and the six checks |
| [`.claude/agents/feature-author.md`](../.claude/agents/feature-author.md) | a subagent bound to the feature mode, which reports what it needed instead of working around it |

Both name commands rather than files, so they stay true in a project generated from this one, and `yarn architecture create` copies them. The agent definition's instruction to stop rather than widen a rule is the important half: an agent that says "I needed to change the dependency table, and here is why" has found something, and an agent that quietly adds an `eslint-disable` has hidden it.

The feedback loop is [`docs/evaluations`](../docs/evaluations/README.md): a fresh agent is handed a small feature, graded on whether it lands the right shape, and every guess in its report becomes a sentence missing from the guide.

### Starting an application from it

`yarn architecture create <dir> [--name <app>]` makes a new project with this architecture and none of this business. It copies what exists — `src/Architecture` with its specs, the shared kernel's model, `tools/`, the TypeScript, Jest, ESLint and Prettier configuration, the agent loop — and renders the new `README.md`, `CLAUDE.md` and `conventions/` from the contract: the contract and the concepts whole, the binding with `root: .` and `contexts` emptied, every reference to a file it did not copy removed and every dead Markdown link turned back into plain text. The new project is a repository of one language, with the contract, the binding and the code in one directory. The rule that keeps it honest is that **it templates nothing**: there is no second copy of a building block and no second wording of a rule to drift, and the tooling's own specs stay behind because they assert on *this* repository's contract.
