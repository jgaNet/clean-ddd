# J6's calibration kit: OpenStay's requests 1 to 10, the same for the three arms

The calibration of the [three-arms protocol](../README.md): OpenStay's first ten requests, run first by the three arms
(Simple, the plain project; Lite; Full), on the same machine, at the same time. It is **not counted**. It shows that the
machine, the harness and the budgets treat the three arms alike before anything is compared. The kit is one for all
three arms; every arm's agents receive the request and its API fragment (`api/<n>-<id>.yaml`), and the Full and Lite
arms also the feature's storm.

It is the [pilot kit](../../openstay/pilot/README.md) (J1), held to the [kit standard](../../kit-standard.md). The pilot
kit is the record of an earlier campaign and stays as it ran; what this kit changes is listed below.

## What is in it

| Path | What it is |
| --- | --- |
| [`backlog/`](backlog) | The ten requests and `backlog.yaml`, the pilot's, with request 1 changed (below). |
| [`api/`](api) | One fragment per request with an API table (1 to 9; request 10 changes no route): its resources, the routes that answer them by status, and, from request 1 on, what any route may answer (`202 { operationId }`, a `4xx`; never a `5xx`). |
| [`conventions.yaml`](conventions.yaml) | Every convention a later request relies on, with the request that sets it and the test that holds it there. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request, and their client [`openstay.ts`](acceptance/openstay.ts), which holds every answer it reads to the API composed up to the request graded. No arm ever sees them. |
| [`storms/`](storms) | The pilot's storms, unchanged. |

## What changed from the pilot kit, and why

- **Request 1 says what an operation's `error` is:** when an operation ends in `ERROR`, it has
  `error: { type, message }`, `type` the refused rule's name in PascalCase and `message` a sentence. The pilot said
  only `{ status, result? }`, and J5b's clean-3 paid for the silence at request 61
  ([next-campaign corrections 1 and 11](../../openstay/j5/next-campaign.md)). The shape is the contract's
  ([ADR 41](../../../../adr/0041-an-operation-read-is-in-the-contract.md), `http.operation`), as the maintainer decided
  on 13 November for this calibration ([the protocol](../README.md)), not OpenStay's `"<NAME>"`: so no convention
  `departs`, and kit-check prints no difference. A refusal answered at once is still a `4xx` whose body no request
  fixes.
- **Request 1 says what a `5xx` is:** "A `5xx` is never an answer the application chooses: it says the server
  failed." ([correction 6](../../openstay/j5/next-campaign.md)). Nothing else in the requests changed.
- **The requests' API is data** ([correction 8](../../openstay/j5/next-campaign.md)): `api/`, written from the
  requests' tables and prose. The client's `call` passes every answer through `holdToApi`, the lines of the
  [standard](../../kit-standard.md#in-the-hidden-tests-the-lines-a-client-needs), when the grader sets `API_SCHEMA`;
  without it, nothing is held. An answer of another shape fails the test that read it, naming the request whose
  fragment set the shape.
- **The conventions are registered** ([corrections 5 and 9](../../openstay/j5/next-campaign.md)): `conventions.yaml`.
- **The operation's `error` is read where it is born** ([correction 11](../../openstay/j5/next-campaign.md)): the
  client's `act`, which follows an operation to its end, fails a test whose operation ends in `ERROR` without
  `error: { type, message }`, and returns the error with the outcome.
- **Request 1's file has three tests more,** for conventions it sets that no test held there:
  - *refuses what it cannot do with a `4xx`, or an operation that ends in `ERROR`, never a `5xx`* (correction 6):
    sign-ups and sign-ins with a value not allowed, a field missing or of the wrong type, and a token that proves
    nothing;
  - *names the refused rule in the operation's error* (correction 11). Request 1 lets an application answer a
    sign-up at once or later, so the test checks the `error` of the refusals answered later only; an application that
    answers all of them at once has nothing to check there, which the test says in a comment;
  - *answers `404` for something that does not exist*.
- **A state added is read whole where it is added** ([correction 10](../../openstay/j5/next-campaign.md)). Requests 7
  and 8 add `requested`, `declined`, `expired` and `cancelled` to a booking; each is read whole, through the client,
  by a test the pilot already had, which its fragment names. At the requests after them, the composed API holds every
  field there: the expired booking of request 7, read at `GET /v1/bookings/{id}`, is held to request 9's `contact`.
- **Not carried:** the pilot's starting trees, its guide for the simple arm, its review and its rehearsal. The arms'
  starting trees are the protocol's; correction 4's sentence belongs to the Simple arm's guide, not to the kit.
- **The storms' README** links to OpenStay's `j0.md` from its new place; its text is the pilot's.

## How the fragments read the requests

- **What a later row says `GET /v1/<thing>/{id}` gains is held on that route, not in the lists.** The listing's
  `minNights`, `maxNights`, `touristTax` and `bookingMode` are required on `GET /v1/listings/{id}`; `GET
  /v1/listings/mine` and a search are held to the fields requests 2 and 3 name. A booking's new states (`requested`,
  `declined`, `expired`, `cancelled`) are the booking's wherever it is answered, its lists included
  (`[ booking ]`); its `expiresAt`, `cancellation`, `refund` and `contact` are required on `GET /v1/bookings/{id}`
  only (`bookingRead`). The rehearsal found this reading: the pilot's Clean DDD witness tree answers `contact` on a
  booking and not in its lists, as request 9's table says.
- **A field present in some states only** (`expiresAt` on a waiting request, `cancellation` and `refund` on a
  cancelled booking, `contact` once a booking is confirmed) cannot be a `gains`, which requires the field in every
  state. Requests 7, 8 and 9 restate `bookingRead` whole (`schema`), each node naming the request that set it, and
  say in which states each field is required.
- **`null`:** `contact` is absent or `null` while the booking is requested, declined or expired, and there, not `null`,
  once it is confirmed and after it is cancelled (request 9); a history entry's `by` is `null` only for `confirmed` and
  `expired` (request 9). No other field of requests 1 to 10 is said to be `null`.
- **A command** answered at once is any `2xx` (`{ id }` for one that creates something); a read answers `200`; any
  route may also answer `202 { operationId }` or a `4xx`, and nothing else.
- **Formats:** dates are held to `YYYY-MM-DD`, times to ISO 8601 in UTC, amounts and counts to integers; an
  operation's `error.type` to PascalCase.

## How it is checked

- `node .claude/flow/kit-check.mjs docs/evaluations/benchmark/three-arms/calibration`: clean, with no difference from
  the contract's operation to print.
- The kit's TypeScript passes the formatter, the linter and the type checker of both pilot witness trees (the simple
  arm's and the Clean DDD arm's), with the `ajv` 8 their Fastify brings.
- **Rehearsed on the pilot's two witness trees** (13 November), [`dry-run.mjs`](../../../../../.claude/flow/dry-run.mjs)
  with the composed API in force (`API_SCHEMA`): the simple arm's (`simple-w`, `08b94b0` to `2dd7254`) and the Clean
  DDD arm's (`clean-w`, `ccf7f75` to `7a7cf80`), both at request 10, from OpenStay's `trees/*-w` branches.
  - **Discrimination:** every test fails on both starting trees.
  - **Solvability:** all 43 tests pass on both solved trees, after one fix to the fragments. The first run failed
    requests 6 and 10 on `clean-w`: request 9's `contact` was required in the lists of bookings, where request 9's
    table gives it to `GET /v1/bookings/{id}` only (above). The fix moved it, and the rerun was clean.
  - **The operation's `error`:** `clean-w` answers a sign-up later, with `error: { type, message }` (`EmailAlreadyUsed`,
    `PasswordTooShort`, `UnknownRole`), so the new test is exercised there; `simple-w` answers every command at once,
    so it has nothing to check there.
  - **Hygiene:** the kit's files raise nothing in either tree.
- **Before registration,** the rehearsal on the arms' own starting trees and on trees solved to this kit, and both
  reports committed with it, as the [standard](../../kit-standard.md#before-registration-kit-check) asks. The pilot's
  trees were written before request 1 said what an operation's `error` is; one that answered a refusal later without
  `error` would fail wherever it did so, as it should.
