# Conventions

The architecture of this repository, written as data so that tooling can hold the code to it — in every language the reference is written in. The contract is cut along one line: what is true in every language is in two files that name no file of any language; what one language owns is in its **binding** ([ADR 11](../docs/adr/0011-one-reference-several-languages.md)).

| File | What it holds | Who reads it |
|---|---|---|
| [`architecture.yaml`](architecture.yaml) | the contract: the layers and which may import from which, every rule under its stable id, the HTTP verbs, the kinds of thing a feature is made of, the two modes, and the list of `languages` | every language's import linter and conventions check; `yarn architecture` |
| [`concepts.yaml`](concepts.yaml) | the vocabulary: every concept the documentation teaches, with its rules and its decisions; plus the words | the root README's map, each language's map |
| [`domain.yaml`](domain.yaml) | the domain: the subdomains and their kind, each context's purpose and ubiquitous language, the context map (every relationship between two contexts, upstream first, with its patterns, its mechanism and why) and the shared kernel; names no file, and never the contracts a relationship carries, which are read from the code ([ADR 19](../docs/adr/0019-the-domain-is-data.md)) | the root README's strategic view; `yarn architecture domain`, `context <id>`; `yarn check:conventions`, which holds the map to the code both ways |
| [`typescript.yaml`](typescript.yaml) | the TypeScript binding: the contexts, the trees and their aliases, the wiring file, the libraries, what holds each enforcement word there, the checks, what the modes protect, what a new thing of each kind is made of, the file that shows each concept and each rule, the test styles, where each word is shown | [`eslint.config.js`](../typescript/eslint.config.js), which turns the contract and the binding into import rules; [`tools/src/check.ts`](../tools/src/check.ts), which checks the tree has the shape they describe |
| [`rust.yaml`](rust.yaml) | the Rust binding: the same sections for Rust — a crate per layer under `src/`, the contexts, the wiring crate, the libraries, what holds each enforcement word, the file that shows each concept and each rule | [`tools/conventions`](../rust/tools/conventions), which checks every `use` against the table and the tree against the contract |
| [`go.yaml`](go.yaml) | the Go binding: the same sections for Go — a package per layer, the contexts, the wiring file `module.go`, the libraries, what holds each enforcement word, the file that shows each concept and each rule | [`tools/conventions`](../go/tools/conventions), which checks every import against the table with `go/parser` and the tree against the contract |
| [`python.yaml`](python.yaml) | the Python binding: the same sections for Python — a package per layer under `src/`, the contexts, the wiring file `module_local.py`, the libraries, what holds each enforcement word, the file that shows each concept and each rule | [`tools/conventions.py`](../python/tools/conventions.py), which checks every `import` against the table and the tree against the contract |
| [`plans/`](plans) | feature plans, each written for one language, validated on every build | `yarn architecture plan` |
| [`storms/`](storms) | expected storms: what a facilitated event-storming session decided a feature adds, as a delta in the inventory's words (one file for every language), with its hot spots and their decisions; held to the code on every build ([ADR 22](../docs/adr/0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)) | `yarn architecture storm validate\|--expect`; the `storm` skill |

```bash
# at the root (`yarn install` once); from a language's directory, `yarn --cwd .. …` answers for that language
yarn check:conventions    # in CI: the contract and every binding are sound, the tree matches, the documents are rendered from them, every doc link resolves
yarn conventions:write    # regenerate the rendered blocks after editing any of the files
yarn architecture …       # ask the contract: inspect, rules, concepts, rule <ID>, concept <id>, can-import <file> <specifier>; --json for tools
yarn architecture create <dir> [--language <id>]   # a new application with this architecture and none of this business
```

The contract, the concepts and every binding carry a `schemaVersion`; [`tools/`](../tools/README.md), the root package (`clean-ddd` on npm), loads the contract, the concepts and one binding into one typed contract, validates it and answers the questions above. It reads any binding, because a binding is data: the root README's map across languages is rendered by it. Every rule has a stable id (`ARCH-*` dependencies and layout, `DOMAIN-*`, `EVENT-*`, `QUERY-*`, `CTX-*`, `CONC-*`), a reason, a remediation and an `enforcement` (`linter`, `check`, `types`, `tests`, `review`, `evaluations`) — `review` being the honest word for a rule that people and agents apply and no tool checks yet. The binding's `enforcers` says which tool stands behind each word in its language; ESLint refusals start with the rule id.

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

### The domain map

[`domain.yaml`](domain.yaml) is the strategic design as data, cut along the same line as the contract: it declares what the code cannot say — which subdomain is the core and why, what a context is for and the words it speaks, which pattern a relationship between two contexts follows and why it exists — and nothing the code already says. The mechanism of a relationship is one of the two contracts CTX-CONTRACTS allows (`integration-event`, `owned-port`); its patterns come from a closed vocabulary (`published-language`, `open-host-service`, `customer-supplier`, `conformist`, `anti-corruption-layer`), and the tooling knows which patterns each mechanism can carry. The contracts a relationship carries — which integration events, which port — are read from the TypeScript tree and rendered next to it.

`yarn check:conventions` holds the map to the bindings (the same contexts, each in exactly one subdomain) and to the code both ways (CTX-MAP-DECLARED): a declared relationship nothing carries fails, and a link in the code between two contexts that no relationship declares fails — a new relationship is a decision, and the check makes it one that is written down first. `plan validate` refuses a plan that crosses an undeclared pair for the same reason. A repository without the file (an application just created) has no map yet, and the check and the documents skip it.

```bash
yarn architecture domain          # the subdomains, the context map with its contracts, the shared kernel
yarn architecture context Notes   # one context: purpose, language, what it depends on, who depends on it
yarn architecture storm [Notes]   # the event storm read from the code; --markdown, --svg (the board), --json
```

The **event storm** goes one level down, inside each context, and is read from the code rather than declared ([ADR 20](../docs/adr/0020-the-event-storm-is-read-from-the-code.md)): the commands and queries of the wiring, the behaviours a handler asks and the events they record, the policies and what they publish or dispatch, the read models, the external systems behind the ports, the actors from the guards, the routes from the controllers. `yarn conventions:write` renders it into [`docs/event-storm.md`](../docs/event-storm.md) and the board [`docs/event-storm.svg`](../docs/event-storm.svg); the check fails when either differs from the code.

### The inventory: one application in every language

The same reading, reduced to the words every language shares — per context the commands (who may call, the route, the aggregate, the events recorded), the queries, the domain events, the policies (what they react to, what they publish or reach) and the links between contexts — is the **inventory**. Every language's conventions tool writes its own from its own tree, in canonical JSON, under [`docs/inventory/`](../docs/inventory/README.md) (`yarn conventions:write`, `cargo run -p conventions -- inventory --write`, `uv run python -m tools.conventions inventory --write`, `go run ./tools/conventions inventory --write`); each check refuses a stale one, and `yarn check:conventions` compares every committed inventory to the TypeScript one and names each difference (ARCH-ONE-APPLICATION, [ADR 21](../docs/adr/0021-one-application-every-language-writes-the-same-inventory.md)). `yarn architecture inventory` prints it; `yarn architecture inventory rust` says where the Rust one differs.

### Feature plans

A **plan** ([`plans/share-a-note.yaml`](plans/share-a-note.yaml)) is what someone intends to change, written before writing it: the language it is written for, the context, the changes by kind and name, the invariants it adds, the events it records, how it crosses a context boundary if it does, and whether it means to touch the protected trees. `yarn architecture plan validate <file>` answers whether that shape is legal against the contract *and* against the tree; `plan explain <file>` expands it into the files, with the checklists' placeholders filled with the plan's own names, the canonical examples and the rules it is bound by.

A plan generates no code and is not a source of truth — the code is. Every plan under `plans/` is validated by `yarn check:conventions`, against the binding it names, so the examples cannot rot. While the work is only planned, its changes carry no `new:` line and the check confirms that none of it exists yet; once the work is done, the same entries say `new: false` and the check confirms that each part is where the plan said it would be. A plan kept in the repository is therefore edited once, at the end — and that is what makes it a test rather than a note.

### Expected storms

An **expected storm** ([`storms/share-a-note.yaml`](storms/share-a-note.yaml) is the carried example, [`storms/pin-a-note.yaml`](storms/pin-a-note.yaml) a planned one) is what an event-storming session decided a feature adds, written before the code: a *delta* in the inventory's words — per context the commands (actor, route with `{param}`, aggregate, events), the queries, the events, the policies and what they publish or reach; the links the feature uses — plus the hot spots the session raised and how each was decided, and `done`. One file is true for every language. The [`storm` skill](../.claude/skills/storm/SKILL.md) facilitates the session and writes it.

```bash
yarn architecture storm validate <file>     # the contract, the map and the code: a declared context, a verb of the grammar, an actor of the three, an event brought or existing, a pivot the map relates; done and carried, or not yet
yarn architecture storm --expect <file>     # what the code still owes the storm (before), nothing (after), what the storm reshapes; --markdown, --svg lay the planned stickies on the board, dashed
```

Every storm under `storms/` is held by `yarn check:conventions`: one `done` must be carried by the code, one not done must not be yet, and a done storm has no open hot spot. A difference is closed in the code or brought back to the session; the storm is never edited to pass. A feature may bring its storm, as it may bring its plan.

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

`yarn architecture create <dir> [--name <app>] [--language <id>]` makes a new project with this architecture and none of this business, in any language of the reference (what it copies and writes is the `create` section of the language's binding). It copies what exists — `src/Architecture` with its specs, the shared kernel's model, `tools/`, the TypeScript, Jest, ESLint and Prettier configuration, the agent loop — and renders the new `README.md`, `CLAUDE.md` and `conventions/` from the contract: the contract and the concepts whole, the binding with `root: .` and `contexts` emptied, every reference to a file it did not copy removed and every dead Markdown link turned back into plain text. The new project is a repository of one language, with the contract, the binding and the code in one directory. The rule that keeps it honest is that **it templates nothing**: there is no second copy of a building block and no second wording of a rule to drift, and the tooling's own specs stay behind because they assert on *this* repository's contract.
