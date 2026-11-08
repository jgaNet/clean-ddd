# 2026-11-08 — The first migration by hand: linkbox, from a plain Fastify API to a created application, on both wires

[ADR 36](../adr/0036-a-migrated-application-keeps-its-behaviour-and-chooses-its-wire.md) decided what a migration is and asked for one to be done by hand before the `migrate` skill is written, so that the skill describes a migration that was seen. This is that migration: a small legacy, its characterization scenario, the storm read from its code, an application made by `create`, its one context, the compatibility wire beside the native one, and the scenario passing unchanged on the first and translated on the second. Everything it produced is in [the kit](benchmark/migration/README.md); what it found is here.

## The legacy

[`linkbox`](benchmark/migration/legacy): a TypeScript API on Fastify, one file of 101 lines, a `Map` for a database, the rules where the requests arrive, every answer synchronous. Five routes: save a link (`201` the link), list the links not archived newest first, read one, archive one (`200` the link, `409` the second time), and an activity feed of what happened, newest first. Three refusals a client can hit (`400 { error }`: a blank title, a title over 80 characters, a url that is not `http(s)://`), a `404`, a `409`. No accounts. It has two tests. It was written for this record to be the shape most software a team would move has, at a size one person reads in five minutes; nothing in it was written for the migration.

## What was done, in the order of the decision

1. **The characterization scenario first** ([`scenario.mjs`](benchmark/migration/scenario.mjs), 13 steps, 243 lines): every answer the legacy gives, asserted field for field, recorded against the legacy before any code of the migration. It filters what it reads to the links of its own run, so it passes on a server that already holds data, and twice in a row.
2. **The storm, read from the legacy** ([`linkbox.yaml`](benchmark/migration/migrated/conventions/storms/linkbox.yaml)): the routes gave the commands and the queries, the `Map` gave the aggregate, the two `activity.push` gave the facts and the policies. Five questions the legacy did not answer by itself were written as hot spots and decided by the maintainer, since there was no room: who may act (anyone, as before), whether a second archiving is a refusal (yes, the `409` was one), whether the feed is an aggregate (a projection, written by a policy on the facts), where a link's time comes from (a parameter with a default, carried by the fact), and what to do about the wire (below).
3. **`create`**, then the one context, in the shape of the reference's `Notes`: two value objects, an aggregate that records two facts, two commands, three queries, two policies that write the feed, in-memory adapters, a controller and routes on the contract's grammar. 29 files, 654 lines without the specs, 216 lines of specs. The legacy's 101 lines became 6.5 times as many, which is the order of magnitude [ADR 31](../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) measured.
4. **The compatibility wire** ([`legacy.routes.ts`](benchmark/migration/migrated/src/Bootstrap/Compat/legacy.routes.ts), 85 lines): five routes in `Bootstrap/Compat`, declared under `migration` in the binding, each bound to one operation. A command is published as a controller publishes it, awaited with `awaitOperation`, and the legacy's body is read from the read model; a refusal is mapped from the rule's name to the legacy's status and sentence; past the deadline the answer is `202 { operationId }`.
5. **The proof.** The scenario passes 13 of 13 against the legacy, and 13 of 13 against the migrated application on `/v1`, unchanged, twelve replays in a row. With `--native` it passes 13 of 13 against `/v2`, where the same steps are translated to the contract's grammar. The application's own six checks pass: 89 unit tests, 8 end-to-end, the conventions check with the wire declared (`the wire is compat (5 compatibility route(s))`), `storm --expect` carried whole. The check was probed on the finished tree: a file in a context that imports the wait, and a route bound to a name the inventory does not list, are both refused with ARCH-COMPAT-ROUTE.

## What it found

**The two wires cannot share a path.** The legacy's clients speak `POST /v1/links` and expect `201` with the link; the contract's grammar answers the same route `202` with an operation id. One route cannot do both, so the compatibility wire keeps the legacy's prefix (`/v1`) and the native grammar is served under the next one (`/v2`); removing the façade leaves the native API at `/v2`, or the transport's prefix is set back then. ADR 36 did not say this; its revision does. The storm records it as a hot spot, since it is a decision the migrated application lives with.

**"Translated" covers the queries too.** The first translation of the scenario moved only the commands (`202`, the Tracker, the ERROR with the rule's name) and failed on step 8: a query's refusal differs as well, `404 { message }` on the contract's grammar against `404 { error: 'link not found' }` on the legacy's. The translation is every difference between the two wires, which is exactly what a client moving from one to the other has to write.

**A compatibility route owns the legacy's leniency.** The legacy read a title that was not a string as missing and answered `title is required`; the contract's schema refuses a wrong type with a `400` and no name. The façade coerces a non-string to the empty string, so that the domain refuses it by name and the name maps to the legacy's sentence. That is a transport concern, and the façade is the one place it may live.

**The feed is eventually consistent in principle, and was never seen lagging.** The legacy wrote the activity in the same request; the migrated application records the fact on the aggregate and a policy writes the feed after the commit, in a transaction of its own. The scenario reads the feed right after the command's answer. In-process, twelve replays never saw an entry missing: the policy runs on the relay after the commit, before the response is serialized. A store with latency could show it; the scenario stays as recorded until it does, and the storm's hot spot says why.

**Two things a created application leaves open, fixed in the reference:**

- `yarn lint` of a created application failed before any feature, on `.claude/flow/generate.mjs` (`no-console`): the flow is copied into every created application and the copied ESLint configuration linted it. The reference's `typescript/eslint.config.js` now ignores `.claude/`, so the next `create` is green on its first `lint`.
- The canonical routes of the reference carry Swagger `tags` in their schemas, typed by `@fastify/swagger`'s augmentation, which a created application does not have; a route copied from the canonical file fails `typecheck` on `tags`. The migrated application dropped them. This is a guide gap for the created project (its guide should say so, or `create` should strip them); it is left open here.

**The tooling the kit runs is the tree's, not the package's.** The published `clean-ddd` does not know `migration` yet, so the kit's application runs the reference's CLI from the repository (`tsx ../../../../../tools/src/cli.ts`) and the dependency on the package was removed from its manifest. A migration done outside this repository, after the release that carries ADR 36, needs none of this.

**The deadline path has no end-to-end case.** In-process every command settles before the deadline; the `202` fallback of the façade is exercised by the building block's spec alone. A migration against a slow store should add the case to its compatibility suite.

**Reading the storm from the code worked at this size.** Five routes and two `push` calls gave every sticky; the hot spots were the questions, not the facts. ADR 36's revisit clause (facilitate with the people who know the legacy when the facts are too implicit) was not needed; a legacy ten times this size with implicit validations in forty places would test it.

## What the `migrate` skill must say, from this run

In the order the skill will ask for it:

1. Record the characterization scenario against the legacy before anything else, field for field, filtered to its own run; replay it twice.
2. Read the storm from the legacy: routes → commands and queries; the stores → aggregates; the writes a request makes beside its main one → facts and policies. Every question the code does not answer is a hot spot to decide with the people who own the legacy, and to write down.
3. `create`, then one context per lane of the storm, in the shape of the reference's canonical files; drop what a created project does not have (`tags`).
4. Choose the wire, declare it: `migration.api`, and under `compat` the five lines per route. Keep the legacy's prefix for the façade and serve the native grammar under the next one. Map every refusal by the rule's name, in a table in the façade; own the legacy's leniency there.
5. Prove: the scenario unchanged on the compatibility wire, translated on the native one (commands and query refusals both), the six checks, `storm --expect` carried, and the storm `done`.

## Verification

- `legacy/`: `yarn verify` (typecheck, lint, format, 2 tests).
- `migrated/`: `yarn check:conventions`, `yarn format:check`, `yarn lint`, `yarn typecheck`, `yarn test:units` (89), `yarn test:e2e` (8); `yarn architecture storm --expect conventions/storms/linkbox.yaml`.
- `node scenario.mjs http://127.0.0.1:10101` against the legacy (13/13, twice); `node scenario.mjs http://127.0.0.1:10102` against the migrated application (13/13, twelve times); `node scenario.mjs http://127.0.0.1:10102 --native` (13/13).
- The reference: `yarn check:conventions` at the root, `yarn lint` in `typescript/`, `yarn architecture mode architecture --base origin/main`.
