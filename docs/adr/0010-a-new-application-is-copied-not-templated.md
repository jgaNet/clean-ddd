# 10. A new application is copied from the reference, not templated

## Context

The point of this repository is to be read and then reused. Until now reuse meant copying files by hand: take `src/Architecture`, take the shared kernel, take `eslint.config.js` and the contract, delete the four contexts, fix what breaks. That works once, badly, and what is left behind — a half-deleted `Notes`, a concepts map naming files that no longer exist, a rule table nobody re-read — is worse than starting from nothing, because it looks authoritative.

The obvious answer is a scaffolder, and the obvious scaffolder is a template: a `templates/` directory of `.hbs` files, or a published package with its own copy of the building blocks. That is how this repository stops being true. A template is a second copy of the architecture, written in a second wording, and a month later the aggregate root in the template and the aggregate root in `src` differ in a way nobody chose. The same goes for the rules: the day the scaffolder has its own sentence for what the Domain layer may import, the contract has two sources of truth.

## Decision

`yarn architecture create <dir>` makes a new application, and it **copies what exists and generates the rest from the contract; it templates nothing**.

- **Copied verbatim** from the repository it runs in: `src/Architecture` with its specs, `src/SharedKernel/Domain`, the tooling, and the TypeScript, Jest, ESLint and Prettier configuration. Not a copy of them — them.
- **Generated from the contract**: the new `README.md`, `CLAUDE.md` and `conventions/`, rendered by the same functions that render this repository's own, with `contexts` emptied, every reference to a file that was not copied removed, every dead Markdown link turned back into plain text, and every concept whose canonical file is gone dropped.
- **Not given at all**: the business. No context, no composition root, no route. `src/Contexts` is an empty directory with a README, because copying someone else's domain is how a reference implementation becomes a framework.

The tooling's own specs stay behind: they assert that `Notes` is a context and that this repository's example plan validates, so elsewhere they would fail while saying nothing about the project. What the tools do for the new application is proved by its own `yarn check:conventions`.

The test of all this is that the generated project passes the same six checks — conventions, format, lint, types, unit, e2e — on its first run, with no edit.

## Consequences

- The scaffolder cannot drift from the reference, because there is nothing to drift: fixing a building block fixes what the next project gets, and rewording a rule rewords it everywhere.
- It also cannot outrun it. Anything a new project needs that this repository does not have must be added here first, which is the right pressure.
- Making the tooling portable forced one real change: `check-conventions.ts` carried a hand-written list of 37 import probes naming `src/Contexts/Notes`, which in another project proved nothing. The probes are now generated from the table — every tree, every layer, every unit, both directions — so a project with four contexts probes 1365 rows and a project with none probes its two trees. Coverage went up as a side effect of making it portable, which is usually the sign that the hardcoding was the bug.
- Nothing of this repository's business survives into a generated project, including where the vocabulary is only illustrative. The `http.verbs` table is the case that had to be decided: its URL shapes carry the reference's nouns (`GET /notes/:id`), and what the table teaches is the grammar — which verb a use case takes, and what the URL names. Keeping the nouns was tempting because the grammar is the point and a made-up noun would be a small fictional domain. The answer is a placeholder rather than a substitute: `GET /<things>/:id`, `POST /<things>/:id/<action>`, in the same idiom the checklists already use for `src/Contexts/<Context>/...`. "It is only an illustration" is not a reason for something to ride along.
- This repository now has a second audience with different needs: the reader and the starter. When the two conflict, the reader wins — the scaffolder is a way of reading it, not a product.

## When to revisit

If `create` ever needs a file that does not exist in `src` — a template, a placeholder aggregate, a sample context — the decision has been broken, and the question to ask is why the reference does not have that file. If the answer is that it should not, then the scaffolder should not emit it either.
