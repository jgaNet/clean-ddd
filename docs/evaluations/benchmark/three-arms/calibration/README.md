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
| [`backlog/`](backlog) | The ten requests and `backlog.yaml`, the pilot's, with requests 1, 7 and 9 changed (below). |
| [`api/`](api) | One fragment per request with an API table (1 to 9; request 10 changes no route): its resources, the routes that answer them by status, and, from request 1 on, what any route may answer (`202 { operationId }`, a `4xx`; never a `5xx`). |
| [`conventions.yaml`](conventions.yaml) | Every convention a later request relies on, with the request that sets it and the test that holds it there. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request, and their client [`openstay.ts`](acceptance/openstay.ts), which holds every answer it reads to the API composed up to the request graded. No arm ever sees them. |
| [`storms/`](storms) | The pilot's storms, with the hot spot of request 7's expiry (S9) changed on 13 November (below). |

## Decided by the maintainer (13 November)

1. **A request expires at the next sweep, not at a read.** A booking request the host has not decided in time is
   expired by a background job, which the server runs every `JOBS_INTERVAL_SECONDS` seconds (60 when that is not set;
   request 7 introduces it): at most that long after its time has passed, never before it, and never because someone
   read it. The pilot said "as soon as its time has passed", and its tests slept 2.5 s after a 1 s time-to-live
   (`BOOKING_REQUEST_TTL_SECONDS`). Now:
   - request 7 says it, and request 9's `expired` entry, made by nobody, is the sweep's;
   - every server the tests start runs its job every second (`JOBS_INTERVAL_SECONDS` 1, in `openstay.ts`'s `start`);
   - tests 7 and 9 read with `eventually` until the sweep has done it (`bySweep`: the time-to-live, three runs of the
     job, and three seconds more), never a fixed sleep;
   - test 7 also starts a server whose job runs every hour: past its time, its request still reads `requested`;
   - the register's `request-expiry` and `history-expiry`, and the storms' hot spot S9, say "at the next sweep".

   The simple arm's guide says that a read never changes what is stored
   ([correction 4](../../openstay/j5/next-campaign.md)); the kit now agrees with it.
2. **A body's shape is refused at once, with `400`.** A field missing, or of the wrong type, is answered `400` at
   once, even by an application that answers that request later otherwise: the shape is the transport's, whether a
   value is allowed is the domain's (the contract's API-BODY-SHAPE). Request 1 says it in one sentence. Its test
   requires exactly `400` for the six bodies of the wrong shape it sends, and still accepts a `4xx` at once or an
   `ERROR` later for a value not allowed (a password too short, a role that does not exist, an email already used).
   Registered as `body-shape`.
3. **The lists of bookings carry no per-state fields.** `expiresAt`, `cancellation`, `refund` and `contact` are the
   read of one booking's (`GET /v1/bookings/{id}`, the fragments' `bookingRead`); the lists keep the fields requests 6
   and 7 give, the new states included. The requests' tables already said so, and no text changed; `refund-owed` and
   `contact-null` say it. The tests require none of these fields in a list, and refuse none either.
4. **`401` and `404`, as [ADR 39](../../../../adr/0039-a-command-whose-outcome-is-read-later-needs-a-caller-at-the-transport.md)
   says.** A request that needs a signed-in caller and has none, or a token that proves nothing, is refused `401`; a
   signed-in caller who asks for something that does not exist, or that they may not see, gets `404`. Reading an
   operation too: without a token, when a signed-in caller started it, `401`; with another caller's token, `404`.
   - Request 1 says the operation's half, and that a read is `404` signed in or not.
   - The client's `hidden` returns the status, and each test requires its one: `404` for a listing (or its calendar)
     that only its host sees, read by anyone else, signed in or not, since reading a listing needs no caller; `404` for
     another caller's quote, booking, listing's bookings or history; `401` for a quote or a history read with no
     token. It accepted `401`, `403` or `404` alike before.
   - Request 1 has no command a signed-in caller makes, so the operation's half is held in request 2, where creating
     a listing is the first: a new test reads the host's operation without a token (`401`) and with another host's
     (`404`), when the application answers later. Registered as `operation-reader`, born at 2.

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
  - *refuses a body of the wrong shape at once with `400`, and anything else it cannot do with a `4xx` or an `ERROR`,
    never a `5xx`* (correction 6, and the maintainer's decision 2 above): sign-ups and sign-ins with a field missing
    or of the wrong type (`400`), with a value not allowed, and a token that proves nothing;
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
- **The storms' README** links to OpenStay's `j0.md` from its new place; its text is the pilot's, but for S9 (above).
- **The maintainer's four decisions of 13 November** (above), applied to requests 1, 7 and 9, the register, the storms
  and the tests of requests 1, 2, 4, 5, 6, 7 and 9.

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
- **Rehearsed again after the maintainer's four decisions** (13 November), on the same trees and commits, with 44
  tests (request 2's new one). The trees were written before the decisions, and fail where they differ from them,
  as they should; no test was loosened for them.
  - **Discrimination:** every test fails on both starting trees. **Hygiene:** nothing, in either tree.
  - **Request 7, on both solved trees** (decision 1): *expires a request … at the next sweep, never at a read* fails
    on its second server, whose job runs every hour: past its time, the request reads `expired` at once, where it
    must still read `requested`. Both trees compute the expiry at the read (`simple-w` from the stored `expires_at`;
    `clean-w`'s read side, as the pilot's storm S9 said, beside its sweep). The first half, on a server whose job
    runs every second, passes on both. The dry run calls a test that fails on every solved tree a defect; this one is
    the decision, not the kit.
  - **Request 2, on `clean-w`** (decision 4): the new test reads the host's operation without a token and gets `403`
    where `401` is now required (with another host's token, `404`, as required). `simple-w` answers creating a
    listing at once, so it has no operation to read there.
  - **Request 6, on `simple-w`** (decision 4): another host reading a listing's bookings gets `403` where `404` is now
    required. `clean-w` answers `404`.
  - **Everything else passes on both:** request 1's bodies of the wrong shape are answered `400` by both trees, the
    reads of request 5's quote and request 9's history with no token `401`, and every other read `404`.
- **Before registration,** the rehearsal on the arms' own starting trees and on trees solved to this kit, and both
  reports committed with it, as the [standard](../../kit-standard.md#before-registration-kit-check) asks. The pilot's
  trees were written before request 1 said what an operation's `error` is; one that answered a refusal later without
  `error` would fail wherever it did so, as it should.
