# The migration kit: linkbox, by hand

What the first migration by hand produced ([the record](../../2026-11-08-migration-by-hand.md), [ADR 36](../../../adr/0036-a-migrated-application-keeps-its-behaviour-and-chooses-its-wire.md)): a legacy, the scenario that characterizes it, and the application it was migrated into, which answers on the legacy's wire and on the contract's.

| | |
| --- | --- |
| [`legacy/`](legacy) | linkbox as it was: a TypeScript API on Fastify, one file, a `Map`, every answer synchronous. |
| [`scenario.mjs`](scenario.mjs) | The characterization scenario: what the legacy's clients rely on, recorded against it before any code of the migration. It passes unchanged against the migrated application's compatibility wire, and translated (`--native`) against its native wire. |
| [`migrated/`](migrated) | The application `clean-ddd create` made and the migration filled: the `Links` context, the storm read from the legacy ([`conventions/storms/linkbox.yaml`](migrated/conventions/storms/linkbox.yaml)), the compatibility routes ([`src/Bootstrap/Compat/legacy.routes.ts`](migrated/src/Bootstrap/Compat/legacy.routes.ts)) declared under `migration` in [its binding](migrated/conventions/typescript.yaml). |

## Running it

```bash
# the legacy, and its scenario
(cd legacy && yarn install && PORT=10101 yarn start) &
node scenario.mjs http://127.0.0.1:10101

# the migrated application: the legacy's wire under /v1, the contract's under /v2
(cd migrated && yarn install && PORT=10102 yarn start:dev) &
node scenario.mjs http://127.0.0.1:10102             # unchanged, on the compatibility wire
node scenario.mjs http://127.0.0.1:10102 --native    # the same steps, translated to the contract's grammar

# the migrated application's own checks
cd migrated && yarn check:conventions && yarn lint && yarn typecheck && yarn test:units && yarn test:e2e
yarn architecture storm --expect conventions/storms/linkbox.yaml
```

The migrated application runs the reference's tooling from this repository (`tsx ../../../../../tools/src/cli.ts`), since the published package does not know `migration` yet; a migration done elsewhere takes the package.
