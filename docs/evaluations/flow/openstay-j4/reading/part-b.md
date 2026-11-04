# J4 reading, part B: O2, O3, O7, O8

Reader: fresh agent, read only, at `main` of `/runs/openstay/<tree>/app`. Rubric: `docs/evaluations/benchmark/openstay/j4/reading.md`; requests: J4 backlog 4, 6, 7, 19, 20, 22, 26, 27, 29 to 34, 36, 39, 40, 43, 46, 47.

## Summary

| Tree | O2 no night twice | O3 refusal is an outcome | O7 crash / second process / repeated webhook | O8 money never exceeds |
| --- | --- | --- | --- | --- |
| simple-1 | pass | pass | pass | pass |
| simple-2 | pass | pass | **fail** | **fail** |
| simple-3 | pass | pass | partial | pass |
| clean-1 | pass | pass | pass | pass |
| clean-2 | pass | pass | partial | pass |
| clean-3 | pass | pass | partial | pass |

## Conventions I applied to every tree

1. **Request 40.** Every tree took the same step at request 40: every write transaction takes one PostgreSQL advisory lock that applies to the whole database (`pg_advisory_xact_lock(<constant>)`) right after `BEGIN`. Writers, in this process and in any other process on the database, therefore run one at a time. The lock arrived in the request-40 commit of each tree: simple-1 `bf6eb25`, simple-2 `2913461`, simple-3 `cf3df77`, clean-1 `16d6ae9`, clean-2 `9c30cf0`, clean-3 `256265c`. If the check (a read) and the write both run inside such a transaction, I count them as "one transaction behind a lock". For each path I check two things: that the read happens inside the locked transaction and not on a separate pool beforehand, and that a check made before the transaction is made again inside it.
2. **Night tables.** Each tree also has a per-night primary key (`(listing_id, night)`) on its booked, held and blocked night tables, or the clean trees' calendar version. I count these as a second guard. They are not the main one, because a primary key cannot stop a booked night from colliding with a blocked night in another table.
3. **O3 and "without throwing".** The simple trees signal a refusal by throwing a typed error (`HttpError` or `Refusal`) that one handler maps to a 4xx. simple-2 and the clean trees return values instead (`Problem` or `Result`). I graded the behaviour: does every named refusal end as a 4xx or ERROR, and is a provider error or timeout a refusal or a retry rather than a 500 or a dead process. A typed refusal caught at one boundary passes. Under the strict reading of "without throwing", simple-1 and simple-3 would drop a level; the mechanism is recorded per tree so the grade can be redone that way. All six trees answer a provider that is missing or not answering with a deliberate 502 or 503 (`503` when no provider is configured). That is a refusal, not a crash, so I did not downgrade for it. It is still a status other than the 4xx request 1 names, and I note it once here.
4. **O7 windows.** For each call to the provider (open an account, create a payment, refund, payout) I name the gap between the call and the write that records it, and say whether a crash there can (a) make the provider act twice, through a new idempotency key, or (b) lose the record, so that a later webhook for it is consumed and dropped. "Suspected" means the reading strongly suggests it but needs a run to confirm. A key reused after the provider refused is a liveness issue: the provider replays its first answer, the refusal, so the thing is stuck rather than doubled. Almost every tree has it (see the per-tree notes), so it does not change any grade on its own.
5. **O8 versus O7.** Concurrency (two requests, two servers) is graded under O8. Crash windows are graded under O7, so the same defect is not counted twice.
6. **Sub-checks.** The fee as the provider gave it, `verified` only for a provider success, and cancelled versus refunded as separate states hold in all six trees, for example simple-2 `src/payments/payment.ts:74` and clean-2 `src/Contexts/Payments/Infrastructure/PostgresPayments.ts:257`. They do not separate any tree.

---

## O2: no night twice, under concurrency

**simple-1: pass.**
- Booking is created inside `inWriteTransaction` (`src/bookings/bookings.ts:204`, lock at `src/database.ts:575-579`). The night check (`bookings.ts:225`) and the `booked_nights` insert (`bookings.ts:592`, PK at `database.ts:221-226`) are inside it.
- Change of dates (`bookings.ts:403`), hold (`src/holds/holds.ts:191`, `held_nights` PK at `database.ts:173-178`) and block / bulk block (`src/listings/listings.ts:454`) use the same locked transaction. A bare `run()` outside a transaction takes the lock too (`database.ts:511-516`).
- A lapse deletes the booked nights and sets `lapsed` in one locked transaction (`src/bookings/lapse.ts:46,50-54`).

**simple-2: pass.**
- `Database.transaction` takes the lock after `BEGIN` (`src/database.ts:435-451`, lock at 442).
- Booking (`src/bookings/bookings.routes.ts:572-592`) checks the nights (`:225`) and inserts `booked_nights` (`src/bookings/booking-store.ts:250`, PK at `database.ts:165-170`). A unique violation is mapped to a refusal (`bookings.routes.ts:589`).
- Hold: `src/holds/holds.routes.ts:50`. Single and bulk block: `src/listings/listing-store.ts:241-268`, all checks before any write. Change of dates: `bookings.routes.ts:684`.
- A lapse frees the nights in its own transaction (`src/bookings/lapse.ts:33-41`).
- `Problem` values are returned without a rollback, but on every night path I read the checks come before the writes.

**simple-3: pass.**
- `Database.transaction` locks (`src/database.ts:79-104`, lock at 88).
- Booking: `src/bookings/bookings.ts:191-262`, check at `:214`, insert at `:259`. Change of dates: `:367-404`. Hold: `src/holds/holds.ts:94,130`. Single and bulk block: `src/listings/listings.ts:752-770`, which checks booked and held nights before inserting.
- A lapse updates the status and deletes the nights together (`src/bookings/expiry.ts:41-45`). It is called inside a transaction (`src/app.ts:158`).

**clean-1: pass.**
- Every command runs in `context.withTransaction` (`src/Architecture/Application/CommandHandler.ts:83-97`). That transaction runs on the single writer connection under the advisory lock (`src/Architecture/Infrastructure/Postgres/PostgresDatabase.ts:52,222-226`).
- The `ListingCalendar` is read on that writer and saved with `UPDATE … WHERE version = ?`, with the night tables behind a unique key (`src/Contexts/Booking/Infrastructure/Postgres/PostgresListingCalendarRepository.ts:17-91`).
- Booking: `BookStayCommandHandler.ts:99,118,121`. Change of dates: `ChangeBookingDatesCommandHandler.ts:103-107`. Hold: `HoldNightsCommandHandler.ts:88-92`. Bulk block saves every calendar in one transaction (`BlockNightsInListingsCommandHandler.ts:17`).
- A lapse sets the booking and frees its calendar nights in one transaction (`Application/Sweeps/LapseUnpaidBookingsSweep.ts:24-47`).

**clean-2: pass.**
- `begin()` queues per process and takes the advisory lock (`src/Architecture/Infrastructure/PostgreSQL/PostgresDatabase.ts:114-134`).
- The calendar is versioned (`src/Contexts/Booking/Infrastructure/PostgresCalendars.ts:22-36,72`). Booking: `BookStayCommandHandler.ts:85-103`.
- A lapse saves the booking and frees the calendar in one transaction (`Application/Sweeps/LapseUnpaidBookingsSweep.ts:29,42-60`).
- Side note, not O2: an ordinary `query()` made in this process while another request's transaction is open runs inside that transaction (`PostgresDatabase.ts:92-97`, one `#client` for the whole process). So a read from another request can see writes that are not yet committed.

**clean-3: pass.**
- Same model: per-process turn plus advisory lock (`src/Architecture/Infrastructure/Postgres/PostgresUnitOfWork.ts`; lock at `PostgresDatabase.ts:159-162`).
- The calendar is versioned (`src/Contexts/Booking/Infrastructure/PostgresListingCalendars.ts:38-40,88`). Booking: `BookStayCommandHandler.ts:129-145`.
- A lapse frees the calendars and saves the bookings in one transaction (`Commands/LapseUnpaidBookings/LapseUnpaidBookingsCommandHandler.ts:31-50`).

---

## O3: a refusal is an outcome, not a crash

**simple-1: pass (thrown `HttpError`).**
- Refusals throw `HttpError`. One error handler answers 4xx, or 502/503 (`src/http.ts:17-26`). A throw inside a transaction rolls it back (`src/database.ts:519-540`).
- The provider client turns a timeout (10 s) or a 5xx into `unanswered` (retried with the same key) and a 4xx into `refused` (`src/payments/provider.ts:183-200`). A failure in a request path is a 502 (`provider.ts:79-81,202-218`).
- The background jobs swallow a failed round and retry it (`src/jobs.ts:49-56`).

**simple-2: pass (`Problem` values).**
- Routes return `Problem` objects with a status, and a unique violation becomes a refusal (`src/bookings/bookings.routes.ts:586-592,697`).
- `ProviderError` becomes `PAYMENT_NOT_MADE` (502) on pay (`bookings.routes.ts:749-752`). In the jobs it is caught and retried (`src/payments/refund-job.ts:26-30`, `payout-job.ts:35-39`).
- `JobRunner` reports a failed job and goes on (`src/jobs/job-runner.ts:52-60`).

**simple-3: pass (thrown `Refusal`).**
- `Refusal` maps to its status (`src/errors.ts:4-29`). A provider failure becomes `Refusal(503)` (`src/payments/provider.ts:156-233`).
- Suspected crash path: a valid `refund.succeeded` / `refund.failed` webhook can fail with a unique-key violation and answer 500 (see O7, `src/payments/refunds.ts:282,302`). The provider retries it; the process does not die. This is a defect, but it is graded under O7.

**clean-1: pass (`Result`).**
- Refusals are `Result.fail`. The base handler turns a stray throw into a failed Result (`src/Architecture/Application/CommandHandler.ts:99-106`).
- `HttpPaymentProvider` returns `Result.fail(PaymentProviderUnavailable)` on a timeout or a non-2xx (`src/Contexts/Payments/Infrastructure/Http/HttpPaymentProvider.ts:140-148`), which is answered 503 (`PaymentController.ts:86`).

**clean-2: pass (`Result`).**
- The same base handler applies. The sweeps log a failed Result and go on (`src/Contexts/Payments/Application/Sweeps/RequestRefundsSweep.ts:28-34`, `PayoutsSweep.ts:75-82`).
- A provider refusal is counted on the refund (`RequestRefundsSweep.ts:54-60`).

**clean-3: pass (`Result`).**
- The same base handler applies. In `RequestOwedRefunds` and `RequestOwedPayouts`, a provider failure is skipped for that item (`continue`) while the other items go on (`Commands/RequestOwedRefunds/RequestOwedRefundsCommandHandler.ts:35-40`, `Commands/RequestOwedPayouts/RequestOwedPayoutsCommandHandler.ts:44-50`).
- Note: `PostgresPromotionCodeUses` rethrows a database error out of the overridden `BookStay.handle` (`src/Contexts/Pricing/Infrastructure/PostgresPromotionCodeUses.ts:72-74`, `BookStayCommandHandler.ts:49-62`). That only happens on a database error, which counts as a programming or corrupt-state error.

---

## O7: a crash, a second process or a repeated webhook loses or doubles nothing

**simple-1: pass.**
- Webhook: the event id is checked, the change applied and the id recorded in one locked transaction (`src/payments/webhook-events.ts:23-38`). Out-of-order events are guarded: payments by `status = 'pending'` (`booking-payments.ts:280-311`), accounts by `status_at <= ?` (`payout-accounts.ts:90-94`), refunds and payouts by "pending only".
- Payment: the provider call (`booking-payments.ts:228`) comes before `keep()` (`:341-357`). The key `payment:<booking>:<attempt>` is the same after a crash, so nothing doubles. The `payUrl` is handed out only after `keep`, so no success webhook can arrive before the record.
- Refund: a `requested` row is written under the lock first (`refunds.ts:144-157,387-400`). The provider is then called with `refund:<payment>:<n>` or `refund:<id>:<n>` (`:299-302`), and the answer is recorded in a new transaction (`:306-323`). After a crash, the same key replays the same refund. A webhook that arrives first is stored, then joined to the request (`:205-212,330-348`).
- Payout: a `requested` payout and a batch are kept first (`payouts.ts:187-264`). The provider is called with `payout:<batchId>` (`:289-294`) and the answer recorded (`:298-314`). A webhook that arrives first is joined by reference and amount (`:147-155`).
- A refusal leads to a new key (`refunds.ts:316`, `payouts.ts:311-312`).
- Receipt: numbered inside the success's own transaction, with one receipt per success (`receipts.ts:37-48`).
- Two servers: every sweep re-checks under the lock (`payouts.ts:207`, `refunds.ts:239-268`).

**simple-2: fail.**
- Second process doubles a payout. `payOwedHosts` reads the candidates outside any transaction (`src/payments/payout-job.ts:99`). It then calls `payouts.keep()` (`:125,129`), whose locked transaction does not check again for a live payout (`src/payments/payout-store.ts:127-155`). Instead it derives the key from how many payouts the booking already has (`:135-141`).
- How it plays out: two servers run the job at the same moment (each has its own `JobRunner`, `src/jobs/job-runner.ts:9-61`, `src/app.ts:172-177`, with no lock across processes). Both read the booking as due. The second `keep` sees `count = 1`, gets `payout:<booking>:1`, and the provider pays again. A weekly payout uses a random id as its key (`:131-132`), so it doubles the same way.
- Crash or race window, refunds: `provider.refund` (`refund-job.ts:18`) is followed by `refunds.keep` (`:19`). A `refund.succeeded` that arrives in between finds no row. `markSucceeded` changes nothing (`refund-store.ts:228-238`) and the event id is still recorded (`webhook.routes.ts:176-185`). The refund stays `pending` for ever, with no receipt (suspected).
- Same window for payouts: `provider.payout` (`payout-job.ts:33`) is followed by `opened()` (`:34`, `payout-store.ts:229`). A `payout.paid` that arrives in between is dropped (`payout-store.ts:241-246`) (suspected).
- Payment window `bookings.routes.ts:739-747`: safe. The key is `payment:<booking>:<count>`, and the `payUrl` is handed out only after `keep`.
- A refusal reuses the same key (`refund-job.ts:16`, payout `askAgain`), so the item is stuck (suspected).
- Webhook dedup itself is correct: id and effect in one locked transaction (`webhook.routes.ts:176-185`). Receipts are numbered in the success's transaction (`receipt-store.ts:32-47`, `payment-store.ts:106-116`).

**simple-3: partial.**
- Sound parts:
  - The webhook id and its effect are in one locked transaction (`src/payments/webhook-events.ts:15-28`).
  - Payment, refund and payout each keep an `opening` row before calling the provider, keyed by that row's id: payment `booking-payments.ts:221,246-249`; refund `refunds.ts:146-170,186-195`; payout `payouts.ts:88-130,142-149`. Sweeps re-check under the lock (`payouts.ts:105`). Nothing doubles on a crash.
  - Receipts are numbered under the lock in the success's transaction (`src/receipts/receipts.ts:24-37`).
  - A payout webhook that arrives first is joined by reference (`payouts.ts:161-185`).
- Refund webhook defect (suspected, strong by reading): `applyReport` picks every live refund of the payment whose `provider_id` is null or equals the event's (`refunds.ts:282`) and writes the event's provider id onto each (`:302`). `refunds.provider_id` is `UNIQUE` (`src/database.ts:396`).
  - Trigger: a second refund of the same payment is still `opening`. A host refund waits up to `JOBS_INTERVAL_SECONDS` before it is asked.
  - Effect: the update violates the unique key, the transaction rolls back, and the webhook answers 500. The provider stops after its 20 retries in about 10 s, so the event is lost and the first refund stays `pending` with no receipt. If no violation occurs, the success can land on the wrong refund.
- A refusal leaves the row `opening` with the same key (`refunds.ts:187-191`, `payouts.ts:143-147`). The provider replays its refusal, so the item is stuck (suspected).

**clean-1: pass.**
- Webhook: payment, refund and dispute events record their id in the transaction that applies them, and only for a payment that is known (`Commands/ApplyProviderPaymentEvent/ApplyProviderPaymentEventCommandHandler.ts:83-86`). Payout events are the same (`ApplyProviderPayoutEventCommandHandler.ts:36-39`). A failure answers 500, so the provider retries (`WebhookController.ts` `receive`, `reply.code(500)`).
- Payment: the provider call runs inside the command transaction (`PayBookingCommandHandler.ts:56-67`), keyed `payment:<id>:<version>`. A crash rolls back, and the retry reuses the same version and key.
- Refund: owed refunds are durable before the call (`Payment.ts:458,489-501`). `AskOwedRefundsSweep.ts:24-36` calls the provider outside a transaction with `refund:<refundId>:<attempt>`, then records the answer in its own transaction (`:34-36`). A crash in between leaves the refund owed under the same key. A `refund.succeeded` that arrives first is matched to the owed refund of that amount (`Payment.ts:653-660`).
- Payout: an owed payout is opened in its own transaction, re-checked there (`AskPayoutsSweep.ts:82-101`; at most one live payout per booking, `payoutSchema.ts:25,38`). It is then asked with `payout:<reference>:<attempt>`, where the reference is the booking id or the payout's own stored id (`:64-69`), and recorded (`:72`). A `payout.paid` that arrives first is matched by reference (`ApplyProviderPayoutEventCommandHandler.ts:36`).
- Receipt: `UPDATE receipt_counters … RETURNING` in the success's transaction (`PostgresReceiptNumbers.ts:13-20`).
- Suspected liveness issue: a provider refusal keeps the same key, so the refusal is replayed (`AskOwedRefundsSweep.ts:32`, `AskPayoutsSweep.ts:70`).

**clean-2: partial.**
- Sound parts: the webhook id is checked and recorded in the transaction of its effect (`Commands/ApplyPaymentEvent/ApplyPaymentEventCommandHandler.ts:52-57`, `ApplyPayoutEvent/ApplyPayoutEventCommandHandler.ts:27,50`). Every provider call runs inside the locked transaction, so two servers cannot interleave and no webhook can be applied before the record commits:
  - payment: `PayBookingCommandHandler.ts:50-65`, key `payment:<id>:<attempt>`;
  - refund: `Sweeps/RequestRefundsSweep.ts:28,48-66`, key `refund:<id>:<attempt>`, and a refusal moves to a new key (`:56`);
  - payout: `Sweeps/PayoutsSweep.ts:61-69,125-145`.
- Window 1 (suspected), refunds and payouts: when a crash rolls the transaction back after the provider acted, the provider's id is not stored. The provider's `refund.succeeded` or `payout.paid` then finds nothing. The refund is looked up by provider id only (`Payment.ts:540-545`); the payout by provider id only (`ApplyPayoutEventCommandHandler.ts:30`). The event is still recorded (`:50`; `ApplyPaymentEventCommandHandler.ts:57`). The next sweep asks again under the same key and stores the item `pending` / `requested`, and it stays there: no `refunded` or `paid` state, no receipt, no ledger line.
- Window 2 (suspected), doubling payouts: a weekly payout's reference is a hash of the host and the set of bookings it pays (`PayoutsSweep.ts:119,168-173`), and the key is built from that reference (`:129`). If a crash rolls back a payout the provider already made, and a booking becomes due before the next run, the set changes. The reference and key change with it, and the provider pays the earlier bookings a second time.
- Window 3 (suspected), daily payouts: if a refund settles after the crash, `payable` changes, but the same key replays the old amount. That fails `InvalidProviderPayout` (`:132-133`) for ever, while the provider has already paid the old, larger amount.

**clean-3: partial.**
- Sound parts:
  - Webhook id and effect are in one transaction (`Commands/ApplyPaymentEvent/ApplyPaymentEventEventCommandHandler.ts`, `events.has` then `events.record`; `ApplyPayoutEventEventCommandHandler.ts:33,56`).
  - Payment: the call is inside the transaction with `payment:<id>:<attempt>` (`PayBookingCommandHandler.ts:49-59`).
  - Refunds: owed refunds are durable before the call, keyed `refund:<id>:<attempt>` (`RequestOwedRefundsCommandHandler.ts:35-49`), and a success that arrives first is matched by amount (`Payment.ts:474-485,784`).
  - Receipt counter update is in the success's transaction (`PostgresReceiptNumbers.ts:17-20`).
- Payout window (suspected, doubling): `RequestOwedPayouts` opens the owed payout, calls the provider and saves, all in one command transaction (`RequestOwedPayoutsCommandHandler.ts:35-58,97-116`). A crash after `provider.payout` (`:44`) therefore rolls back the intent as well. For a weekly host the reference is `uuidv5(host:day)` (`src/Contexts/Payments/Domain/Payout/Payout.ts:96-99`) and the key is `payout:<reference>:<attempt>` (`:166-168`). If the next run falls on another day, which for a weekly host is the next weekday, the key differs and the same bookings are paid again. Within the same day, a changed set of bookings makes the amount differ from the replayed answer, so the payout is stuck as owed.
- Payout webhook window (suspected): after such a rollback, `payout.paid` finds no payout by provider id (`ApplyPayoutEventEventCommandHandler.ts:37`) but is still recorded (`:56`). The re-asked payout stays `pending`.
- Promotion code (crash loses a use): the use is taken in a transaction of its own before the booking, and given back if the booking fails (`BookStayCommandHandler.ts:49-62`, `PostgresPromotionCodeUses.ts:27-36`). A crash between the two spends a use with no booking.
- A refusal keeps the same key for payouts and refunds (suspected stuck).

---

## O8: money never exceeds what it may (under concurrency)

**simple-1: pass.**
- Host refund: the check "left = paid − requested/pending/succeeded" and the insert are in one locked transaction (`src/payments/refunds.ts:144-157`).
- Automatic refund: `min(target, paid − counted)` under the lock (`:238-268`).
- Payout amount = paid − fee − counted refunds, computed under the lock; at most one live payout per booking (`src/payments/payouts.ts:187-224`, `src/database.ts:360`).
- Promotion code: one conditional statement, `UPDATE … SET uses_left = uses_left - 1 … WHERE uses_left > 0`, inside the booking transaction (`src/listings/promotion-codes.ts:100-105`, `src/bookings/bookings.ts:229-231`).

**simple-2: fail.**
- Payouts: the check that a booking is owed and not yet paid out happens outside the transaction that writes the payout (`src/payments/payout-job.ts:99-131` against `payout-store.ts:127-155`). Two servers can therefore both write and send a payout for the same booking (see O7). The amount itself is computed outside any transaction too (`payout-job.ts:103-104`).
- Refunds pass: host refund room is checked and inserted under the lock (`src/bookings/bookings.routes.ts:394-405`, run in `bookings.transaction` at `:778`). The cancellation's refundable is capped by `total − hostAmount` (`:325-328`).
- Promotion code passes: uses left are counted from bookings and checked in the booking's locked transaction (`bookings.routes.ts:229-235`, `src/promotions/promotion-code-store.ts:15-19`).

**simple-3: pass.**
- Host refund: `committed + amount > paid` checked and inserted in one locked transaction (`src/payments/refunds.ts:207-224`).
- Automatic refunds: created under the lock (`:146-170`).
- Payouts: opened under the lock with `NOT EXISTS` a live payout, plus a unique live index (`src/payments/payouts.ts:88-128`, `src/database.ts:448`).
- Promotion code: `UPDATE promotion_codes SET used = used + 1 WHERE … AND used < uses` (`src/quotes/promotion-codes.ts:84-91`), inside the booking transaction (`src/bookings/bookings.ts:219-221`).

**clean-1: pass.**
- `Payment.refundBooking` refuses an amount above `paid − committed` (`src/Contexts/Payments/Domain/Payment/Payment.ts:489-491`). The cancellation's refund is capped the same way (`:776`). The save is version-checked (`PostgresPaymentRepository.ts:113-125`) under the lock.
- Payout: `payoutFor` (`Payment.ts:590-603`) is re-read inside the open transaction (`AskPayoutsSweep.ts:82-101`), with one live payout per booking enforced by a unique index (`payoutSchema.ts:38`).
- Promotion code: `PromotionCode.use()` and a versioned save, in the booking transaction (`PostgresPromotionCodeUses.ts:16-27`, `BookStayCommandHandler.ts:114`).

**clean-2: pass.**
- Refunds: `amount > leftToRefund()` is refused (`src/Contexts/Payments/Domain/Payment/Payment.ts:485,566`), with a versioned save (`PostgresPayments.ts:187-202`).
- Payout: read again in the locked transaction, `loadLiveForBooking` and `payable` (`PayoutsSweep.ts:108-114`).
- Promotion code: versioned (`src/Contexts/Pricing/Infrastructure/PostgresPromotionCodes.ts:70`) and used inside the booking transaction (`BookStayCommandHandler.ts:107-109`).
- The crash windows that could overpay are counted under O7.

**clean-3: pass.**
- Refunds: `amount > #remaining()` is refused (`src/Contexts/Payments/Domain/Payment/Payment.ts:414`), with a versioned save.
- Payout: the amount (`hostPayoutOn`, `Payment.ts:680`) and the "one live payout" check are decided in the locked transaction (`RequestOwedPayoutsCommandHandler.ts:97-116`).
- Promotion code: the limit holds. `use()` refuses at zero and the save is versioned with 3 conflict retries (`PostgresPromotionCodeUses.ts:46-70`, `PromotionCode.ts:110`). The use is committed in a transaction apart from the booking's, with a compensating give-back. Losing a use on a crash is counted under O7.
