# 23. The tooling lives at the root and ships as a package

## Context

The tooling that reads the architecture — the contract API, the CLI, the conventions check, the readers of the domain, the storm and the inventory — was written in TypeScript and lived in `typescript/tools/`, as the TypeScript language's own. ADR 11 made it the reference tooling for every language, because a binding is data and the loader reads any of them; every guide then said `cd typescript` or `yarn --cwd ../typescript architecture …` before asking the contract from Rust, Python or Go, and the root guide forbade a root `package.json`, so that each language's toolchain stayed its own.

That placement had stopped matching what the tooling was. It rendered every language's README, held the four inventories equal, validated the storms and the domain map for the whole repository, and was the one thing a newcomer typed in every language's directory. It was repository tooling filed under one language. And it could not be used anywhere else: `yarn architecture create` copied the tooling into the new application, so each created application carried a snapshot of it that drifted from the next fix (ADR 10 noted the cost).

## Decision

**The tooling is one package at the root, `clean-ddd`, driven by yarn, built with esbuild and published to npm; every language's directory and any repository that holds a `conventions/` directory uses the same commands.**

- **At the root**: `package.json` names the package, `tools/src/` holds the modules and their specs, `yarn architecture`, `yarn check:conventions` and `yarn conventions:write` run from the root, and the CI job `tools` runs the check for the whole repository, the specs, the lint, the build and a dry pack. `typescript/` keeps the three scripts as delegations to the root, so the loop its guide teaches is unchanged, and the other languages' guides say `yarn --cwd .. architecture …`, which answers for the language the command was typed in.
- **One root, found from where the command is typed**: the repository root is the nearest directory at or above the current one that holds `conventions/`. The tooling no longer knows where it lives; it knows where it was asked. A language's directory is what its binding's `root` says.
- **A language's linter stays the language's**: `can-import` and the probes of the check load ESLint from the language's directory at run time, never from the package, so what the build runs is what answers; a language without one is told to install it. The readers that walk a tree (links, storm, inventory) remain written for the TypeScript tree, as ADR 11 said; the other languages' tools write their own inventory.
- **Published**: `tools/build.mjs` bundles the CLI and the API, emits the declarations, and copies into the package the files `create` needs — the building blocks, the shared kernel's model, the configuration, the contract — from this repository at build time. A created application depends on `clean-ddd` and copies no tooling; `yarn upgrade clean-ddd` is how it follows. A tag `v<version>` runs `publish.yml`, which publishes with provenance under a token or npm's trusted publishing.
- **The feature mode protects `tools/`** in the contract, as it protected `typescript/tools` in the binding: a feature does not change the thing that holds it.

## Consequences

- The root holds data, prose and the tool that reads them. The root guide's "no root `package.json`, no meta build" is lifted for this one package and stands for everything else: the languages' toolchains are untouched, the root installs nothing of theirs, and nothing at the root builds a language.
- The guides lose a detour: `cd typescript` before asking the contract is gone, and the words `yarn --cwd ../typescript` with it. The TypeScript guide's commands are unchanged in form.
- A reader of the published package gets the CLI, the API and `create`, with the same `--json` interface the agents here use. What it cannot do outside this repository is read a Rust, Python or Go tree, which those languages' tools do.
- A second install: the root and `typescript/` each have a `node_modules`, and the check at the root needs the TypeScript one for the probes. CI installs both in the `tools` job; the guide says so.
- The references the TypeScript binding keeps to the files that show `ARCH-MAP-IS-REAL`, `CTX-MAP-DECLARED` and `ARCH-ONE-APPLICATION` now point outside its directory (`../tools/src/check.ts`), which the loader normalises; a binding may point at a file anywhere in the repository, and this is the first that does.

## When to revisit

If a second language's tooling could read the contract as well as this one does, the package stops being "the TypeScript tooling at the root" and becomes a specification both implement; the storm and the inventory readers would be the first to split by language. If the created applications stop being TypeScript ones, `create` needs a `--language`, and the package carries one reference per language.
