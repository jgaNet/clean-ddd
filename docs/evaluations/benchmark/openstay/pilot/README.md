# OpenStay's pilot kit: ten features, written and rehearsed before any run

The pilot of [OpenStay](../README.md) (checkpoint J2) runs these ten requests on 2 arms × 3 trees, each feature from the smallest model up, plus a strongest-model witness. This kit is checkpoint J1: written, reviewed and rehearsed before any agent runs it. [The framing](../j0.md) holds the decisions it follows.

## What is in it

| Path | What it is |
| --- | --- |
| [`backlog/`](backlog) | The ten requests, in product words, each with its API. Request 1 holds the conventions every later one uses. `backlog.yaml` is the order a driver reads. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request, and their client [`openstay.ts`](acceptance/openstay.ts). No arm ever sees them. |
| [`simple-CLAUDE.md`](simple-CLAUDE.md) | The simple arm's guide: the control's plain project, renamed, with nothing said about storage beyond what the requests say. |
| [`trees/`](trees) | Git bundles: `simple.bundle` holds the simple arm's starting commit (`08b94b0`) and the solvability tree on top of it (`dcf5fea`); `clean.bundle` holds the Clean DDD arm's starting commit, with its tooling vendored. `git clone -b main trees/<arm>.bundle <dir> && yarn install` restores one. |
| [`dry-run.json`](dry-run.json) | The rehearsal's report. |
| [`review.md`](review.md) | The review of the tests by a fresh agent that had only the requests, and what was done with each finding (below). |
| `storms/` | The Clean DDD arm's storms, one per feature, decided with the maintainer. Not yet decided: see [below](#what-j1-still-needs). |

## The two arms' starting trees

- **Simple:** `node .claude/flow/control.mjs plain <dir> --name openstay --guide docs/evaluations/benchmark/openstay/pilot/simple-CLAUDE.md`.
- **Clean DDD:** `clean-ddd create <dir> --name openstay`, from the corrected reference (ADR 24's revision: the startup relay has a unit of work). The tooling package is vendored in the tree, so it installs anywhere.

Each arm is given the requests one at a time. The Clean DDD arm also gets the feature's storm. Neither sees the brief.

## How the tests work

- **The server runs as a process of its own,** started from the entry point the grader names (`src/server.ts` for the simple arm, `src/Bootstrap/Fastify/application.ts` for the Clean DDD arm), with `npx tsx`.
  - Each test file uses a SQLite file of its own, at `DATABASE_PATH`.
  - A test may stop the server, kill its process group the way a power cut would, start it again on the same file, or start a second server beside it.
- **A command is read in either protocol,** as request 1 allows:
  - a `2xx` is accepted;
  - a `4xx` is refused;
  - a `202 { operationId }` is followed at `/v1/operations/{id}` until it ends.

  A test checks whether a command was accepted, and the state it left; never the name of a refusal.
- **Environment.** The requests name four variables, and the tests set them: `DATABASE_PATH`, `QUOTE_TTL_SECONDS`, `BOOKING_REQUEST_TTL_SECONDS` and `NOTIFY_URL`.
- **Time.** The tests compute dates from today in UTC, and a test file never starts in the last three minutes of a UTC day.
- **The chaos test of request 10** kills the server at delays drawn from a fixed seed, and is graded twice; a failure in either counts, as in [the robustness kit](../../robustness/README.md).

## How an attempt is graded

[`run-ladder.mjs`](../../../../../.claude/flow/run-ladder.mjs) drives a tree through the backlog:
1. Each feature starts with the smallest model, in a fresh worktree and a fresh conversation.
2. The driver's verdict comes first, as in every campaign: `yarn verify` for the simple arm; the gate with `--fix` and the storm owing nothing for the Clean DDD arm. It is sent back once.
3. Then the hidden tests of this feature and of every earlier one run ([`grade.mjs`](../../../../../.claude/flow/grade.mjs) `--upto`), in a worktree that is removed once graded, so that no agent ever reads them.

An attempt that fails either escalates to the next model, from the same commit. The reason is recorded:
- `hidden`: its own feature's test;
- `regression`: an earlier feature's test;
- `ceiling`: the supervisor stopped it;
- `verdict`: the driver refused the tree.

A feature the strongest model also fails ends the tree. Every later feature builds on it, and its tests could not tell a later failure from this one. That rule was written before any run.

## How it was checked before use

- **The tests discriminate.** On both empty starting trees, all 40 tests fail, in under thirty seconds, and none hangs.
- **The tests were reviewed by a fresh agent** that had only the requests ([`review.md`](review.md)). It reported 10 blocking findings, 9 weak and 12 on wording.
  - **Every blocking finding was closed:**
    - in the test where the test asserted what no request says (the calendar's extra fields, an absent or `null` contact, the key order of a body);
    - in the request where the request allowed two readings (the history of a booking confirmed at once, a search with one date);
    - in the support for timing: an operation may take 60 s, the retry gaps get a second of slack, and no file starts near midnight UTC.
  - **Two weak findings became stricter tests:**
    - the host who quotes their own listing is also a traveller;
    - an idempotency key belongs to one traveller.
  - **The wording findings that change what an agent would write were applied to the requests:**
    - the rounding of a half;
    - what `refund.amount` is;
    - when a request reads as expired;
    - that accepting a request makes no new notice;
    - the token an operation is read with.
- **The tests are solvable.** An agent wrote a tree for the purpose from the requests, with the tests in view, and was told never to bend the code away from a request to pass a test. It passed all 40 tests, twice, and found no defect.
  - **Its readings of what the requests leave open,** none of which a test depends on:
    - `409` for a refused value: request 1 now lists `422` too;
    - "published first" as the first publication;
    - an archived listing refuses every change;
    - a key replayed answers the first booking.
  - **A weakness it found,** a host-only account quoting its own listing, was already closed by the review.
- **`dry-run` on the two starting trees and the solvability tree: clean** ([`dry-run.json`](dry-run.json)).
  - **Hygiene:** the kit's files pass both trees' formatter, linter and type checker.
  - **Discrimination:** no test passes on either starting tree.
  - **Solvability:** every test passes on the solvability tree.
- **The ladder driver was rehearsed twice, with a stand-in agent.**
  - **One that writes nothing:** every step escalated on the hidden tests, the feature failed, and the tree stopped.
  - **One that writes the solvability tree at the intermediate step:** feature 1 escalated once and was delivered at step 1. Features 2 and 3 were delivered at step 0, with their regression tests. `main` moved with each delivery.

  No graded tree was left behind in either rehearsal.

## What J1 still needs

- **The storms,** decided with the maintainer: the strategic model first (which contexts, and how they relate), then a storm per feature. A proposal for each hot spot is prepared, and nothing is decided until the maintainer says so.

## Amendments

None yet. A defect of the kit found after J1 is recorded here, applied to every tree alike, and the attempts it touched are graded again.
