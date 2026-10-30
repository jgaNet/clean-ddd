# The tooling: `clean-ddd`

The architecture of this repository is data ([`conventions/`](../conventions/README.md)); this is the tool that reads it. One package at the root, written in TypeScript and published to npm as [`clean-ddd`](https://www.npmjs.com/package/clean-ddd), so that the same commands answer here, from any language's directory, and in any repository that holds a `conventions/` directory — an application `clean-ddd create` made, for one.

## Here

```bash
yarn install                        # once, at the root (Node ≥ 22; .nvmrc says 24)
yarn architecture <command>         # ask the contract, the domain, the storm, the inventory (below)
yarn check:conventions              # the conventions and the code agree, in every language and every document
yarn conventions:write              # regenerate what the check holds: the rendered blocks, the storm, the inventory
yarn test | lint | typecheck | format:check | build   # the tooling's own checks, as CI runs them
```

From a language's directory the same scripts answer for that language: `yarn --cwd .. architecture checklist command` typed in `rust/` answers in Rust, `--language go` names one explicitly. `typescript/` keeps `yarn architecture`, `yarn check:conventions` and `yarn conventions:write` as scripts that delegate here, so its guide's loop is unchanged.

## Anywhere

```bash
npx clean-ddd create my-app                     # a new TypeScript application on this architecture, with none of this business
cd my-app && yarn install
yarn check:conventions                          # = clean-ddd check: the contract is sound, the tree matches it, the documents are rendered from it
yarn architecture checklist context             # = clean-ddd checklist context

npx clean-ddd create my-app --language python   # the same, in Python: the building blocks, the shared kernel, the conventions tool
cd my-app && uv sync
uv run python -m tools.conventions && npx clean-ddd check   # the tree and the imports by the language's tool; the contract and the documents by this one

npx clean-ddd create my-app --language go       # the same, in Go: the module path is the application's name, in every import
cd my-app && go mod tidy
go run ./tools/conventions && npx clean-ddd check

npx clean-ddd create my-app --language rust     # the same, in Rust: a workspace of the copied crates
cd my-app && cargo build
cargo run -p conventions && npx clean-ddd check
```

What `create` copies and writes for a language is data in its binding (`create:` in `conventions/<language>.yaml`: the files copied as they are or under another name (`{ from, to }`), the folder the integration events go in, the manifest to rewrite, the dependencies to keep, the first commands); a language whose binding has no such section is refused with that sentence. Every language of the reference has one. The generated application depends on `clean-ddd` rather than carrying a copy of the tooling ([ADR 23](../docs/adr/0023-the-tooling-lives-at-the-root-and-ships-as-a-package.md)): `yarn upgrade clean-ddd` is how it keeps up. The package carries, beside the CLI, the files `create` copies — the building blocks, the shared kernel's model, the configuration, the contract — taken from this repository at build time, so a created application is the reference's own files, never a template. A created application starts with the Tracker — the context a client follows a command's `202` at, whose subdomain is generic — and the composition root that serves it, a file of the reference copied in place of the reference's own ([ADR 27](../docs/adr/0027-a-created-application-starts-with-the-tracker.md)); its context map (`conventions/domain.yaml`) describes the Tracker as the reference does, with a `conventions/storms/` directory beside it, so that the check holds the first relationship between two contexts to a declared decision (CTX-MAP-DECLARED) — in a TypeScript application against the tree, in another language against the links its own tool writes in the inventory ([RFC 0001](../docs/rfc/0001-architecture-aware-multi-agent-flow.md), question 1).

The API is the same module the CLI uses: `import { loadArchitectureContract, inspectEventStorm } from 'clean-ddd'`.

## The commands

```
clean-ddd inspect                 what the contract holds, for this language
clean-ddd rules | concepts | verbs | checklists      the lists
clean-ddd rule <ID>               one rule: statement, why, remediation, references, the file that shows it
clean-ddd concept <id>            one concept: canonical file, rules, decisions
clean-ddd verb <intent>           which HTTP verb and path shape a use case takes
clean-ddd checklist <kind>        what a new aggregate, value object, command … is made of; place <kind> for the path
clean-ddd can-import <file> <specifier> …   would the language's linter allow it, and which rule says
clean-ddd domain                  the subdomains and the context map, its contracts read from the code
clean-ddd context <id>            one bounded context: purpose, language, what it depends on, who depends on it
clean-ddd storm [<context>]       the event storm read from the code (--markdown, --svg for the board)
clean-ddd storm validate <file>   an expected storm, against the contract, the map and the code
clean-ddd storm --expect <file>   what the code still owes an expected storm; --markdown, --svg overlay the board
clean-ddd inventory [<language>]  what the tree says the application is; with a language, where its inventory differs
clean-ddd plan validate|explain <file>      a feature plan, before the code
clean-ddd mode feature|architecture [--base <ref>|--base working]   which rules this change is held to
clean-ddd gate [--base <ref>]      is this change done: the feature mode, the conventions check and the language's
                                  `checks`, one verdict; --json for a script, exit 1 when it fails
clean-ddd pack --plan <file>      one slice of a feature: what is its own to write, what another slice writes, the frozen
                                  contracts, the storm's part, the files that show each shape (from the bundled reference
                                  when the project has none yet); --json for a driver
clean-ddd create <dir> [--name <app>] [--language <id>]   a new application on this architecture, in that language
clean-ddd check [--write]         the conventions check; --write regenerates what it holds
```

Every command takes `--json` (valid JSON only, a structured error and exit 1 on an unknown id) and `--language <id>`. Paths are printed relative to the repository root — the nearest directory at or above where the command was typed that holds `conventions/` — and a path typed on the command line is read from where it was typed.

## The gate

`clean-ddd gate --base <ref>` is the completion contract of a feature ([RFC 0001](../docs/rfc/0001-architecture-aware-multi-agent-flow.md)): one verdict, as data, that whoever starts an agent reads instead of the agent's report. It runs the feature mode against the base — the changes committed since it and the ones not committed yet alike — then the conventions check, then the commands the language's binding lists under `checks`, in CI's order, in the language's directory. The steps that hold the architecture (the mode, the conventions check, the first of `checks`, which is the language's own) stop it when they fail; the quality and test steps after them all run, so one gate shows everything left to fix. It adds no check: every step is a command that already exists. `--json` prints the report (`verdict`, and per step its `stage`, `status`, duration and, on a failure, the lines to read).

## What is the tool's and what is a language's

The contract, the concepts, the domain map, the bindings, the plans and the storms are read by this package for every language, and the documents of every language are rendered by it. What it reads _from a tree_ — the links between contexts, the event storm, the inventory — it reads from the TypeScript tree, the reference's ([ADR 11](../docs/adr/0011-one-reference-several-languages.md)); Rust, Python and Go write their own inventory with their own tool, and `check` holds the four equal. The import rules are asked of each language's own linter: `can-import` and the probes of `check` load ESLint from the language's directory, never a copy of it, so install the language first (`cd typescript && yarn install`). For a language whose tree this package does not read (`check --language rust` here, or `check` in a Python application), the steps that walk a tree are left to that language's tool and the summary says so.

## Layout

```
package.json          the package: name, bin (clean-ddd → tools/dist/cli.js), scripts, dev dependencies; no runtime dependency
tools/src/            the modules, one per concern: load, query, render, plan, modes, create, probes, domain, storm,
                      inventory, storms, check; cli.ts dispatches; index.ts is the API; *.spec.ts beside each
tools/build.mjs       yarn build: two esbuild bundles (cli.js, index.js), the declarations, the reference for create
tools/dist/           the build, not committed
```

## Releasing

A release is a tag. `yarn version --new-version 0.2.0` writes the version and tags `v0.2.0`; `git push --follow-tags` runs [`publish.yml`](../.github/workflows/publish.yml), which checks that the tag is the version, runs the conventions check and the specs, builds, and publishes to npm with provenance. Two ways to be allowed to, tried in this order:

1. **A token**: a granular access token from npmjs.com (publish rights on `clean-ddd`, bypass 2FA) saved as the repository secret `NPM_TOKEN`. The first publish of a new name needs this one.
2. **Trusted publishing**, once the package exists: on npmjs.com, the package's settings → _Trusted publisher_ → GitHub Actions, repository `jgaNet/clean-ddd`, workflow `publish.yml`. No secret; the workflow's identity is the credential. Remove `NPM_TOKEN` afterwards and the workflow switches by itself.

Pre-1.0, a change to what the contract or a binding may say (`schemaVersion`) is a minor bump; everything else a patch.
