# OpenStay pilot: hidden acceptance tests vs. requests (fresh-agent review)

Scope: `docs/evaluations/benchmark/openstay/pilot/backlog/1..10` against `acceptance/1..10` and `acceptance/openstay.ts`.
Read only; nothing was run. Paths below are relative to `docs/evaluations/benchmark/openstay/pilot/`.

Severities: `blocking` (a faithful agent can fail), `weak` (the test checks less than the request says), `wording` (an ambiguity or a leak to fix in the request).

Totals: blocking 10, weak 9, wording 12.

---

## Blocking

### B1. An instantly confirmed booking's history must have exactly one entry
- **Where:** `acceptance/9-booking-history.acceptance.ts:31`
- **Assertion:** `expect(steps(history)).toEqual([['confirmed', null]]);`
- **What is wrong:** The request lists `requested` as a state and says every change of state is kept. The test treats the instant booking's creation as the change "nothing to confirmed". A second reading is just as reasonable: the traveller requests it (`requested`, by the traveller), and the application then confirms it (`confirmed`, by `null`). Under that reading the history has two entries. The request names "a booking confirmed at once by the application" as an action by nobody, but it does not say the traveller's own action leaves no entry. The request-mode case (line 39) records the creation as `requested` by the traveller, which makes the two-entry reading look natural.
- **Request:** 9-booking-history.md:5 "Every change of a booking's state is kept with who made it and when, in the order it happened: requested, confirmed, declined, expired, cancelled." and :6 "or nobody when nobody acted: an expired request, or a booking confirmed at once by the application."
- **Severity:** blocking

### B2. No contact before confirmation must mean an absent `email`, not `null`
- **Where:** `acceptance/9-booking-history.acceptance.ts:19, 61-62, 72-73, 101`
- **Assertion:** `contact(booking)` is `booking.contact?.email`, checked with `toBeUndefined()`.
- **What is wrong:** `contact: null` and an absent `contact` both pass. `contact: { email: null }`, a common way to say "not shown", fails. The request says only that the booking gains the field once confirmed. It does not say what the field is before that.
- **Request:** 9-booking-history.md:22 "gains `contact: { email }`, the other party's, once the booking has been confirmed, and not before"
- **Severity:** blocking. The test should accept `undefined` or `null`, or the request should say the field is absent.

### B3. Calendar entries are compared with `toEqual`, so any extra field fails
- **Where:** `acceptance/4-host-calendar.acceptance.ts:26-32`
- **Assertion:** `expect(calendar).toEqual([{ date: day(19), available: true }, ...])`
- **What is wrong:** An entry carrying more than `{ date, available }` fails. Examples are `reason: 'blocked'` or `reason: null`. The request itself invites such a field ("Later requests add the other reasons a night is taken"), and request 1 nowhere says that answers carry no other field. Every other shape check in the suite uses `toMatchObject` or maps out one field.
- **Request:** 4-host-calendar.md:14 "A night is blocked or not here. Later requests add the other reasons a night is taken." and :29 "`200 [ { date, available } ]`"
- **Severity:** blocking. Use `.map(each => [each.date, each.available])` or `toMatchObject`.

### B4. A search with a check-in and no check-out must answer 400
- **Where:** `acceptance/3-search.acceptance.ts:49`
- **Assertion:** `expect(await status(\`city=Lyon&checkIn=${day(10)}\`)).toBe(400);`
- **What is wrong:** The request gives a closed list of searches that make no sense: no city, a check-out on or before the check-in, and guests below 1. A lone check-in is not on that list. "Both given or neither" can be read as describing the input, so an agent may ignore a lone date and search without dates. That answers 200.
- **Request:** 3-search.md:7 "The dates are a check-in and a check-out, both given or neither." and :18 "A search that makes no sense is refused: no city, a check-out on or before the check-in, a number of guests below 1."
- **Severity:** blocking. Add "only one of the two dates" to the list at line 18, or drop the assertion.

### B5. The crash test reads the recorded bookings once, which races with work finished after the restart
- **Where:** `acceptance/10-notify-the-host.acceptance.ts:110-118, 128-131`
- **Assertion:** `recorded` is read once from `/bookings/mine`, right after the last restart. Line 131 then checks `[...final.keys()].filter(each => !recorded.includes(each))` is `[]`.
- **What is wrong:** Request 1 allows `202 { operationId }`, with the work done later. Consider a server that makes the booking request durable before answering 202 and finishes it after a restart. A kill can fall after that 202 but before the booking is written, and this is a faithful design: the request says "a crash loses nothing". The booking is then written after the restart, possibly after line 118. Its notice is legitimate, because the booking was recorded. Line 131 nonetheless reports it as a notice for an unrecorded booking. The 60 s `eventually` at line 128 only widens the window for that notice to arrive.
- **Request:** 10-notify-the-host.md:19 "every booking that was recorded has its notice accepted in the end. A booking that was not recorded has none." and 1-accounts.md:18 (the "Later" answer).
- **Severity:** blocking. Re-read `recorded` after the notices settle, or read it inside `eventually`.

### B6. "The same body" is compared byte for byte, so key order matters
- **Where:** `acceptance/10-notify-the-host.acceptance.ts:45`
- **Assertion:** `JSON.stringify(attempt.body) === JSON.stringify(notice)`
- **What is wrong:** The bodies are parsed, then re-serialised, so the comparison depends on key order. A sender that rebuilds the body for each attempt passes only if it emits the keys in the same order every time. Two examples that can break this: building the first body from an object literal and later ones from a stored row, or a JSON column that normalises key order. The request means the same content: the same `id`, `kind`, `hostId` and `bookingId`.
- **Request:** 10-notify-the-host.md:13 "is sent again, with the same body, until it is accepted"
- **Severity:** blocking (unlikely). Compare with `toEqual`.

### B7. The server's entry point and toolchain are fixed by the harness and stated nowhere an agent reads
- **Where:** `acceptance/openstay.ts:22, 68`
- **Assertion:** `entry = process.env.ACCEPTANCE_ENTRY ?? 'src/Bootstrap/Fastify/application.ts'`, started with `npx tsx --tsconfig ./tsconfig.json entry`
- **What is wrong:** The default entry is the reference tree's file. The simple arm's guide (`simple-CLAUDE.md:19`) names `src/server.ts`. No document under `docs/evaluations/benchmark/openstay` mentions `ACCEPTANCE_ENTRY`. The harness also needs `./tsconfig.json` in the working directory, and `tsx` available to `npx`, or able to be fetched over the network. The requests say only "the server listens on `PORT`". An arm whose entry the grader does not set fails every test. The same happens to an agent that moves or renames the entry.
- **Request:** 1-accounts.md:14 "Every route is under `/v1`, and the server listens on `PORT`." (Nothing says how the server is started.)
- **Severity:** blocking (environment). Document `ACCEPTANCE_ENTRY` per arm in the protocol, or start the server with the project's own `yarn start`.

### B8. Dates are computed by the test and "today" by the server, which can disagree around UTC midnight
- **Where:** `acceptance/openstay.ts:28`, used in `5-quote.acceptance.ts:96` (check-in `day(0)` must be accepted), `8-cancel-a-booking.acceptance.ts:33-53` (exact refund at boundaries of 0, 1, 5 and 7 days), and `4-host-calendar.acceptance.ts:24-36` and `6-book-instantly.acceptance.ts:60-68` (`day()` is recomputed between the write and the read).
- **What is wrong:** `day(n)` is taken from `Date.now()` at each call. If UTC midnight passes between computing a date and the server acting on it, a correct server sees a different "today". Three examples: `day(0)` becomes "before today" and is refused; the flexible 1-day case drops to 0 days and answers 200 instead of 22200; the calendar's expected dates shift by one. This is rare, but the cancellation loop alone makes about 30 calls that span a few seconds.
- **Request:** 8-cancel-a-booking.md:9 "Days count from today's date to the check-in date, in UTC." and 5-quote.md:9 "the check-in is before today".
- **Severity:** blocking (rare). Fix "today" once per test and skip, or retry, when the date changes during it.

### B9. A free port is chosen, then released, before the server binds it
- **Where:** `acceptance/openstay.ts:30-36, 66-79`
- **What is wrong:** The port is released before the child binds it. With test files run in parallel, as Jest does by default, another file's server can take the port first. That server fails to bind and exits. Worse, `start()` can reach the other server before that exit, and the test then runs against another file's server and database. The readiness probe accepts any answer, even a 401.
- **Request:** 1-accounts.md:14 (`PORT`)
- **Severity:** blocking (rare, environment). Run the files with `--runInBand`, or check that the answering process is the child, for example with a per-start token in the environment echoed by a route. Or retry when the child exits.

### B10. Retry-gap limits leave 0.5 s of slack, and the async-operation wait is capped at 15 s, under parallel load
- **Where:** `acceptance/10-notify-the-host.acceptance.ts:47-48` (`gaps[0] <= 1500`, `max <= 5500`); `acceptance/openstay.ts:39, 163-168` (each 202 operation must end within 15 s), used by `6-book-instantly.acceptance.ts:135-138, 158-161` (20 concurrent bookings, then 10 on each of two servers sharing one SQLite file).
- **What is wrong:** Arrival-to-arrival gaps include scheduling jitter. A server that retries at exactly 1 s, or a relay that polls every second, sits within 0.5 s of failing while several `tsx` servers share the CPU. In the concurrency tests, a correct server that serialises writes behind SQLite's lock can keep an operation `PENDING` for more than 15 s under contention. `act` then throws "the operation never ended".
- **Request:** 10-notify-the-host.md:14-15 "the first retry comes within a second of the failure; each later one comes at most five seconds after the previous attempt ended". Request 1 sets no deadline for a 202 to end.
- **Severity:** blocking (timing). Widen the limits, or run these files in band.

---

## Weak

### W1. "The same answer" for a wrong password and an unknown email is checked on the status only
- **Where:** `acceptance/1-accounts.acceptance.ts:53-54`
- **What is wrong:** The test checks only that both answer 401. Bodies such as `{error:'wrong password'}` and `{error:'no such account'}` pass, although they leak which emails have accounts. Leaking that is exactly what the rule forbids.
- **Request:** 1-accounts.md:6 "is refused with the same answer, so nobody learns which emails have accounts."
- **Severity:** weak. Also assert `expect(wrong.body).toEqual(unknown.body)`.

### W2. The host-quotes-own-listing refusal is tested with an account that is not a traveller
- **Where:** `acceptance/5-quote.acceptance.ts:82` (`hal` has roles `['host']` only)
- **What is wrong:** A server that refuses quotes from any non-traveller passes without implementing the self-quote rule. The rule bites only on an account that is both host and traveller.
- **Request:** 5-quote.md:12 "the traveller is the listing's host."
- **Severity:** weak. Use `api.account(email, ['host','traveller'])` as the host.

### W3. The crash test refuses every notice's first attempt and counts accepted notices only, so a premature notice goes unseen
- **Where:** `acceptance/10-notify-the-host.acceptance.ts:95` (`outside(1)`), `:121` (only `service.accepted` is inspected), `:131`
- **What is wrong:** Take a server that sends a notice from memory before the booking commits. If the kill then loses the booking, that notice was the notice's first attempt, so the service refused it. It is never retried, because it was in memory only, so it never reaches `accepted`. The rule "a booking that was not recorded has none" is therefore not checked. The test also cannot see a second notice id that was attempted but never accepted.
- **Request:** 10-notify-the-host.md:19 "A booking that was not recorded has none."
- **Severity:** weak. Also check `service.attempts` for booking ids not in `recorded`, or accept first attempts in some rounds.

### W4. The silent service and the "at once" timing are never played
- **Where:** `acceptance/openstay.ts:289-294` (the service always answers at once); `10-notify-the-host.acceptance.ts` (no check of the delay to the first attempt; no run without `NOTIFY_URL`)
- **What is wrong:** A sender with no timeout passes, though it would hang forever on a service that never answers. A sender that waits minutes before the first attempt passes test 1 if retries are prompt, since the wait is 30 s. "Without `NOTIFY_URL`, nothing is sent" is not checked either. That one is hard to test, but a server could be started with a service whose URL is not passed and checked for no attempts.
- **Request:** 10-notify-the-host.md:3 "Hosts want to know at once", :13 "or not answer within two seconds", :21 "Without `NOTIFY_URL`, nothing is sent."
- **Severity:** weak. Most important is the two-second timeout: add a service mode that holds the response.

### W5. The idempotency key is not checked to be per traveller
- **Where:** `acceptance/6-book-instantly.acceptance.ts:98-108`
- **What is wrong:** Only the same traveller and the same key are tested. A server that keys on the header alone passes. Under that server, another traveller who sends `Idempotency-Key: grasse-15` receives tom's booking id. That leaks someone else's booking and silently makes no booking for them.
- **Request:** 6-book-instantly.md:12 "with the key of an earlier booking by the same traveller makes no new booking"
- **Severity:** weak. Add a second traveller who reuses the key and must get a booking of their own, or a refusal.

### W6. A held request's nights are checked against quotes, not against a booking from an earlier quote
- **Where:** `acceptance/7-request-to-book.acceptance.ts:35-49`
- **What is wrong:** The test checks that a new quote, a block and a search are kept off the nights, and that the calendar shows them taken. It never checks that a quote made before the request, for overlapping nights, is refused when booked. That is the realistic double-booking path. A server that refuses new quotes but does not count requests as taken when booking passes.
- **Request:** 7-request-to-book.md:7 "nobody else can book or quote them"
- **Severity:** weak

### W7. The default validity of a quote is not checked
- **Where:** `acceptance/5-quote.acceptance.ts:55`
- **What is wrong:** The test asserts only that `validUntil` is later than now. A server with any default validity passes, whether one day or a year. Only the override, `QUOTE_TTL_SECONDS=1`, is exercised in `6-book-instantly.acceptance.ts:169-184`.
- **Request:** 5-quote.md:23 "1800 when that is not set."
- **Severity:** weak. Assert that `validUntil` is within a few seconds of now plus 1800 s.

### W8. "Bookings made before this request have a history" cannot be checked
- **Where:** `acceptance/9-booking-history.acceptance.ts` (every test starts on a fresh database)
- **What is wrong:** The migration of existing bookings is never exercised. A black-box test cannot do so without a database made by a request-8 tree.
- **Request:** 9-booking-history.md:8
- **Severity:** weak. Drop the sentence, or grade it some other way.

### W9. `refused` counts any 4xx, so a 404 from a route that does not exist counts as a refusal
- **Where:** `acceptance/openstay.ts:189-190`
- **What is wrong:** Negative checks pass on a 404 from an unregistered route, or on a 400 for a misspelt body field. Most refused routes are also exercised positively elsewhere, so the gap is small. But some refusals are checked only negatively in their file. Examples: unblocking by a non-host is never checked at all, and `suspend` from `suspended` is never checked.
- **Request:** 1-accounts.md:17-20
- **Severity:** weak (low)

---

## Wording

### D1. The storage technology is prescribed
- **Where:** `backlog/1-accounts.md:8` "What the application knows is kept in a SQLite database, in the file `DATABASE_PATH` names."
- **What is wrong:** This names a design choice, not a product need. It is needed by the harness: the kill and restart tests, and two servers on one database. Say so as an operating constraint, for example "the grader starts the server with `DATABASE_PATH`, a SQLite file it may share between two servers", so it reads as an environment fact and not as a design.
- **Severity:** wording

### D2. The second answer protocol mirrors the reference's command architecture
- **Where:** `backlog/1-accounts.md:16-18` ("Later: `202 { operationId }` ... `PENDING` ... `SUCCESS` or `ERROR`")
- **What is wrong:** This is the reference implementation's asynchronous-command design, offered as an API option. It is optional, but it hints at a structure (a bus, operations) and adds a second protocol that every grader path must follow. If it stays, it should be presented as an API contract only. It is also the source of the race in B5.
- **Severity:** wording

### D3. "With the same token" is undefined for an anonymous request
- **Where:** `backlog/1-accounts.md:18` "the outcome is read at `GET /v1/operations/{operationId}`, with the same token."
- **What is wrong:** Sign-up carries no token. The client polls `/operations/{id}` with no `Authorization` header (`openstay.ts:164`). An agent that answers sign-up with 202 and treats `/operations` as a signed-in read, under line 15, gets 401 on every poll. Every test then fails at sign-up. Say that the operation of an anonymous request is read without a token.
- **Severity:** wording (it can block)

### D4. Whether the refund's `amount` is what is owed or what was refunded
- **Where:** `backlog/8-cancel-a-booking.md:3, 21, 31`; tested at `acceptance/8-cancel-a-booking.acceptance.ts:81` (`refund: { amount: 22200, status: 'owed' }`)
- **What is wrong:** The request stresses that "what is owed and what was refunded are two different things" and that "nothing is refunded here". A reader may set `refund.amount` to 0, the amount refunded so far. The test wants the amount owed, equal to `refundable`.
- **Severity:** wording. Write "`refund: { amount, status }`, the amount owed back, equal to `refundable`".

### D5. "A half" of what is rounded
- **Where:** `backlog/8-cancel-a-booking.md:17` "A half is rounded down to the cent."; tested at `acceptance/8-cancel-a-booking.acceptance.ts:60-65`
- **What is wrong:** It is unclear whether the half is of the sum of the host's lines, or of each line rounded separately. The test uses a cleaning fee of 0, so it cannot tell the two apart. That is good for the test but leaves the rule unclear.
- **Severity:** wording

### D6. How soon an expired request must read as expired
- **Where:** `backlog/7-request-to-book.md:14-17`; tested at `acceptance/7-request-to-book.acceptance.ts:89` and `9-booking-history.acceptance.ts:95` (a TTL of 1 s, read 2.5 s later)
- **What is wrong:** "Reads as expired, without anyone having to act on it first" suggests evaluation at read time. A server that expires requests with a background sweep every few seconds fails. Request 9 also wants an `expired` history entry, which needs either a sweep or a history derived on read. State "as soon as the time is up".
- **Severity:** wording

### D7. "Published first" after a suspension and republication
- **Where:** `backlog/3-search.md:15` "then the listing published first"
- **What is wrong:** It could mean the first publication or the latest one. This is not tested, since `3-search.acceptance.ts:19-23` never republishes, but agents will differ.
- **Severity:** wording

### D8. Freeing a night that is not blocked: accepted, or refused?
- **Where:** `backlog/4-host-calendar.md:7` "Freeing a night that is not blocked changes nothing."; tested at `acceptance/4-host-calendar.acceptance.ts:44` (`done`, so it must be accepted)
- **What is wrong:** "Changes nothing" most likely means accepted with no effect, which is how the test reads it. But a refusal also changes nothing. Say "is accepted and changes nothing".
- **Severity:** wording

### D9. "Every change of a booking's state" does not say whether creation is a change
- **Where:** `backlog/9-booking-history.md:5-6`
- **What is wrong:** This is the source of B1. Say, for example, "an instantly confirmed booking has one entry, `confirmed`, by nobody".
- **Severity:** wording

### D10. Whether accepting a request sends a `booking-confirmed` notice
- **Where:** `backlog/10-notify-the-host.md:5-7` "every new booking sends its host a notice: a confirmed booking, from request 6; and a request, from request 7."
- **What is wrong:** A request the host accepts becomes a confirmed booking, and it is unclear whether that is a new booking and needs another notice. The tests never accept a request with `NOTIFY_URL` set, so either reading passes now. A later test would need the request to decide. "One notice per booking" (line 20) suggests no, but `booking-confirmed` suggests yes.
- **Severity:** wording

### D11. The contact field's shape before confirmation
- **Where:** `backlog/9-booking-history.md:22`
- **What is wrong:** This is the source of B2. Say whether `contact` is absent, `null`, or `{ email: null }` before confirmation.
- **Severity:** wording

### D12. The requests speak of the backlog, not the product
- **Where:** `backlog/9-booking-history.md:8` "Bookings made before this request have a history from the state they were in."; also `4-host-calendar.md:9`, `4-host-calendar.md:14`, `3-search.md:17`, `7-request-to-book.md:6` ("as request 6 books"), `10-notify-the-host.md:6-7`
- **What is wrong:** Cross-references by request number are a development process, not product words. They are acceptable for sequencing. But 9:8 is a data-migration instruction in process words, and it cannot be graded (W8). The sentence at 4:14, "Later requests add the other reasons", invites extra calendar fields that the test then forbids (B3).
- **Severity:** wording

---

No architecture vocabulary was found in the requests: no "aggregate", "event", "context", "command", "repository", "domain", "handler", "port" or "outbox". The leaks are D1 (SQLite) and D2 (the operation protocol).
