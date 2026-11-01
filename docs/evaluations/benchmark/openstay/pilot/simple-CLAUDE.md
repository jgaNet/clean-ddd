# Working on openstay (guide for AI assistance)

A TypeScript HTTP API on Fastify. Structure the code as you see fit.

## Commands

```bash
yarn verify        # what must pass: typecheck, lint, format, tests
yarn typecheck
yarn lint
yarn format        # prettier, in place
yarn test
yarn start         # the server, on $PORT (10000 by default)
```

## Where things are

- `src/app.ts` — `createApplication()` builds the application and is what the server and the tests start; every route is under `/<apiPrefix>` (`/v1`).
- `src/server.ts` — the entry point.

Keep the code tested: every behaviour a feature brings has a test. The requests say where data is kept.
