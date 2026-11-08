# linkbox, the legacy

The project the first migration by hand starts from ([the record](../../../2026-11-08-migration-by-hand.md), [ADR 36](../../../../adr/0036-a-migrated-application-keeps-its-behaviour-and-chooses-its-wire.md)): a small TypeScript API on Fastify, one file, a `Map` for a database, the rules where the requests arrive, every answer synchronous. It is the shape most software a team would move into the architecture has, at a size one person can read in five minutes.

```bash
yarn install
yarn start                                   # on $PORT (10000 by default), under /v1
node ../scenario.mjs http://127.0.0.1:10000  # the characterization scenario: what its clients rely on
yarn verify                                  # its own two tests
```

| Route | Answers |
| --- | --- |
| `POST /v1/links` `{ url, title }` | `201` the link `{ id, url, title, archived, createdAt }`; `400 { error }` for a blank or long title, or a url that is not `http(s)://` |
| `GET /v1/links` | `200` the links not archived, newest first |
| `GET /v1/links/:id` | `200` the link, archived or not; `404 { error }` |
| `POST /v1/links/:id/archive` | `200` the link, archived; `404`; `409 { error }` when it already was |
| `GET /v1/activity` | `200` what happened, newest first: `{ type: link.saved \| link.archived, linkId, title, at }` |

Nothing here was written for the migration: it is what it was.
