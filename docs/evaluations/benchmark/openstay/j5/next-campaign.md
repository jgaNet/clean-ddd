# Corrections for the next campaign

Kept during J5 and decided by the maintainer; none of them changes a J5 verdict or a request a tree has reached.

## From Full+ clean-2's failure on request 61 (7 November)

The tree answered a host's reply behind a 202 and gave the operation's error as `{ type, message }`, the shape its
operations already had; request 61 asks for `error: "<NAME>"`. Every model saw the conflict and kept the tree's shape.
The verdict stands (the request decides it); these three corrections remove the conflict next time.

1. **Request 1 fixes the shape of an operation's error.** It said only `{ status, result? }`, so the first request that
   names a refusal behind a 202 (61) set a shape the architecture had already set otherwise. Request 1 says what `error`
   is (`"<NAME>"`, the rule's name), once, for every request after it.
2. **Full+ ADR 57 (who reaches a command) is narrowed.** "`acceptCommand` is the one way every controller asks for a
   command" pushed the reply of request 60 behind a 202. It becomes: `acceptCommand` for a command whose outcome is read
   later; a command answered at once keeps `awaitCommand`, which refuses with `4xx` as request 1 says.
3. **The guide says the wire shape is the request's.** One sentence in the arms' guides: when a request fixes what the
   API answers, that shape wins over the code's own habit; adapt the projection, not the request (API-ONE-SURFACE).

## From the CQS probe on request 73 (8 November)

J5's three simple trees all failed request 73 the same way: their reads lapsed overdue bookings, so a booking lapsed
the moment someone read it, not at the next sweep as requests 30 and 73 say. The probe added one sentence to the guide
of simple-1 and simple-3 at request 72 and replayed 73. At steps 0 and 1 the sentence reached the new code only, and 73
failed as before; at step 2 both trees carried it to the code already written. simple-3 delivered; simple-1 passed
every hidden test up to 73 but left one spec of its own counting on a lapsing read, and failed its verify. A rule
given late is applied to new code; the code it should have shaped is already there.

4. **The simple arm's guide says it from the first request.** The starting guide of the simple arm
   ([`pilot/simple-CLAUDE.md`](../pilot/simple-CLAUDE.md)) gains, before any request is written:

   ```
   ## One rule

   A read never changes what is stored: a `GET` answers from what is there. What changes with time (something that
   expires, lapses or falls due) is changed by a background job on its schedule, never by a read.
   ```

   The clean arms need nothing: their reads are queries, apart from the commands, already (QUERY-READ-MODELS), and Full+
   clean-3 delivered 73 at step 0.
   J5's guides are not changed; the sentence is in the next campaign's simple guide from its first request.

## From request 80 and test 71 (9 November)

Three trees of four failed request 80 on the same line: a donation without a payment provider was answered `503`, where
request 1 says a refusal is a `4xx` or an `ERROR`. The habit was born at request 26 ("what needs it is refused"), which
no test asked, and lived fifty-four requests. The verdicts stand (the request decides it). On the tooling side, ADR 37
of the reference makes a decision for every feature an architecture decision, and `storm decisions --about` reads what
earlier storms decided before a session decides again. Test 71 was fixed during J5 (see the J5 amendments).

5. **The convention is tested where it is born.** Request 26's test starts a server without a provider and asks it to
   open a payout account: refused, as request 1 says, and everything else answers. Every convention a request relies on
   ("refused", "with nobody acting", "at least every `JOBS_INTERVAL_SECONDS`") is listed in the kit's review with the
   request that sets it and the test that holds it there; a convention with no test where it is born is a finding.
   *Decided by the maintainer on 9 November; applied to the next campaign's kit, not to J5's.*
6. **Request 1 says what a `5xx` is.** One sentence: "A `5xx` is never an answer the application chooses: it says the
   server failed." Requests 26 and 80 say "refused, as request 1 says". *Decided by the maintainer on 9 November;
   applied to the next campaign's kit, not to J5's.*
7. **The ladder checks a regression on the start.** The next campaign's plans set `regressionCheck: { from: 2 }`: an
   earlier test that fails an attempt is graded twice on the commit the attempt started from, and one that fails there
   too is not counted against the attempt (`.claude/flow/README.md`). J5's running ladders keep the rule they started
   with.

## From J5b's two triaged failures (11 November)

J5b's clean-3 failed request 61 on an operation's `error` (`{ type, message }`, where the request says `"<NAME>"`), and
simple-3 failed request 73 on a `payment` read `null` for a lapsed booking ([J5b's repairs](../j5b/repairs.md)). With
request 80's `503`, that is three times the pattern correction 5 names: a convention taken early, untested where it was
born, required by a late request. Corrections 8 to 11 make correction 5 mechanical; each is a part of the
[kit standard](../../kit-standard.md), held by `.claude/flow/kit-check.mjs` before the campaign is registered. *Decided by
the maintainer on 11 November; applied to the next campaign's kit, not to J5's or J5b's, whose ladders run on.*

8. **The requests' API is data, and every hidden test holds every answer to it.** Each request with an API table has a
   fragment, `api/<n>-<id>.yaml`: JSON Schema for its routes' answers by status and for the resources it adds to or
   changes, the states it adds, and the fields `null` in one case only. The grader writes the API composed up to the
   request it grades beside the tests, and the kit's client validates every answer it reads; a problem names the
   request whose fragment set the shape.
9. **The conventions are registered, each with its test where it is born.** `conventions.yaml` lists every convention a
   later request relies on: a refusal's status and shape, an operation's `error`, what `null` means for each field, as
   soon as its time has passed or at the next sweep. Each has the request that sets it and the `it` that holds it
   there; one without either is refused. This is correction 5, as a file a script reads.
10. **A state added is read whole where it is added.** A fragment that adds a state names a test of that request that
    reads the whole resource in it, so every earlier field is held there (request 73's `payment`, at request 30).
11. **The operation is decided in request 1, against the contract's.** The contract now says what an operation is when
    read ([ADR 41](../../../../adr/0041-an-operation-read-is-in-the-contract.md)): `error` is `{ type, message }` in the
    reference. A kit that wants `"<NAME>"`, as OpenStay's request 61 does, says so in request 1 and registers it there
    (`departs: operation.error`); kit-check refuses the difference until it is decided there. This replaces correction
    1's wording with a check.
