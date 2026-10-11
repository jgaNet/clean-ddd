# 11. One reference, several languages: a shared contract, a binding per language

## Context

The reference was written in TypeScript, and its README said so in its title. The architecture it teaches is not TypeScript's: the layers, the rule that a refusal is a value and not a throw, the way two contexts talk, the version an aggregate carries — none of that is about a language, and the first comment of `conventions/architecture.yaml` already said "in another stack, feed it to your own dependency linter and keep the same table". A second implementation, in Rust, was the first real test of that sentence, and it had three possible shapes.

**A branch per language** was ruled out first. Branches are for work in progress, not for parallel products: the decisions, the contract and the text of the rules would diverge in silence, a change to a rule could never touch both languages in one commit, and `main` would stop meaning anything.

**A repository per language** is the honest second choice, and becomes the right one the day a language has its own maintainers and its own pace. Today it would mean two copies of the contract and of the decisions, kept equal by discipline — which is the drift ADR 10 was written against. Splitting a monorepo later is a move (`git subtree split` keeps the history); merging two repositories later is a rewrite.

**A monorepo** keeps one contract and one set of decisions, but only if the contract is actually shared. It was not: `architecture.yaml` mixed what is true in every language (the layers, the table, the rules, the HTTP grammar) with what is TypeScript's (the aliases, `module.local.ts`, the libraries, the paths of the files that show each rule, the checklists written in `.ts`), and `concepts.yaml` named a `.ts` file on every row. A monorepo around that file would have been a TypeScript repository with a Rust directory in it.

## Decision

The reference is **one repository, one architecture, several languages**, and the contract is cut along the line between what every language shares and what one language owns.

- **`conventions/architecture.yaml` is the contract**: the layers and what each may import, the rules under their stable ids, the HTTP grammar, the kinds of thing a feature is made of, the two modes. It names no file, no alias, no linter and no tool, and the conventions check refuses a file reference in it. Its enforcement words are neutral (`linter`, not `eslint`).
- **`conventions/concepts.yaml` is the vocabulary**: every concept, its rules, its decisions, its description. It names no file either.
- **`conventions/<language>.yaml` is a binding**, one per entry of `languages`: where that language keeps its trees and how they are imported, which contexts it has, which tool holds each enforcement word, which checks a change must pass, what the modes protect there, what a new thing of each kind is made of in its idiom, and which of its files shows each concept and each rule. A binding may point at a rule and never add, reword or weaken one: **a language never carries a rule of its own** (ARCH-ONE-CONTRACT, which this record introduces).
- **Each language is a directory** (`typescript/`, then `rust/`) holding its code, its toolchain, its configuration, its README and its CLAUDE.md. The root holds what is shared: the contract, the concepts, the bindings, the decisions, the evaluation protocol, the agent loop, and a README whose map is **concept × language**, with a dash where a language does not show a concept yet.
- **Paths are repository-relative everywhere.** A binding writes its paths relative to its own directory, because that is where its author stands; the loader prefixes them, so that a tool's output, a document's link and a `git diff` all name `typescript/src/…`. A document rendered from the contract gets its links relative to where it lives, which is how the same cell is right in the root README and in a language's.
- **The TypeScript tooling is the reference tooling for the contract.** It reads any binding, because a binding is data: `yarn architecture rule`, `concept`, `plan validate` and the map work for every language listed. What stays TypeScript's is what needs TypeScript to answer: `can-import` and the probes ask ESLint. Another language brings its own linter and its own conventions check, generated from the same table.

The commands a language offers are its own (`yarn …` here, `cargo …` there) and run from its directory; the root has no package manifest and no meta build, on purpose.

## Consequences

- The move itself was mechanical and wide: every file of the TypeScript implementation changed path, every path in the contract was re-rooted, and the tooling learned it has two roots — the repository's, where the contract and the shared documents live, and the language's, where the code is. Fixing a building block still fixes one place; rewording a rule still rewords it everywhere, and now in every language's documents.
- The map makes the state of each language honest and visible. A port in progress is a column with dashes, not a claim in a README; the check holds every binding to the files it names, so a dash can never be a lie by omission.
- A rule's text had to lose its TypeScript spelling (`IResult<T>`, `@Architecture`, `eslint-disable`) to be the contract's. Where the spelling helps a TypeScript reader, it lives in that language's guide and checklists, which is where a reader of that language looks.
- Another language's idiom will not be a one-to-one transposition. Rust has no class to inherit `AggregateRoot` from and no exception to throw; its layers can be crates whose `[dependencies]` *are* the table, held by the compiler rather than a linter. That is the point of the split: the contract says what a layer may depend on; the binding says what a layer is in that language, and `enforcers` says who holds the rule. "Same shape" means the same concepts under the same rules, not the same file tree.
- `yarn architecture create` still produces a repository of one language, with the contract, the binding and the code in one directory: that is the shape the tooling takes when a binding's `root` is `.`, and the generated project passes its own checks on the first run as before.
- CI runs one job per language, each from its directory. There is no path filter: a change to the contract or to a shared document must run every language's check, and the TypeScript job is cheap enough to always run.
- The version is the repository's: the reference is one thing, rendered in several languages. A language that lags shows it in the map, not in a version number.

## When to revisit

If a binding ever needs a field that is really a rule — a `may_import` of its own, an exception to a row of the table — the split has failed for that language, and the question is whether the contract is wrong or the language is not implementing this architecture. If a language grows its own maintainers and its own release cadence, that is the day for the second shape: a repository of its own, which the directory layout and the binding make a move rather than a rewrite.
