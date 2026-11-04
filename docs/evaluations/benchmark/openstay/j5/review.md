# OpenStay J5 test kit: review of tests 51–100

## Scope

I read the support files first: `acceptance/openstay.ts` (the client and its either-protocol `act`, `start`/`kill`/`stop`/`restart`, `clock`, `adminEnvironment`, the notification service, the outside calendars and `parseCalendar`, the files, `totp`, `iban`) and `acceptance/provider.ts` (the fake provider with currencies and the fee schedule, `feeOf`, `cardFeeOf`, idempotent replays, webhook delivery and retries, `payBooking`, `enabledAccount`). Then I reviewed `acceptance/51-*.acceptance.ts` to `100-*.acceptance.ts` against `backlog/51-*.md` to `100-*.md` and `backlog/1-accounts.md`. I also read the earlier requests these cite where a test depends on them: 2, 3, 4, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 23, 24, 25, 26, 27, 29, 30, 31, 35, 37, 40, 41, 44, 46 and 48.

All paths are relative to `docs/evaluations/benchmark/openstay/j5/`. Line numbers are the line numbers in each file.

I checked every expected amount by hand, and found no arithmetic error:
- the ratings and their half-up rounding (59, 65);
- the sort orders (62, 85, 87);
- what the claims refund and what is left to refund (72);
- the cost per booking (82);
- the indicative conversions (88). `130 × 0.85` is 110.49999… in floating point, so a tree that does not compute exactly, as the request asks, gets 110 instead of 111. That trap is fair;
- the card fee lines in euros and yen (90);
- the city taxes, per guest and night, per cent and by date (91, 92);
- the night caps (93);
- the DAC7 rows (94).

Two J4 findings are fixed in this kit:
- request 26 now says that a server without a provider starts (J4 B2);
- tests 89 and 100 compute their weekdays inside the cases (J4 B6).

I also checked every review comment and reply in tests 57–65 against request 61's rules: none of them would be refused. Every exact object in these tests also survives the later requests up to 100: those requests add fields (`lang`, `country`, `currency`, `description`, `verified`, `trader`, `cityTouristTax`, `source`), and the tests read those fields with `toMatchObject` or `objectContaining`, or compare two answers to the same request.

## Severities

- **blocking**: an agent that implements the requests faithfully can fail the assertion.
- **weak**: the test checks clearly less than the request says, on something important.
- **wording**: an ambiguity in a request that would change what an agent writes, where a test had to choose.

## Totals

| Severity | Count |
| --- | --- |
| Blocking | 6 |
| Weak | 8 |
| Wording | 6 |

---

## Blocking

### B1. A token from one server is used on another, though no request says one works there
- **Where:**
  - `acceptance/66-suspending-accounts.acceptance.ts:129-132`: `fresh` comes from `otherApi.login`, and `me(api, fresh)` must answer 200;
  - `acceptance/67-audit-log.acceptance.ts:192-196`: `on.done(…, ada.token)` with `on = otherApi`, while `ada.token` came from `server`;
  - `acceptance/67-audit-log.acceptance.ts:228`: `otherApi.list(…, ada.token)`, while `ada.token` came from the restarted `server`.
- **What is wrong:** request 1 says a token proves who the caller is. No request says that a token issued by one server is accepted by another server on the same database. Request 40 says only that "every request so far behaves as it did: two servers on one database". A tree that signs tokens with a secret it generates at startup is faithful to every request. Its second server answers `401`:
  - `done` throws at 67:194;
  - the read throws at 67:228;
  - `me` answers 401 instead of 200 at 66:131.

  The kit itself assumes tokens are per server everywhere else: tests 51, 54, 55, 57, 72, 76, 93, 95 and 100 sign in again on every second server and after every restart. Request 66:6 ("refused with `401`, on every server") hints at shared tokens but does not state them.
- **Request:** `backlog/1-accounts.md:6`, `backlog/40-postgresql.md:6`, `backlog/66-suspending-accounts.md:6`.
- **Fix:** sign in on the server that is called: `await otherApi.login(ada.email)` at 67:194 and 67:228, and `await api.login(sam.email)` for the check on `api` at 66:131. Alternatively, state in request 1 or request 40 that a token is good on every server on the database and after a restart.
- **Severity:** blocking (certain, for a tree with per-process signing keys).
- **Closed:** a token is used only on the server that gave it. Test 66 signs in again on each server after the reinstatement; test 67 signs both administrators in on the second server and uses those tokens there (`adaThere`, `bobThere`). No request was changed.

### B2. Test 73 reads the proof's type and size from the command's result, which a `202` tree does not give
- **Where:** `acceptance/73-transfer-proof.acceptance.ts:89-93` (`sent` returns `outcome.result as Json`), asserted at `:110-111`, `:147-148` and `:151` (`answer.id`).
- **Assertion:** `expect(answer).toMatchObject({ type: file.type, size: file.bytes.length })`, then `typeof answer.id === 'string'`.
- **What is wrong:** request 1 lets any change answer `202 { operationId }`, and "a request that creates something has the new thing's id as its result". A tree that answers the upload later therefore has the proof's id, a string, as `result`. `toMatchObject` on a string fails, and `answer.id` is `undefined`. Test 54 handles exactly this case: its `uploaded` helper (`54-attachments.acceptance.ts:42-49`) checks `{ type, size }` only when the result is an object. Test 73 does not.
- **Request:** `backlog/1-accounts.md:18`, `backlog/73-transfer-proof.md:20` (`{ id, type, size }, the proof's`).
- **Fix:** reuse test 54's helper. Take `idOf(outcome.result)`, check `{ type, size }` only when the result is an object, and read type and size from `payment.transfer.proof` otherwise.
- **Severity:** blocking (certain, for a tree that answers uploads `202`).
- **Closed:** `sent` now returns the proof's id (`idOf`), and the answer only when it came at once. The type and size are checked on that answer when there is one, and always on `payment.transfer.proof`, with the proof's id.

### B3. Test 73 gives the proofs a 15-second deadline, and spends it creating three listings and bookings first
- **Where:** `acceptance/73-transfer-proof.acceptance.ts:216-223`.
- **Assertion:** with `PAYMENT_TTL_SECONDS: '15'`, the test creates `contested`, `confirmed` and `alone` (each one a listing create, a publish, a quote and a booking), and only then sends the proofs of `contested` and `confirmed`. `sent` throws if a proof is refused.
- **What is wrong:** the proof of `contested` must arrive before `contested`'s `dueBy` plus a sweep (`JOBS_INTERVAL_SECONDS` 1). Request 73 refuses a proof once the payment is no longer `due`. In between come at least 8 more commands and one upload. A correct tree that answers commands later, for example from a queue it works through every second, needs about 1 s per command. At that pace `contested` has lapsed before its proof arrives, and the test fails in its setup.
- **Request:** `backlog/73-transfer-proof.md:6` ("while the booking's payment is `due`").
- **Fix:** send each proof right after its booking (`contested`, its proof, `confirmed`, its proof, then `alone`). Also raise the TTL to 30 or 60 s; the `sleep` that follows already reads `dueBy`.
- **Severity:** blocking (timing; it fails a correct but slower tree).
- **Closed:** each proof is sent right after its booking, the booking left alone comes last, and `PAYMENT_TTL_SECONDS` is 30.

### B4. A server is killed right after a decision, and the refund is settled before the restarted server knows it
- **Where:**
  - `acceptance/72-claims-with-money.acceptance.ts:360-373`: `kill` at 362, then the test finds the refund at the provider (367-371) and calls `settleRefund` at once (373). Asserted at 374-380.
  - `acceptance/66-suspending-accounts.acceptance.ts:335-347`: `kill` right after `suspend`. Refunds settle by themselves after 200 ms (`settleAfterMs` 200), and their webhooks go to `other`. Asserted at 343-348.
  - At lower risk: `acceptance/89-payouts-per-currency.acceptance.ts:255-273`, the same pattern for payouts. There, the second server that stays up usually posts the payout again before the webhook arrives.
- **What is wrong:** this is J4 B3 again, for refunds. Suppose the kill lands after the old server's `POST /refunds` and before it records the refund's id. The tests aim for that moment, since a refund relayed from an outbox goes out within milliseconds of the answer. Then the provider holds the refund, and no surviving server knows its id. Two things can then reach the application first:
  - in 72, the explicit `settleRefund`;
  - in 66, the automatic settlement after 200 ms.

  Either way, `refund.succeeded` can arrive before any server's job asks for the refund again. Request 29 says a webhook about something OpenStay does not know is answered `2xx` and changes nothing, so the event is consumed and lost. The later idempotent `POST /refunds` replays the creation answer. A tree that, as request 30's table says, takes the `201` answer for `pending` and waits for the webhook then reads `pending` forever. Lines 374-380 (72) and 343-347 (66) time out.
- **Request:** `backlog/72-claims-with-money.md:10`, `backlog/66-suspending-accounts.md:15`, `backlog/29-webhooks-as-they-come.md:7`.
- **Fix:**
  - in 72, before `settleRefund`, wait until the restarted server shows the claim's refund as pending: `await eventually(() => claimOf(id), c => (c.refund as Json | null)?.status === 'pending', 30000)`;
  - in 66, set `settleAfterMs = undefined` around the kill, wait until each booking reads `refund.status === 'pending'`, then settle each refund.
- **Severity:** blocking (a race, for one legitimate design).
- **Closed:**
  - in 72, the provider settles the refund only once the restarted server reads the claim's refund `pending`, and 2 s later (a refund asked just before the kill is asked again by then);
  - in 66, `settleAfterMs` is off around the suspension and the kill; once every booking reads its refund `pending` on the restarted server, and 2 s later, the test settles each pending refund;
  - in 89, the same for payouts: the test settles them once the restarted server lists them, which replaces resending the events.

### B5. Test 80 requires two receipts in number order, though their times can tie
- **Where:** `acceptance/80-donations.acceptance.ts:179-184`.
- **Assertion:** `/receipts/mine` lists `[['payment', second, …], ['payment', first, …]]`, and `receipts[0].number === receipts[1].number + 1`.
- **What is wrong:** this is J4 B5 again. Request 46 says "the most recent first" but does not say by what. A tree that dates receipts by the webhook's `created` (whole seconds, as request 35 dates statements) and sorts by `at` has a tie whenever the two payments succeed within one second. Between them come only a donation paid, a quote, a booking and a payment, which a fast tree does in under a second. The order of a tie is arbitrary, often insertion order, which puts `first` first.
- **Request:** `backlog/46-receipts.md:7` and `:15` ("the most recent first").
- **Fix:** `await sleep(1100)` before paying `second`, as test 33 did at J4. Alternatively, make the order "by number, the highest first" in request 46.
- **Severity:** blocking (timing, for one plausible design).
- **Closed:** `sleep(1100)` before the second booking is made and paid. Request 46 is unchanged.

### B6. Five lists are ordered by creation time over records made back to back
- **Where:**
  - `acceptance/74-support.acceptance.ts:125`: `[second, first]`, two tickets opened one after the other;
  - `acceptance/74-support.acceptance.ts:140`: `[opened, answered, closed]`, three tickets opened one after the other;
  - `acceptance/71-claims.acceptance.ts:299`: `[first, second]`;
  - `acceptance/71-claims.acceptance.ts:317`: `[seen, listed]`;
  - `acceptance/80-donations.acceptance.ts:90`: `[smallest.id, id]`.
- **What is wrong:** each list is "the oldest first" or "the most recent first" by `createdAt`. Request 1 allows times in whole seconds ("times are ISO 8601"). A tree that stores them so, and orders ties by id (random) or by insertion, gets these orders wrong when the records fall in one second, as consecutive creates do. The kit avoids exactly this elsewhere with `sleep(1100)` (51:180, 64:122, 81:138).
- **Request:** `backlog/74-support.md` (API table: "the most recently opened first", "the oldest first"), `backlog/71-claims.md` (API table: "the oldest first"), `backlog/80-donations.md` (API table: "the most recent first"), `backlog/1-accounts.md:23`.
- **Fix:** `await sleep(1100)` between the creations whose order is asserted.
- **Severity:** blocking (rare design: times kept to the second).
- **Closed:** `sleep(1100)` between every two creations whose order is asserted: the tickets of 74 (both cases), the claims of 71 (both cases), the donations of 80.

---

## Weak

### W1. Races across two servers use the first server's token on the second, so they can pass on one server alone
- **Where:**
  - `acceptance/63-reporting-a-listing.acceptance.ts:120-124`;
  - `acceptance/64-moderation-queue.acceptance.ts:233-243`;
  - `acceptance/65-upholding-reports.acceptance.ts:340-350`;
  - `acceptance/67-audit-log.acceptance.ts:200-204`;
  - `acceptance/68-suspicious-accounts.acceptance.ts:157-161`, `:166-170`.
- **What is missing:** with per-process tokens (see B1), every call to `otherApi` is a `401` refusal. "Exactly one accepted" then holds on the first server alone, and in 68 the refused calls are simply resent to `api`. A tree whose one-report, one-decision or one-flag guarantee breaks across two servers passes these cases.
- **Request:** `backlog/63-reporting-a-listing.md:9`; requests 64, 65, 67 and 68 ("on one server or two").
- **Suggestion:** sign in on `other` for each person, as tests 51 and 55 do.
- **Severity:** weak.
- **Closed:** every race across two servers uses a token of each server: 63 (the traveller), 64 and 65 (both administrators), 67 (both administrators), 68 (both travellers).

### W2. Test 87 checks the per-currency statement and transparency, and none of the other sums request 87 keeps apart
- **Where:** `acceptance/87-currencies.acceptance.ts` (whole file).
- **What is missing:**
  - the tourist tax collected, one line per city and currency (request 38);
  - the reconciliation matched by `currency` (37);
  - `payment-costs?currency=` (83);
  - bulk seasons refused across currencies (22);
  - a change of dates keeping the booking's currency (19).

  A tree that adds yen to euros in any of these passes.
- **Request:** `backlog/87-currencies.md:14`, `:17`, `:20`.
- **Suggestion:** add one case with a GBP booking and a EUR booking in one city. Read `/hosts/me/tourist-tax?month=`, `/admin/payment-costs?currency=GBP` and `/admin/reconciliation`, and send one refused bulk season.
- **Severity:** weak.
- **Closed, but for the change of dates:** a last case of 87 has a EUR and a GBP booking in York, paid. The tourist tax reads one line per currency; `payment-costs` for `GBP` and for the default `EUR` count each currency's payments only, as the provider holds them; a charge the provider has in pounds under the euro booking is a mismatch of its own, with its `currency`; a season on the two listings is refused, and neither price changes.
- **Left:** the change of dates keeping its currency. Request 87 refuses a change of currency once a listing is booked, so a change of dates can only read the same currency, and a case would test nothing.

### W3. Test 100 never kills a server between asking the provider for a payout and recording it
- **Where:** `acceptance/100-pausing-payouts.acceptance.ts:126-138`.
- **What is missing:** the only kill happens while payouts are paused, so nothing is in flight. "Never twice, even when a server is killed between asking the provider and recording it" is not exercised. Neither is the resume racing a job that was already running.
- **Request:** `backlog/100-pausing-payouts.md:10`.
- **Suggestion:** after the resume, kill `restarted` as soon as the provider holds a payout, start it again, wait until it lists the payout (see B4), then assert one payout per booking.
- **Severity:** weak.
- **Closed:** after the two resumes, `restarted` is killed as soon as the provider holds a payout of either booking. A new server is started, and the test settles the payouts once that server lists them (B4's pattern). Each booking is still paid out once.

### W4. Test 76's five wrong codes may arrive after the code has already expired
- **Where:** `acceptance/76-email-verification.acceptance.ts:108-121`.
- **What is missing:** the code is asked for (line 110), and only then is a second server started (line 111). With `EMAIL_CODE_TTL_SECONDS` at 15, a `tsx` start of several seconds, plus a sign-in, can outlast the code. The right code is then refused because it expired, and the case passes whether or not five wrong codes spend it.
- **Request:** `backlog/76-email-verification.md:8`.
- **Suggestion:** start the second server, and sign in there, before asking for the code.
- **Severity:** weak.
- **Closed:** the second server is started, and ian signed in there, before the code is asked for.

### W5. "Counts as lapsed, even before it reads so" is never tested
- **Where:**
  - `acceptance/57-reviews.acceptance.ts:84-85`, `:114`;
  - `acceptance/58-guest-reviews.acceptance.ts:96-97`, `:116`;
  - `acceptance/71-claims.acceptance.ts:90-91`, `:135-140`.
- **What is missing:** every server runs with `JOBS_INTERVAL_SECONDS: '1'`, so the unpaid booking already reads `lapsed` when it is reviewed or claimed. A tree that checks only `status === 'confirmed'` passes.
- **Request:** `backlog/57-reviews.md:6`; the same rule in requests 58 and 71.
- **Suggestion:** run one case on a server with `JOBS_INTERVAL_SECONDS: '3600'`, so that the booking still reads `confirmed` past its `dueBy`.
- **Severity:** weak.
- **Closed for 57 and 58:** a case of each runs on a database of its own with `JOBS_INTERVAL_SECONDS: '3600'`, three days later. The unpaid stay is refused, and a stay declared paid on the same server is reviewed.
- **Left for 71:** request 71 says only "not `lapsed`". It does not say that an unpaid booking past its `dueBy` counts as lapsed before it reads so, so no case was added.

### W6. Test 90 leaves out two rules of request 90 about money
- **Where:** `acceptance/90-card-fees-passed-on.acceptance.ts` (whole file).
- **What is missing:**
  - "a payment that succeeds after its booking lapsed is still refunded whole", card fee line included;
  - "a change of dates is priced as a quote would be today, line or not";
  - a refund's receipt having `cardFee: 0`.
- **Request:** `backlog/90-card-fees-passed-on.md:9`, `:11`, `:12`.
- **Severity:** weak.
- **Closed:**
  - a refund's receipt reads `cardFee: 0` beside its payment's;
  - a change of dates gains the line once the country is listed, and loses it once it is not;
  - in a last case, a payment asked before its booking lapsed (the server started again a day later) succeeds, and is refunded whole, line included.

### W7. No notice test has a service that hangs
- **Where:** tests 55, 66, 75, 76, 86 and 97. `notificationService` (`acceptance/openstay.ts:444-489`) can only refuse; it never delays an answer.
- **What is missing:** "or not answer within two seconds" is in requests 55, 66 and 76. A tree with no timeout on its notice calls waits forever on a service that hangs, and passes every test.
- **Request:** `backlog/55-message-notices.md:8`, `backlog/66-suspending-accounts.md:14`.
- **Suggestion:** give `notificationService` a `delayMs`, as `calendarServer` has, and use it in test 55.
- **Severity:** weak.
- **Closed:** `notificationService(refusals, { hangs })` leaves the first `hangs` attempts of each notice unanswered. Test 55 has a case with a service that never answers the first attempt: the notice is sent again, with the same body, within 4.5 s, and accepted after two attempts. Tests 66 and 76 keep a service that only refuses.

### W8. Test 67 does not check that an entry stays when its review is removed
- **Where:** `acceptance/67-audit-log.acceptance.ts:167-188` checks a listing archived and an account closed.
- **What is missing:** "a review removed" is the first case the request names. A tree that deletes a review's entries with the review passes.
- **Request:** `backlog/67-audit-log.md:18`.
- **Severity:** weak.
- **Closed:** in a last case of 67, a stay is reviewed and the review published (the servers started again 3, then 16 days later), reported, and removed by the decision that upholds the report: its `report-upheld` entry stays. The file's servers now run with a 30-day `PAYMENT_TTL_SECONDS`, so that the unpaid stay took place.

---

## Wording

### R1. "Its viewers read and write nothing" can be read as "viewers neither read nor write"
- **Request:** `backlog/51-conversations.md:11`: "its managers … read and write too … Its viewers read and write nothing."
- **Effect:** the same request lists conversations "as traveller, host, manager or viewer", and requests 52 and 53 say viewers read. So the sentence most likely means "read, and write nothing", but read literally it shuts viewers out. Tests 51:163, 52:53 and 56:60 expect viewers to read.
- **Fix:** "Its viewers read it, and write nothing."
- **Closed:** request 51 says "Its viewers read it, and write nothing."

### R2. Request 52 requires a `404` where request 1 lets the application answer later
- **Request:** `backlog/52-unread-messages.md:8`: "Marking a conversation the caller does not read is answered `404`".
- **Effect:** test 52:112 requires a synchronous `404` from `POST /conversations/{id}/read`. A tree that answers every command `202`, which request 1 allows, gives `202` and then an `ERROR`.
- **Fix:** either say "refused" (and test with `api.refused`), or say in request 52 that this route answers at once.
- **Closed:** a `404` at once would contradict request 1, which lets a change answer later. Request 52 now says "Marking a conversation the caller does not read is refused, as any request about a conversation that does not exist for the caller (request 51)." Test 52 accepts a `202` that ends in `ERROR`, and still wants `404` when the refusal comes at once.

### R3. A payment's month: the webhook's `created`, or OpenStay's clock?
- **Request:**
  - `backlog/81-donations-never-rank.md:8`: "paid during that month (when the provider said `payment.succeeded`, in UTC, by OpenStay's time)";
  - `backlog/82-transparency.md:12`: "in the month the provider said it succeeded, as on the host's statement (request 35)";
  - `backlog/35-host-statement.md:6`: "At the time the provider said it happened (the webhook)".
- **Effect:** the test provider dates its events by the machine's clock, while OpenStay's clock is moved by `CLOCK_OFFSET_DAYS`. Tests 81:162-182, 82:177-219 and 83:146-178 move OpenStay into next month, have the provider say `payment.succeeded`, and expect next month. A tree that dates by the webhook's `created`, as request 35 says and as "when the provider said" invites, files the payment in this month and fails all three. Test 72:154 avoids the question with a wide date range.
- **Fix:** say in 35, 81, 82 and 83 which time to use. For example: "the time OpenStay handled the provider's webhook, on OpenStay's clock".
- **Closed:** requests 81, 82 and 83 now count a payment, a fee or a donation in OpenStay's month, by its clock with `CLOCK_OFFSET_DAYS`, at the moment it learns from `payment.succeeded` that it succeeded, whatever time the webhook carries. That is what the tests read. Request 35 is outside this pass and unchanged: no test of 35 moves the clock.

### R4. "`^` and `$` are implied" with an alternation
- **Request:** `backlog/79-registration-numbers.md:5`: "a regular expression the whole number must match … (`^` and `$` are implied). … groups and `|` are enough".
- **Effect:** wrapping the pattern literally as `^A\d|B\d$` accepts `A1X` and `XB2`. Test 79:150-155 expects them refused, that is `^(?:A\d|B\d)$`. "The whole number must match" supports the test, but "implied" invites the literal wrap.
- **Fix:** "the pattern must match the whole number, as if written `^(?:pattern)$`".
- **Closed:** request 79 says "a regular expression the whole number must match, letters' case included, as if written `^(?:pattern)$`".

### R5. Request 97 names a `review` notice kind that request 75 does not have
- **Request:** `backlog/97-import-conflicts.md:12`: "request 75 turns off only `message`, `booking-requested`, `booking-confirmed` and `review`".
- **Effect:** request 75 has no `review` kind. An agent at request 97 may add one to `PUT/GET /accounts/me/notices`. Test 75 reads those kinds with `toMatchObject`, so no test fails, but the requests disagree on the list of kinds.
- **Fix:** drop "and `review`" from request 97.
- **Closed:** request 97 says "request 75 turns off only `message`, `booking-requested` and `booking-confirmed`".

### R6. Does a conflict that ends and comes back send a second notice?
- **Request:** `backlog/97-import-conflicts.md:9`: "For each conflict, the listing's host gets a notice", against `:11`: "Once per event (its calendar and its `UID`) and booking: … not again when the event moves".
- **Effect:** in test 97:114-119 an event leaves the booking's nights (the conflict is no longer listed) and comes back. The test expects no second notice. "For each conflict" could be read as a new notice for the new conflict.
- **Fix:** "Once per event and booking, ever: an event that leaves the booking's nights and comes back sends nothing more."
- **Closed:** request 97 says "Once per event (its calendar and its `UID`) and booking, ever: not at every sweep, not again when the event moves, nor when it leaves the booking's nights and comes back, not twice with two servers or after a restart."

