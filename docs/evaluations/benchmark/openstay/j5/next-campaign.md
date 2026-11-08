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

   The clean arms need nothing: a query returns a read model and changes nothing there already (QUERY-READ-MODELS).
   J5's guides are not changed; the sentence is in the next campaign's simple guide from its first request.
