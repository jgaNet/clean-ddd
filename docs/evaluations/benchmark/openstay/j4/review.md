# OpenStay J4 test kit: review of tests 25.1 and 26–50

## Scope

I read the support files first: `acceptance/openstay.ts` (client, either-protocol `act`, `start`/`kill`/`stop`, `database()` with SQLite and PostgreSQL) and `acceptance/provider.ts` (the fake provider, `feeOf`, idempotency replays, webhook delivery and retries, `payBooking`/`enabledAccount`). Then I reviewed `acceptance/25.1-hosts-own-routes.acceptance.ts` and `26-*` to `50-*` against `backlog/1-*.md` … `50-*.md` and `25.1-hosts-own-routes.md`, and read requests 1–25 for the behaviour later ones build on. I also checked the J4 amendment in `acceptance/24-collaborators.acceptance.ts:88-99` against request 24.

All paths are relative to `docs/evaluations/benchmark/openstay/j4/`. Line numbers are the line numbers in each file.

I checked every amount by hand: `feeOf`, the cancellation shares, the discounts, extra guests, payouts (paid, less the fee, less refunds), the statement balance, the reconciliation pairs and the tourist tax per city. I found no arithmetic error in any expected value.

**Test 24's amendment matches request 24.** Request 24:10 says "`/hosts/me/…` (requests 21 and 22) cover the listings the caller hosts, as before", and request 22:7 says "Nothing changes when any of them is not the caller's". In the test, `mia` is a host who hosts no listing of her own, and the nights she names (day 50–51) do not clash with any booking. So the only possible reason for the refusal is ownership, and that is the right thing to test. For how the amendment is placed in the test, see W4.

## Severities

- **blocking**: an agent that implements the requests faithfully can fail the assertion.
- **weak**: the test checks clearly less than the request says, on something important.
- **wording**: an ambiguity in a request that would change what an agent writes.

## Totals

| Severity | Count |
| --- | --- |
| Blocking | 6 |
| Weak | 8 |
| Wording | 8 |

---

## Blocking

### B1. Test 41 refuses `fromGuests: 1`, which request 41 allows
- **Where:** `acceptance/41-extra-guest-fee.acceptance.ts:78`, then `:82`
- **Assertion:**
  ```ts
  expect(await api.refused('PUT', path, hal.token, { fromGuests: 1, perGuestPerNight: 1000 })).toBe(true);
  ```
  Then `extraGuests` is expected to still be `null` (line 82).
- **What is wrong:** request 41 allows `fromGuests` from 1 to 20, so 1 is valid. A faithful application accepts this request. The test then fails twice: at line 78, and at line 82, because `extraGuests` now reads `{ fromGuests: 1, perGuestPerNight: 1000 }`. This fails every time, not by chance.
- **Request:** `backlog/41-extra-guest-fee.md:5`: "how many guests the price includes (`fromGuests`, 1 to 20)".
- **Fix:** use `fromGuests: 0`.
- **Severity:** blocking (certain).

### B2. Many tests start the server without the payment provider's variables, and no request says it must start without them
- **Where:**
  - `acceptance/40-postgresql.acceptance.ts:8`, `:42`, `:62`
  - `41-*:89`, `42-*:8`, `43-*:8`, `44-*:8`, `45-*:8`
  - every regression file 1–25.1. They call `start(db.path)` with no `PAYMENT_PROVIDER_URL`, `PAYMENT_PROVIDER_KEY` or `PAYMENT_WEBHOOK_SECRET`.
- **Assertion:** `start()` (`openstay.ts:117-144`) throws "the server exited before it answered" if the process refuses to start.
- **What is wrong:** request 26 introduces the three variables as the application's configuration. It never says the server must start, and serve everything else, when they are missing. Compare request 10, which says it outright for `NOTIFY_URL`. Checking configuration at startup and failing fast is a common, defensible choice. An agent that makes these variables required (or loads the provider client eagerly and throws) fails 16 test files it never touched. Request 30's jobs add a second risk: a job that runs with no provider URL can crash the process with an unhandled rejection.
- **Request:** `backlog/26-payout-accounts.md:5`: "OpenStay works with one payment provider, at `PAYMENT_PROVIDER_URL`, with the key `PAYMENT_PROVIDER_KEY`." Nothing in the request covers its absence. Compare `backlog/10-notify-the-host.md:21`: "**Without `NOTIFY_URL`,** nothing is sent."
- **Fix:** either add to request 26 "Without `PAYMENT_PROVIDER_URL`, the server starts and serves everything that does not move money", or have `start()` always pass a provider environment (for example an unused `paymentProvider()`).
- **Severity:** blocking (likely for a subset of agents, and it costs every non-payment file).

### B3. Test 33 resends `payout.paid` after the crash possibly before the restarted application has learned about the payout again
- **Where:** `acceptance/33-payouts.acceptance.ts:96-110`, asserted at `:117-121`.
- **Assertion:** the test kills the server as soon as the provider holds the payout (`payoutsFor(before).length > 0`, polled every 50 ms). It waits for the provider to settle the payout. Then it resends the `payout.*` events "said while the server was down", and finally expects both payouts to read `paid`.
- **What is wrong:** suppose the kill lands between the provider answering `POST /payouts` and the application committing the payout. The window is small, but the test aims for it. Then a correct application (stable `Idempotency-Key`, re-posted by the job after the restart, as request 33 and the provider's API invite) does not yet know payout `po_…` when `payout.paid` arrives. Here is why the webhook can arrive first:
  - the first delivery keeps retrying every 500 ms, and reaches the new port right after `attach`;
  - the explicit resend at line 110 is chained straight after it.

  Both deliveries can therefore arrive before the application's job (every 1 s) has run. Request 29 says a webhook about something unknown is answered `2xx` and changes nothing. So both are consumed and ignored. When the job then re-posts, the provider replays the creation answer with `status: "pending"`. The payout stays `pending` in the application forever, and lines 117-121 fail. Whether this happens depends on timing and design, not on whether the application is correct.
- **Request:** `backlog/33-payouts.md:7`: "once per booking: never twice, even across a crash", and `backlog/29-webhooks-as-they-come.md:7`: "A valid webhook about something OpenStay does not know … is answered `2xx` and changes nothing."
- **Fix:** before resending, wait until the restarted application lists the `before` payout:
  ```ts
  await eventually(() => api.list('/hosts/me/payouts', token), f => f.some(p => (p.bookingIds as string[]).includes(before)))
  ```
  Then resend the events. Alternatively, have request 33 say that a payout the application does not know yet is matched by its `reference`.
- **Severity:** blocking (a race, for one legitimate design).

### B4. Test 26 sends a valid webhook that contradicts the provider's own record
- **Where:** `acceptance/26-payout-accounts.acceptance.ts:78`, `:87-93`.
- **Assertion:** `provider.signed('account.updated', { ...account, status: 'enabled' })`, then the test expects the host's account to read `enabled`.
- **What is wrong:** the provider's own account object is still `pending`, because the test never calls `provider.account(id, 'enabled')`. Request 26 lists `GET /accounts/{id}`. Treating a webhook as a notification and reading the object back is a common pattern, and a defensible one for "the provider is the only one who knows". An application that does this reads `pending` and keeps `pending`, so lines 88-93 fail. No other test sends a webhook whose content disagrees with the provider's state:
  - test 29's `signed` calls concern unknown objects;
  - in test 29 the out-of-order case keeps the provider's state `succeeded`.
- **Request:** `backlog/26-payout-accounts.md:8`: "An account is `pending` until the provider says it is `enabled`, or `disabled`, by an `account.updated` webhook." The provider API at `:28` offers `GET /accounts/{id}`.
- **Fix:** set `provider.accounts.get(account.id)!.status = 'enabled'` before the valid `signed(...)`. Alternatively, have request 26 say that a webhook's `data` is to be believed as sent.
- **Severity:** blocking (less likely, but a legitimate design).

### B5. Test 46 needs a receipt order that can tie when times are in whole seconds
- **Where:** `acceptance/46-receipts.acceptance.ts:30-40`.
- **Assertion:** `/receipts/mine` lists `[['refund', id], ['payment', id]]` (most recent first).
- **What is wrong:**
  - The refund is created right after `payBooking` returns, and the provider settles it after 200 ms. So `payment.succeeded` and `refund.succeeded` usually carry the same `created` second.
  - Request 35 tells agents to date money movements "at the time the provider said it happened (the webhook)". An application that stamps receipts with the webhook's `created` (whole seconds) and sorts by `at` has a tie, and the database's order for it is arbitrary (often insertion order, which puts the payment first).
  - Test 33 avoids exactly this with `sleep(1100)` (`33-payouts.acceptance.ts:114`). Test 46 does not.
- **Request:** `backlog/46-receipts.md:5` and `:7`: "the amount …, and when" and "the most recent first". The request does not say whether "most recent" is by `at` or by `number`.
- **Fix:** `await sleep(1100)` before creating the refund, or have request 46 say "by number, the highest first".
- **Severity:** blocking (timing-dependent, for one plausible design).

### B6. Dates computed when the test module loads, and server restarts in the middle of a test, near midnight UTC
- **Where:**
  - `acceptance/47-weekly-payouts.acceptance.ts:20-21` (`TODAY`, `ANOTHER_DAY`)
  - `48-earnings-by-month.acceptance.ts:20-21` (`MONTH`, `YEAR`)
  - `openstay.ts:110-118` (`awayFromMidnight` inside `start()`)
  - restarts in the middle of a test: `29-*:56`, `33-*:101`, `46-*:54-55,78`
- **Assertion:**
  - Test 47 sets the weekday to `TODAY` and expects a payout (`:63-70`).
  - Test 48 expects `month: MONTH` (`:44-56`, `:73`).
  - Restarted tests have timeouts of 120/180 s.
- **What is wrong:**
  - Jest evaluates the module-level constants before `beforeAll`. If the file starts within 3 minutes of midnight UTC, `start()` sleeps past midnight, and `TODAY` becomes yesterday's weekday. Test 47 then waits for a payout that, correctly, never comes. Test 48 is affected only at a month or year boundary.
  - The midnight guard also runs inside the restarts in the middle of tests. A restart near midnight can sleep up to 3 min 5 s and exceed the 120 s timeout of tests 29 and 33.
  - These failures are rare, but they do not depend on the application.
- **Request:** `backlog/47-weekly-payouts.md:6`: "On that weekday (in UTC), everything due to the host is paid in one payout".
- **Fix:** compute `TODAY`, `ANOTHER_DAY`, `MONTH` and `YEAR` inside the tests (after `beforeAll`). Apply the midnight guard once per file, not on restarts.
- **Severity:** blocking (rare, but it does not depend on the application).

---

## Weak

### W1. No test includes tourist tax in a payout
- **Where:** `acceptance/33-payouts.acceptance.ts:26` (`DUE = 12000 - feeOf(12000)`). The same holds for 34, 35, 37, 39, 47 and 48: every listing that is paid out has `touristTax` 0.
- **What is missing:** request 33 goes out of its way to say the tax is part of the payout. Request 5 says the tax is "collected for the city, not for the host". An agent that pays out only the `host` lines (total less the `external` line) passes every payout test.
- **Request:** `backlog/33-payouts.md:5`: "the host is owed what was paid (the booking's total), less the provider's fee …, less what was refunded of it … The tourist tax goes to the host with the rest".
- **Suggestion:** give one of the payout tests a tax (for example test 33's first case with `perGuestPerNight: 100`) and expect `12100 - feeOf(12100)`.
- **Severity:** weak.

### W2. Duplicate and out-of-order webhooks are tested for payments only, never for refunds or payouts
- **Where:**
  - `acceptance/29-webhooks-as-they-come.acceptance.ts:42-80`: only `payment.*` events, and the "twice" case checks only `status: 'paid'`, which is idempotent by nature.
  - `provider.state.twice` is never set after test 29.
  - No test sends `payout.failed` after `payout.paid`, or `refund.succeeded` twice.
- **What is missing:** the two cases that would cost money are untested:
  - a `payout.failed` arriving after `payout.paid` makes request 34's logic pay the booking a second time;
  - a duplicated `refund.succeeded` doubles `payment.refunded`, which then cuts the payout (request 33) and the statement.
- **Request:** `backlog/29-webhooks-as-they-come.md:6`: "A refund and a payout move from `pending` to `succeeded` (`paid`) or `failed`, and a success is final"; and `backlog/34-failed-payouts.md:7`: "A failed payout and the one that replaces it never both read `paid`".
- **Suggestion:** in 34, `provider.resend` a `payout.failed` built from a paid payout, and assert no third payout. In 31, set `state.twice = true` around `settleRefund` and assert `payment.refunded` equals the refund once.
- **Severity:** weak.

### W3. "Sent once" for payouts and refunds is never tested with two servers, and repeated requests are tested only one after another
- **Where:**
  - Two servers: `acceptance/40-postgresql.acceptance.ts:54-80` tests booking only, and `46-*:51-98` has no payout due (check-ins day 10+).
  - Double requests: `26-*:39-43` and `27-*:130-134` send their repeated requests one after the other.
- **What is missing:**
  - Two servers running the payout or refund jobs on one database can each post a payout or a refund.
  - Two `POST /bookings/{id}/pay` (or two `POST /hosts/me/payout-account`) sent at the same moment can open two provider objects.

  None of this is exercised.
- **Request:** `backlog/40-postgresql.md:6`: "two servers on one database, a server killed at any moment …, a payment, a refund or a notice sent once"; `backlog/27-pay-a-booking.md:6`: "never a second one"; `backlog/26-payout-accounts.md:7`: "never a second one".
- **Severity:** weak.

### W4. Test 24's amendment sits in the middle of a case, and test 25.1 never tests a mix of listings
- **Where:** `acceptance/24-collaborators.acceptance.ts:88-99`; `25.1-hosts-own-routes.acceptance.ts:31-41`.
- **What is missing:**
  - A tree that has not fixed the defect fails at line 89, and the rest of the case (lines 101-114: members' `/listings/mine`, readers of the organisation) is no longer graded for it. The same defect is also counted twice, in 24 and in 25.1.
  - Test 25.1 sends `listingIds: [listing]` only. It never sends a manager's own hosted listing together with the owner's listing to check that the manager's own listing is left unchanged too. An application that silently drops the listings the caller does not host, and blocks the rest, would be caught only if it also answered `2xx`.
- **Request:** `backlog/25.1-hosts-own-routes.md:8`: "refuse any listing the caller does not host … and change nothing (request 22: all or nothing)".
- **Suggestion:** move the amendment into its own `it`. In 25.1, give `mia` a listing of her own, send both, and assert her own calendar is unchanged.
- **Severity:** weak.

### W5. Test 35 sorts the statement lines before comparing them
- **Where:** `acceptance/35-host-statement.acceptance.ts:70`, `:73`.
- **What is missing:** the test compares sorted strings, and checks only that the times do not decrease. A statement that puts `fee` before `charge`, or that orders lines with equal times arbitrarily, passes.
- **Request:** `backlog/35-host-statement.md:6`: "a payment's charge comes before its fee"; and `:5`: "the oldest first".
- **Suggestion:** compare `movements(read.lines)` without sorting. The expected order is deterministic here.
- **Severity:** weak.

### W6. Test 46 accepts a negative refund amount
- **Where:** `acceptance/46-receipts.acceptance.ts:42`: `expect(Math.abs(Number(receipts[0].amount))).toBe(5000)`.
- **What is missing:** the request says the amount is positive for a refund too, but the test takes the absolute value.
- **Request:** `backlog/46-receipts.md:5`: "the amount (positive, for a refund too)".
- **Suggestion:** `toBe(5000)`.
- **Severity:** weak.

### W7. Test 36 checks the absence of refunds and payouts by `reference` only
- **Where:** `acceptance/36-direct-payment.acceptance.ts:44`, `:74`.
- **What is missing:** the filter is `each.reference === bookingId` or `=== declared`. An application that refunded a declared booking under any other reference would pass. At those points the provider should hold no refund at all in the file, and no payout to that host's account.
- **Request:** `backlog/36-direct-payment.md:7`: "gives no payout … A cancellation of it refunds nothing through the provider."
- **Suggestion:** assert `provider.refunds.size === 0` at line 74, and no payout to `hal`'s account at line 44.
- **Severity:** weak.

### W8. No test caps the cancellation's refund at what is left after the host's refunds
- **Where:** `acceptance/32-host-refunds.acceptance.ts:54-80`. The refunds total 3000 + 11000 against 22000 paid, so the cap is never reached.
- **What is missing:** the case where earlier host refunds plus the cancellation's refundable amount exceed what was paid. Two things are untested:
  - whether the cancellation's refund is cut to what is left;
  - what `refund.amount` then reads.

  An application that sends the full refundable amount gets a `400` from the provider and retries it forever.
- **Request:** `backlog/32-host-refunds.md:6`: "All the refunds of a booking together (the cancellation's and the host's) never exceed what was paid." See also R5.
- **Severity:** weak.

---

## Wording

### R1. "The booking is `paid`" can be read as a new booking status
- **Request:** `backlog/27-pay-a-booking.md:7`: "**Paid.** The booking is `paid` when the provider says so". The API table (`:24`) puts `paid` in `payment.status` only.
- **Effect:** the backticked value reads like a booking `status`. An agent that sets `booking.status = 'paid'` fails two assertions:
  - `30-unpaid-bookings-lapse.acceptance.ts:71-74` expects `status: 'confirmed', payment: { status: 'paid' }`;
  - `36-*:41` expects `confirmed` for a declared booking.
- **Fix:** "Its payment reads `paid` …; the booking stays `confirmed`."

### R2. Request 30 points forward to request 31
- **Request:** `backlog/30-unpaid-bookings-lapse.md:7`: "refunded in full, through the provider (request 31's refund, made by OpenStay)".
- **Effect:** an agent that implements 30 without 31 in front of it cannot read what "request 31's refund" means: its reference, its statuses, and its retry when it fails. The provider's `POST /refunds` (request 26) is enough to pass test 30, but the reference and the retry will be guessed, and then possibly reworked at 31.
- **Fix:** state it in place: "a refund of the whole payment, through the provider's `POST /refunds`, with the booking's id as the `reference`".

### R3. Cancelled bookings get no payout, yet "OpenStay never keeps any of it"
- **Request:**
  - `backlog/33-payouts.md:6`: payout "Once the booking's check-in date has begun …, and the booking is not cancelled or lapsed";
  - `backlog/26-payout-accounts.md:3`: "It never keeps any of it: what travellers pay goes to the hosts".
- **Effect:** a paid booking cancelled under `strict` or `moderate` keeps part of its total, and by request 33 that part is never paid to anyone. An agent has to choose between the two sentences: either pay out the part that was not refunded, or not. No test decides it.

### R4. A weekly payout's `reference`, its `bookingId` on the statement, and how reconciliation matches it
- **Request:**
  - `backlog/33-payouts.md:7`: "with the booking's id as the `reference`";
  - `backlog/47-weekly-payouts.md:6`: "one payout, which lists the bookings it pays";
  - `backlog/35-host-statement.md:16`: `{ at, type, bookingId, amount }`;
  - `backlog/37-reconciliation.md:7`: pairs by `type` and `reference`.
- **Effect:** a payout of several bookings cannot carry one booking id. An agent implementing 47 may switch every payout's reference to an id of its own. That breaks tests 33, 34, 35 and 39, which find daily payouts by `reference === bookingId`:
  - `33-*:22`, `34-*:22`, `35-*:41-45`, `39-*:20`.
- **Fix:** say that daily payouts keep the booking id, give the weekly reference, and say how a weekly payout appears on the statement.

### R5. Do earlier host refunds count against the cancellation's refundable amount?
- **Request:**
  - `backlog/31-refunds.md:5`: "OpenStay asks the provider to refund the booking's refundable amount";
  - `backlog/32-host-refunds.md:6`: "All the refunds … together … never exceed what was paid."
- **Effect:** an agent may send "refundable less what was already refunded". In test 32 that is 11000 − 3000 = 8000, but `32-host-refunds.acceptance.ts:67-71` expects 11000. The cap case is also unspecified (see W8).

### R6. Changing the dates of a paid booking
- **Request:** `backlog/19-change-dates.md:6` replaces the lines and the total. Requests 27, 31 and 33 assume that the total is what was paid.
- **Effect:** for a paid booking whose new total differs, no request says what happens:
  - whether the change is refused;
  - whether the difference is charged or refunded;
  - whether `payment.amount` follows the new total.

  Agents will guess.

### R7. Does a code that was not applied use up a use?
- **Request:** `backlog/43-promotion-codes.md:7`: "A quote keeps its code … only when the code's discount is the one it applied; otherwise its `code` is `null`. A booking made from a quote with a code uses one use of it."
- **Effect:** "a quote with a code" can mean a quote given with a code, or a quote whose `code` is not `null`. The two readings consume uses differently. No test decides between them.

### R8. Do declared payments count as "paid" in request 38 and request 48?
- **Request:** `backlog/38-tourist-tax-collected.md:5`: "the tourist tax … of the host's paid bookings"; `backlog/36-direct-payment.md:6`: "A declared payment is never shown as paid through OpenStay".
- **Effect:** a host paid directly still collected the tax and must remit it. Whether declared bookings count is open, and no test decides it.
