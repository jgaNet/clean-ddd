# J4 reading, part A: O1, O4, O5, O10

Reader: one agent, reading only (no run, no build, no test). Trees read at `main` in `/runs/openstay/<tree>/app`. Paths below are relative to each tree's `app/`.

## Summary

| Item | simple-1 | simple-2 | simple-3 | clean-1 | clean-2 | clean-3 |
| --- | --- | --- | --- | --- | --- | --- |
| O1 one place per rule | partial: 2 rules twice in deciding code, 4 more copied in search or calendar (6 in all) | **fail**: 3 twice in deciding code, plus 4 in search (7) | partial: 2 + 3 in search (5) | partial: 2 + 1 in search (3) | partial: 2 + 3 in search or calendar (5) | **fail**: 3 + 1 in search (4) |
| O4 time and money as values | pass | partial (lapse reads `Date.now()`) | partial (payout due and part of lapse read the clock) | pass | pass | pass |
| O5 kept as accepted | pass | pass | pass | pass | pass | pass |
| O10 rules tested | pass | pass | pass | pass (promo limit tested in sequence only) | pass | pass (no concurrent refund-cap test) |

Count of the 19 O1 rules written twice in each tree:

| | simple-1 | simple-2 | simple-3 | clean-1 | clean-2 | clean-3 |
| --- | --- | --- | --- | --- | --- | --- |
| twice in deciding code (quote, book, hold, change, cancel, pay, refund, payout, statement) | 2 | 3 | 2 | 2 | 2 | 3 |
| copied only in a read-side filter (search, calendar) | 4 | 4 | 3 | 1 | 3 | 1 |
| total rules written twice | 6 | 7 | 5 | 3 | 5 | 4 |

## Conventions (applied the same way to every tree)

**The rules counted for O1** are the 19 the rubric names:
- **J3's:** R1 no night twice (is a night free), R2 stay limits, R3 a quote's lines and total, R4 what a cancellation refunds, R5 when a request or a hold expires, R6 the price of a night, R7 the discounts, R8 the booking window, R9 the arrival days, R10 who may act on a listing.
- **J4's:** R11 the provider's fee, R12 what is still refundable, R13 what a payout owes, R14 when an unpaid booking lapses, R15 the price with every adjustment and their order, R16 a promotion code's limit, R17 the next receipt number, R18 when a weekly payout is due, R19 a host's balance.

**When a rule counts as "written twice":**
- The condition or the arithmetic that decides the rule is coded in two or more functions, so changing the rule means editing more than one place. This includes SQL predicates in a query or a view.
- Calling one shared function from several places does not count.
- Comparing a stored deadline or counter (an `expires_at`, a `uses_left`) at several moments does not count. Recomputing the deadline's arithmetic, or recoding which conditions make it apply, does count. An inline copy inside the same class also counts; these are marked "minor".
- The total as the sum of the lines is not counted when the lines are built once.

**Deciding code and read-side copies are reported apart.**
- Deciding code means the paths that accept, refuse or compute: quote, book, hold, change dates, cancel, pay, refund, payout, statement.
- A read-side copy is a second encoding used only to filter a search or draw a calendar.

**O1 verdict:**
- pass: no rule is written twice anywhere.
- partial: 1 or 2 rules are written twice in deciding code (read-side copies are listed but do not move the verdict).
- fail: 3 or more rules are written twice in deciding code.

Read literally, the rubric ("a rule written twice fails") would fail all six trees: every tree has at least three rules written twice once search copies count.

**O4:** checks whether each of four decisions takes the time as a parameter or reads it from something a test replaces: the lapse, payout due (check-in begun, weekly), the last-minute window and the webhook's age. It also checks that the money is integer arithmetic with round-down where requests 8 and 16 name it.
- pass: all four decisions qualify.
- partial: one or two read the wall clock (`Date.now()`, `new Date()` or the database clock) inside the deciding function or view.

No tree uses fake timers in its specs except two files in clean-2, so a clock read inside a decision is not one a test replaces.

**O5:** checks that the booking copies the quote's lines, total, nightly prices, policy and code. It also checks that refund, payout, statement, receipt and earnings read the booking's kept lines, the payment row and the provider's events, and never the listing's current prices.

**O10:** read from the test titles of each tree's own `*.spec.ts` files (titles pulled with a script; acceptance files excluded), opening a test body where a title was unclear.
- A rule passes when at least one test targets it.
- For the O8 rules that hold under concurrency, the concurrent variant is noted separately; it is not required by the item's text.

---

## O1: Each business rule lives in one place

### simple-1 (partial: 2 + 4 read-side = 6)

| Rule | Where it is decided | Twice? |
| --- | --- | --- |
| R1 night free | `Listings.hasUnavailableNight` `src/listings/listings.ts:784`, used by quote, book, hold and change dates. Recoded in the calendar's own UNION (`listings.ts:812`) and in search's three `NOT EXISTS` (`listings.ts:891-901`). | read-side copies (2) |
| R2 stay limits | `checkStayTerms` `src/quotes/quotes.ts:133`; search `listings.ts:889` | search copy |
| R3 lines/total | `stayPricing` `quotes.ts:161` (total summed by callers `quotes.ts:288`, `bookings.ts:438`) | once |
| R4 cancellation refund | `refundableOf` `src/bookings/cancellation.ts:53` | once |
| R5 expiry | request: sweep `src/bookings/expiry.ts:30`, read-time compare `bookings.ts:139` (stored deadline). Hold: `src/holds/expiry.ts:24`. | once |
| R6 price of a night | `Listings.nightlyPricesOf` `listings.ts:828` (quote and `/prices`) | once |
| R7 discounts | `discountOf` `src/listings/discounts.ts:84` | once |
| R8 booking window | `checkStayTerms` `quotes.ts:136-145`; search `listings.ts:904-906` | search copy |
| R9 arrival days | `checkStayTerms` `quotes.ts:146-151`; search `listings.ts:908-912` | search copy |
| R10 who may act | `accessToListing` `src/organisations/access.ts:14`; recoded as SQL membership in `Bookings.visibleRow` `bookings.ts:530-538`; host-only shortcut `listings.ts:377` | **twice** |
| R11 fee | kept from `payment.succeeded` `src/payments/booking-payments.ts:294` | once |
| R12 still refundable | `refundByHost` `src/payments/refunds.ts:152` (`countedOf` `:404`); `requestAutomaticRefunds` recodes the counted sum inline (`refunds.ts:250`, `:262-263`); `COUNTED` defined twice (`refunds.ts:17`, `payouts.ts:15`) | **twice** |
| R13 payout owes | `payouts.ts:213` | once |
| R14 lapse | `LAPSING` `src/bookings/lapse.ts:25-29`, deadline `paymentDueBy` `lapse.ts:17` used by both confirm paths (`bookings.ts:239`, `:567`); late-payment check compares the stored deadline (`booking-payments.ts:300-303`) | once |
| R15 order | `stayPricing` `quotes.ts:179-188` | once |
| R16 promo limit | `uses_left` column: quote check `src/listings/promotion-codes.ts:88`, guarded decrement `:100` | once |
| R17 receipt number | `issueReceipt` `src/payments/receipts.ts:43` | once |
| R18 weekly due | `batchDue` `payouts.ts:232-241` | once |
| R19 balance | `MOVEMENTS` `src/hosts/statement.ts:33`, balance `:85-88`; earnings reuse `MOVEMENTS` (`src/hosts/earnings.ts:57`) | once |

Pricing, refunds and the statement each have one home. Who may act on a listing, and what is still refundable, each have two encodings in deciding code. Search re-expresses four quote rules in SQL.

### simple-2 (fail: 3 + 4 read-side = 7)

| Rule | Where | Twice? |
| --- | --- | --- |
| R1 | `unavailableNights` `src/listings/listing-store.ts:377`, used by quote, book, hold, change dates and calendar; search recodes it (`listing-store.ts:429-433`) | search copy |
| R2 | `refuseStay` `src/quotes/stay-terms.ts:60`; search `listing-store.ts:425` | search copy |
| R3 | `priceStay` `src/quotes/quote-pricing.ts:94` | once |
| R4 | `refundableAmount` `src/bookings/cancellation.ts:43` | once |
| R5 | `src/bookings/request-expiry.ts:11-33`; `expireHolds` `src/holds/hold-store.ts:47`; closing compares stored `expires_at` (`src/accounts/account-store.ts:96`) | once |
| R6 | `nightPrices` `src/listings/seasonal-prices.ts:91` (quote and `/prices`) | once |
| R7 | `discountLine` `quote-pricing.ts:37` | once |
| R8 | `startsInWindow` `src/listings/booking-window.ts:67`; search `listing-store.ts:434-435` | search copy |
| R9 | `refuseStay` `stay-terms.ts:74-80`; search `listing-store.ts:438-441` | search copy |
| R10 | `standingOn` and `mayManage` `src/organisations/access.ts:13-33` | once |
| R11 | `markSucceeded(id, fee)` `src/payments/webhook.routes.ts:113` | once |
| R12 | cancellation: `bookings.routes.ts:329` (total less host refunds); host refund: `bookings.routes.ts:394` (paid less `automaticDue` less host refunds); automatic: `src/payments/refund-store.ts:124`; plus `automaticDue` `src/bookings/booking-refund.ts:14-19` | **three times** |
| R13 | `payOwedHosts` `src/payments/payout-job.ts:104` and `askAgain` `payout-job.ts:59` (`total - fee - refunded`, each its own copy) | **twice** |
| R14 | `dueByOf` `src/bookings/lapse.ts:8` (confirmed + ttl) and `lapseUnpaid` cutoff `lapse.ts:29` (now − ttl) | **twice** |
| R15 | `priceStay` `quote-pricing.ts:105-113` | once |
| R16 | `usesLeft` `src/promotions/promotion-code-store.ts:19`, compared at quote and at booking | once |
| R17 | `src/payments/receipt-store.ts:33-36` | once |
| R18 | `payout-job.ts:128` with `utcWeekday` | once |
| R19 | `statementOf` `src/payments/statement.ts:50-55`; earnings read the same movements | once |

The quote side is well factored (one `refuseStay`, one `priceStay`). The money side recomputes what is still refundable three ways and what a payout owes twice, and the payment deadline is written two ways.

### simple-3 (partial: 2 + 3 read-side = 5)

| Rule | Where | Twice? |
| --- | --- | --- |
| R1 | SQL views `taken_nights` / `held_nights_now` / `unavailable_nights` `src/database.ts:491-509`, read by `hasUnavailableNight` `src/listings/listings.ts:469` and by search | once |
| R2 | `priceStay` `src/quotes/quotes.ts:264-269`; search `listings.ts:699` | search copy |
| R3 | `priceLines` `quotes.ts:178` | once |
| R4 | `refundableOf` `src/bookings/cancellation.ts:39` | once |
| R5 | `expireRequests` `src/bookings/expiry.ts:11`, `expireHolds` `src/holds/expiry.ts:9`; views compare stored `expires_at` | once |
| R6 | `Listings.nightPrices` `listings.ts:578` | once |
| R7 | `discountLine` `quotes.ts:118` | once |
| R8 | `inBookingWindow` `src/listings/booking-window.ts:37`; search `listings.ts:703` | search copy |
| R9 | `priceStay` `quotes.ts:247-258`; search `listings.ts:704-705` | search copy |
| R10 | `standingOf` `listings.ts:884` | once |
| R11 | `applySucceeded` `src/payments/booking-payments.ts:310-317` | once |
| R12 | `dueOf` `src/payments/refunds.ts:59` (used at `:52`, `:242`); recoded in `refundStateOf` `refunds.ts:93` and as `LEAST(...)` in the payout query `src/payments/payouts.ts:111` | **twice** |
| R13 | payout query `payouts.ts:93-95` | once |
| R14 | `lapseUnpaid` `src/bookings/expiry.ts:36-38` and view `live_confirmed` `database.ts:491-495` (same conditions recoded); deadline written inline twice (`src/bookings/bookings.ts:255`, `:568`) | **twice** |
| R15 | `priceLines` `quotes.ts:186-197` | once |
| R16 | `promotionOf` `src/quotes/promotion-codes.ts:74`, `useUpPromotionCode` `:86` (stored counter) | once |
| R17 | `issueReceipt` `src/receipts/receipts.ts:30` | once |
| R18 | payout query `payouts.ts:103-104` with `weekdayOf` `src/payments/payout-schedule.ts:22` | once |
| R19 | `MOVEMENTS` `src/payments/movements.ts:14`, balance `src/hosts/statement.ts:36` | once |

### clean-1 (partial: 2 + 1 read-side = 3)

| Rule | Where | Twice? |
| --- | --- | --- |
| R1 | Booking, holding and changing dates go through the `ListingCalendar` aggregate (`checkFree` `src/Contexts/Booking/Domain/ListingCalendar/ListingCalendar.ts:159`, `holds` `:234`). The quote and the calendar go through the SQL in `PostgresListingCalendarQueries.blockedNights` (`src/Contexts/Booking/Infrastructure/Postgres/PostgresListingCalendarQueries.ts:13-40`, used at `QuoteStayCommandHandler.ts:59`, `GetCalendarQueryHandler.ts:38`), which recodes "held until" and "own hold". | **twice** (quote vs book) |
| R2 | `priceStay` `src/Contexts/Booking/Domain/Quote/Quote.ts:274`; search `SearchListingsQueryHandler.ts:61-62` | search copy |
| R3 | `priceStay` `Quote.ts:239` | once |
| R4 | `refundableAmount` `src/Contexts/Booking/Domain/Booking/Refund.ts:62` | once |
| R5 | `statusAt` (`BookingStatus.ts`, `Booking.ts:472`), `ListingCalendar.holds` `:234` | once |
| R6 | `nightlyPricesOf` `src/Contexts/Listings/Domain/Listing/Season.ts:90` (quote and `/prices` via `PostgresListingQueries.ts:144-165`); bulk prices become seasons | once |
| R7 | `discountOf` `src/Contexts/Pricing/Domain/ListingPrices/stayLines.ts:54` | once |
| R8 | `withinBookingWindow` `src/Contexts/Booking/Domain/BookingWindow.ts:21` (quote and search) | once |
| R9 | `checkInAllowed` / `checkOutAllowed` `src/Contexts/Booking/Domain/ArrivalDays.ts:22-27` (quote and search) | once |
| R10 | `Listing.ts:270` (Listings), `listingAccess.ts:37` and `loadBookingOf.ts:26` (Booking), `ListingsActors.standingOn` `src/Contexts/Payments/Infrastructure/Listings/ListingsActors.ts:23-35` with `RefundBookingCommandHandler.ts:35`, `DeclarePaidDirectlyCommandHandler.ts:34` (Payments), `AccountsCollaborators.ts:16-17` (Pricing) | **four contexts** |
| R11 | `Payment` keeps the event's fee (`Payment.ts:375`, `:384`) | once |
| R12 | `committed()` `src/Contexts/Payments/Domain/Payment/Payment.ts:753`, used by `refundBooking` `:488` and `owe` `:776` | once |
| R13 | `payoutFor` `Payment.ts:590-600` | once |
| R14 | `Booking.lapse` `Booking.ts:420`, deadline `dueByFrom` `:620` | once |
| R15 | `stayPrice` `stayLines.ts:83` (discount, extra guests) and `priceStay` `Quote.ts:290-296` (frame) | once |
| R16 | `PromotionCode` `src/Contexts/Pricing/Domain/PromotionCode/PromotionCode.ts:162`, `:168` | once |
| R17 | `PostgresReceiptNumbers.next` (`UPDATE … RETURNING`) | once |
| R18 | `PayoutAccount.paysAt` `PayoutAccount.ts:175` | once |
| R19 | `statement_lines` ledger, balance `PostgresStatementQueries.ts:22`; earnings read the same ledger | once |

### clean-2 (partial: 2 + 3 read-side = 5)

| Rule | Where | Twice? |
| --- | --- | --- |
| R1 | `ListingCalendar.free` / `takeNights` `src/Contexts/Booking/Domain/Calendar/ListingCalendar.ts:140`, `:166`, `:203` for quote, hold, book and change. Search and calendar recode it in SQL: `canGiveNights` and `unavailableBetween` `src/Contexts/Booking/Infrastructure/PostgresCalendars.ts:109-129`. | read-side copy |
| R2 | `Quote.refusalOf` `src/Contexts/Booking/Domain/Quote/Quote.ts:299-300`; search `SearchListingsQueryHandler.ts:37` | search copy |
| R3 | `Quote.create` `Quote.ts:331-352` (holds and change dates go through it) | once |
| R4 | `refundableOf` `src/Contexts/Booking/Domain/Booking/Refund.ts:30` | once |
| R5 | Booking status at time and `ListingCalendar.held` `:203` (stored deadlines) | once |
| R6 | `SeasonalPrices.pricesOf` `src/Contexts/Listings/Domain/Listing/SeasonalPrices.ts:70`, then the bulk-price overlay coded twice: `withOwnNightPrices` `src/Contexts/Booking/Application/ReadModel/ListingTerms.ts:46` (quote) and `GetNightlyPricesQueryHandler.ts:52-58` (`/prices`); plus fallback `Quote.ts:334`. Suspected divergence: a bulk price always beats a later season. | **twice** |
| R7 | `discountLines` `Quote.ts:202` | once |
| R8 | inline in `Quote.refusalOf` `Quote.ts:292-293`; separate `allowsCheckIn` `src/Contexts/Booking/Domain/Quote/BookingWindow.ts:24` used by search | search copy |
| R9 | `checkInAllowed` / `checkOutAllowed`, quote and search | once |
| R10 | `Listing.ts:656`, `ListingCalendar.ts:102`, `:125`, `Booking.ts:371`, `:596`, `src/Contexts/Listings/Infrastructure/ActorsOfListings.ts:18`, each `actorId === hostId \|\| actsForHost` | **several** |
| R11 | `Payment.ts:414` keeps the event's fee | once |
| R12 | `leftToRefund` `src/Contexts/Payments/Domain/Payment/Payment.ts:566` | once |
| R13 | `payable` `Payment.ts:260`; check-in begun in `findPayable` `PostgresPayments.ts:132-138` only | once |
| R14 | `Booking.lapse` `Booking.ts:467-483` | once |
| R15 | `Quote.create` `Quote.ts:337-350` | once |
| R16 | `PromotionCode.usesLeft` `src/Contexts/Pricing/Domain/PromotionCode/PromotionCode.ts:104`, `:110` | once |
| R17 | `nextNumber` `src/Contexts/Payments/Infrastructure/PostgresReceipts.ts:45-48` | once |
| R18 | `PayoutsSweep` `src/Contexts/Payments/Application/Sweeps/PayoutsSweep.ts:60`, rechecked in the transaction `:106` (same comparison, fresh read) | once |
| R19 | ledger, balance `PostgresLedger.ts:121`; earnings `:148` | once |

### clean-3 (fail: 3 + 1 read-side = 4)

| Rule | Where | Twice? |
| --- | --- | --- |
| R1 | `ListingCalendar.givesEveryNight` `src/Contexts/Booking/Domain/Calendar/ListingCalendar.ts:211`, used by quote, hold, change, search (`CalendarsOfListings.ts:13-15`) and calendar (`availability` `:216`) | once |
| R2 | `stayQuotable` `src/Contexts/Booking/Domain/Quote/Quote.ts:88-89`; search `SearchListingsQueryHandler.ts:53` | search copy |
| R3 | Pricing `stayPricing` `src/Contexts/Pricing/Domain/Stay/StayPriceLines.ts:22` plus frame `Quote.ts:168-173` | once |
| R4 | `refundableOf` `src/Contexts/Booking/Domain/Booking/Refund.ts:23` | once |
| R5 | `statusAt` `Booking.ts:114`, `ListingCalendar.holds` `:253` | once |
| R6 | `SeasonalPrices.pricesOf` `src/Contexts/Pricing/Domain/ListingPrices/SeasonalPrices.ts:93` | once |
| R7 | `stayDiscount` `src/Contexts/Pricing/Domain/Stay/StayDiscount.ts:42` | once |
| R8 | `stayWithinWindow` `src/Contexts/Booking/Domain/Quote/BookingWindow.ts:18` (quote and search) | once |
| R9 | `staysOnArrivalDays` `ArrivalDays.ts:21` (quote and search) | once |
| R10 | `Listing.ts:463`, `ListingPrices.ts:230`, `ListingCalendar.ts:104`, `Booking.ts:366`, `:518`, `GetBookingQueryHandler.ts:42`, `GetPromotionCodesQueryHandler.ts:37`, `ListingsActors.ts:22` | **several** |
| R11 | `Payment.ts:325` keeps the provider's fee | once |
| R12 | `#remaining` `src/Contexts/Payments/Domain/Payment/Payment.ts:775` | once |
| R13 | `hostPayoutOn` `Payment.ts:680-687`, and the same formula as a SQL filter in `findPayableToHosts` `src/Contexts/Payments/Infrastructure/PostgresPayments.ts:137` | **twice** |
| R14 | `Booking.lapse` `Booking.ts:313`; deadline written inline twice, `Booking.ts:177` and `:288` | **twice** (minor) |
| R15 | `stayPricing` (`StayPriceLines.ts:41-47`) + `Quote.ts:168-173` | once |
| R16 | `usesLeftOf` `PromotionCode.ts:21`, used by aggregate and adapter | once |
| R17 | `PostgresReceiptNumbers.ts:19` | once |
| R18 | `findPayableToHosts` `PostgresPayments.ts:134` + one-a-day check `RequestOwedPayoutsCommandHandler.ts:81-85` | once |
| R19 | `statement_lines`, `PostgresStatementQueries.ts:29`; earnings same ledger | once |

---

## O4: Time and money as values

### simple-1: pass
- **Lapse:** `releaseLapsedBookings(database, at = new Date())` `src/bookings/lapse.ts:37`. The late-payment check uses the event's time (`src/payments/booking-payments.ts:299-303`).
- **Payout due and weekly:** `Payouts.settle(signal, now)` `src/payments/payouts.ts:166`, `keepDue(now)` `:187`, `batchDue(now)` `:232`.
- **Last-minute:** `discountOf(… daysAhead …)` `src/listings/discounts.ts:84-96`.
- **Webhook age:** `verifyWebhookSignature(…, now = new Date())` `src/payments/webhooks.ts:21-25`, `:64`.
- **Money:** integers, `Math.floor` for discounts (`discounts.ts:108`) and the half (`src/bookings/cancellation.ts:34`).

### simple-2: partial
- **Lapse reads the clock:** `lapseUnpaid` computes `Date.now() - ttl` inside the deciding function (`src/bookings/lapse.ts:29`), and `settleBookings` runs it before every read.
- **The rest takes time as a parameter:**
  - payout due: `payOwedHosts(…, now)` `src/payments/payout-job.ts:90`, `checkInBegun(checkIn, now)` `:23`;
  - last-minute: `appliesLastMinute(lastMinute, daysNotice)` `src/listings/last-minute.ts`;
  - webhook: `verifyWebhookSignature(…, Date.now())` passes the time in (`src/payments/webhook.routes.ts:150`).
- **Money:** integer, floor (`src/quotes/quote-pricing.ts:62`, `src/bookings/cancellation.ts:140`).

### simple-3: partial
- **Payout due reads the clock:** `Payouts.send()` reads `Date.now()` inside the transaction holding the due and weekly SQL (`src/payments/payouts.ts:89-90`).
- **Lapse is half parameterised:** `lapseUnpaid(database, now)` `src/bookings/expiry.ts:33` takes the time. But whether a confirmed booking still takes its nights is the view `live_confirmed`, evaluated on the database clock (`NOW = clock_timestamp()` `src/database.ts:21`, `:491-495`).
- **Last-minute:** `discountLine(… daysAhead …)` `src/quotes/quotes.ts:118`. Its caller reads `Date.now()` (`:237`).
- **Webhook:** `checkSignature(…, now)` `src/payments/webhook.ts:20`.
- **Money:** integer, floor (`quotes.ts:152`, `cancellation.ts:50`).

### clean-1: pass
- **Lapse:** `Booking.lapse(at)` `src/Contexts/Booking/Domain/Booking/Booking.ts:420`.
- **Payout due and weekly:** `payoutFor(at)` `Payment.ts:590`, `PayoutAccount.paysAt(at)` `PayoutAccount.ts:175`, `AskPayoutsSweep.run(context, at)` `AskPayoutsSweep.ts:31`.
- **Last-minute:** `discountOf({ today, … })` `src/Contexts/Pricing/Domain/ListingPrices/stayLines.ts:54-66`.
- **Webhook:** `isFromProvider(raw, header, now)` `src/Contexts/Payments/Presentation/API/REST/providerSignature.ts:11`, `:25`.
- **Money:** floor at `stayLines.ts:98` and `Refund.ts:81`. The refund's tax share is `Math.min`, an integer (`Payment.ts:780`).

### clean-2: pass
- **Lapse:** `Booking.lapse({ at })` `Booking.ts:467`.
- **Payout due and weekly:** `PayoutsSweep.run(context, at)` `PayoutsSweep.ts:42-44`.
- **Last-minute:** `Quote.create({ at })` and `discountLines(nights, notice, …)` `Quote.ts:202`, `:314-341`.
- **Webhook:** `isSignedByProvider({ nowSeconds = … })` `src/Contexts/Payments/Presentation/API/REST/signature.ts:14`, `:27`.
- **Money:** floor at `Quote.ts:229` and `Refund.ts:51`.

### clean-3: pass
- **Lapse:** `Booking.lapse(at)` `Booking.ts:313`.
- **Payout due and weekly:** `hostPayoutOn(day)` `Payment.ts:680`, and `open(day)` with `findPayableToHosts(day, weekdayOf(day))` (`RequestOwedPayoutsCommandHandler.ts:68-71`). The handler reads `new Date()` at its entry (`:36`) and passes it down.
- **Last-minute:** `stayDiscount({ daysToCheckIn })` `StayDiscount.ts:42-58`.
- **Webhook:** `verify(raw, header, now)` `HmacWebhookSignatures.ts:15`, `:26`.
- **Money:** floor at `StayDiscount.ts:71` and `Refund.ts:44`.

---

## O5: What was accepted is kept as accepted

Every tree passes. No tree recomputes a refund, payout, statement, receipt or earning from the listing's current prices. Changing dates re-prices at today's terms, as request 19 asks.

- **simple-1: pass.**
  - The booking copies the quote's lines, nightly prices, total, policy and house rules (`src/bookings/bookings.ts:240-260`).
  - Cancellation reads the booking's `lines_json` and policy (`bookings.ts:370-375`).
  - The payout uses payment amount − fee − refunds (`src/payments/payouts.ts:213`).
  - The statement and earnings read the payments, refunds and payouts the provider settled (`src/hosts/statement.ts:33-53`).
- **simple-2: pass.**
  - The booking copies the quote (`src/bookings/booking-store.ts:206-230`).
  - The refund uses the booking's lines (`src/bookings/bookings.routes.ts:327-329`).
  - The payout uses the booking total − fee − refunded (`src/payments/payout-job.ts:104`).
  - The payment asks for `booking.total` (`bookings.routes.ts:739`).
  - Movements come from the settled rows (`src/payments/statement-store.ts:21-44`).
- **simple-3: pass.**
  - The booking copies the quote (`src/bookings/bookings.ts:232-250`).
  - `refundableOf` uses the booking's lines (`bookings.ts:339`).
  - The payout uses payment amount − fee − refunds (`src/payments/payouts.ts:93`).
  - The statement, earnings and balance come from `MOVEMENTS` (`src/payments/movements.ts:14`).
- **clean-1: pass.**
  - The booking takes the quote's lines and nightly prices (`BookStayCommandHandler.ts:82`).
  - The cancellation uses `this.#lines` (`Booking.ts:371`).
  - The payout uses `payoutFor` from the payment and the provider's fee (`Payment.ts:597`).
  - The statement and earnings read the ledger written from events (`PostgresStatementQueries.ts:22`, `PostgresEarningsQueries.ts:18-22`).
- **clean-2: pass.**
  - The booking copies the quote's lines, total and nightly prices (`Booking.ts:252-254`).
  - The refund uses `refundableOf({ lines: this.lines, policy: this.cancellationPolicy })` (`Booking.ts:375-378`).
  - The payout uses `payable` (`Payment.ts:260`).
  - The ledger and earnings come from `PostgresLedger.ts:114-148`.
- **clean-3: pass.**
  - The booking takes the quote's policy and lines (`Booking.ts:189-191`).
  - The refund is decided from the booking's own lines and policy (`Booking.ts:358-382`).
  - The payout uses `hostPayoutOn` (`Payment.ts:680`).
  - The statement and earnings read `statement_lines` (`PostgresEarningsQueries.ts:28`).

---

## O10: The rules are tested

Each O1 rule and each O8 rule has at least one test of its own in every tree. The O8 rules checked are:
- **(a)** a refund never exceeds what was paid, and holds at the same moment;
- **(b)** a payout never exceeds what is due, and is never paid twice;
- **(c)** a promotion code's last use is taken once;
- **(d)** the fee shown is the provider's;
- **(e)** a declared payment is never verified;
- **(f)** cancelled and refunded stay distinct.

Evidence by tree (spec titles):

- **simple-1: pass.**
  - Night taken at the same moment: `src/bookings/bookings.spec.ts:338`.
  - Cancellation policies and the half: `src/bookings/cancellation.spec.ts:38`, `:63`.
  - Lapse: `src/bookings/lapse.spec.ts`.
  - Order of adjustments: `src/quotes/extra-guests.spec.ts:166`, `src/quotes/last-minute.spec.ts:174`.
  - Promo last use at the same moment: `src/bookings/promotion-codes.spec.ts:201`.
  - Receipts at the same moment across two servers: `src/payments/receipts.spec.ts:259`.
  - Balance: `src/hosts/statement.spec.ts:252`.
  - Weekly: `src/payments/payout-schedules.spec.ts:210`.
  - Payout less the fee, once: `src/payments/payouts.spec.ts:164`, `:234`.
  - (a) `src/payments/host-refunds.spec.ts:266`, `:280`.
  - (d) `src/payments/booking-payments.spec.ts:270`.
  - (e) `src/payments/declared-payments.spec.ts:252`.
  - (f) `src/payments/cancelled-refunds.spec.ts:231`.
  - Access: `src/organisations/permissions.spec.ts`.
- **simple-2: pass.**
  - Night taken at the same moment: `src/bookings/bookings.spec.ts:246`, `:258`.
  - Half: `src/bookings/cancellations.spec.ts:196`.
  - Discounts on the nights only: `src/quotes/quote-discounts.spec.ts:126`.
  - Promo at the same moment: `src/bookings/promotion-code-bookings.spec.ts:148`.
  - Receipts: `src/payments/receipts.spec.ts:253`, `:268`.
  - Balance: `src/payments/statement.spec.ts:281`.
  - Weekly: `src/payments/payouts.spec.ts:564`, `:597`.
  - Payout: `payouts.spec.ts:261`.
  - (a) `src/bookings/host-refunds.spec.ts:349`.
  - (d) `src/payments/pay-booking.spec.ts:283`.
  - (e) `src/payments/direct-payment.spec.ts:271`.
  - (f) `src/payments/refunds.spec.ts:257`.
- **simple-3: pass.**
  - Night taken: `src/bookings/bookings.spec.ts:319`.
  - Policies: `src/bookings/cancellation.spec.ts:18-41`.
  - Extra guests not discounted: `src/quotes/extra-guests.spec.ts:210`.
  - Promo at once: `src/bookings/promotion-code-bookings.spec.ts:200`.
  - Receipts: `src/receipts/receipts.spec.ts:266`, `:284`.
  - Balance: `src/hosts/statement.spec.ts:330`.
  - Weekly: `src/payments/weekly-payouts.spec.ts:242`, `:278`.
  - Payout: `src/payments/payouts.spec.ts:237`, `:536`.
  - (a) `src/payments/host-refunds.spec.ts:388`.
  - (d) `src/payments/booking-payments.spec.ts:358`.
  - (e) `src/payments/direct-payment.spec.ts:328`.
  - (f) `src/bookings/cancel.spec.ts:157`.
- **clean-1: pass.**
  - Night taken: `ListingCalendar.spec.ts:63` and the e2e at the same moment (`booking.routes.e2e.spec.ts:220`).
  - Policies: `Booking/Domain/Booking/Refund.spec.ts`.
  - Order of adjustments: `Pricing/Domain/ListingPrices/stayLines.spec.ts:73`, `:98`.
  - Promo: `PromotionCode.spec.ts:51`, and the e2e `promotion-codes.routes.e2e.spec.ts:130`. That e2e books the last use twice in sequence (two bookings, `:41-44`), not at the same moment.
  - Receipts: `receipt.routes.e2e.spec.ts:159`.
  - Balance: `statement.routes.e2e.spec.ts:209`.
  - Weekly: `AskPayoutsSweep.spec.ts:70`, `PayoutAccount.spec.ts:50`.
  - Payout: `PaymentPayout.spec.ts:37`, `:48`.
  - (a) `PaymentRefund.spec.ts:87`, `payment.routes.e2e.spec.ts:578`.
  - (d) `Payment.spec.ts:68`.
  - (e) `PaymentDeclared.spec.ts:18`.
  - (f) `PaymentRefund.spec.ts:24`, `cancel.routes.e2e.spec.ts:85`.
  - Access: `bookingAccess.spec.ts:22`, `Listing.spec.ts:137`.
- **clean-2: pass.**
  - Night taken: `ListingCalendar.spec.ts:88`, `booking.routes.e2e.spec.ts:190`.
  - Policies: `Booking/Domain/Booking/Refund.spec.ts`.
  - Discounts: `Quote.spec.ts:60-123`.
  - Promo: `Quote.promotionCode.spec.ts:74`, `promotion-codes.routes.e2e.spec.ts:152`.
  - Receipts: `receipts.e2e.spec.ts:240`.
  - Balance: `statement.e2e.spec.ts:322`.
  - Weekly: `payouts.e2e.spec.ts:371`, `:405`.
  - Payout: `payouts.e2e.spec.ts:206`.
  - (a) `Payment.spec.ts:424`, `booking.host-refund.e2e.spec.ts:245`.
  - (d) `Payment.spec.ts:94`.
  - (e) `Payment.spec.ts:466`.
  - (f) `Booking.spec.ts:99`.
  - Seasonal and bulk prices are tested (`SeasonalPrices.spec.ts`, `nightly-prices.routes.e2e.spec.ts`). No test covers a season set after a bulk price (the suspected divergence in O1 R6).
  - `Quote.spec.ts:77` tests that a 28-night stay takes the weekly discount when it is larger than the monthly one. This is a reading of requests 16 and 42 that the other trees do not take; it is outside these items.
- **clean-3: pass.**
  - Night taken: `ListingCalendar.spec.ts:101`, `bookings.routes.e2e.spec.ts:187`.
  - Policies: `Booking/Domain/Booking/Refund.spec.ts:36`.
  - Order of adjustments: `StayPriceLines.spec.ts:64`, `:81`, `PromotionCodeDiscount.spec.ts`.
  - Promo: `PromotionCode.spec.ts:41`, `promotion-codes.routes.e2e.spec.ts:212`.
  - Receipts: `PostgresReceiptNumbers.spec.ts:18`.
  - Balance: `host-statement.routes.e2e.spec.ts:195`.
  - Weekly: `payout-schedule.routes.e2e.spec.ts:258`.
  - Payout: `Payment.payout.spec.ts:38`, `host-payouts.routes.e2e.spec.ts:353`.
  - (a) `Payment.refund.spec.ts:292`, `:301`. No test makes two host refunds at the same moment; the concurrent half of O8's refund rule is untested here.
  - (d) `Payment.spec.ts:102`.
  - (e) `declare-paid.routes.e2e.spec.ts:131`.
  - (f) `refunds.routes.e2e.spec.ts:276`.

**Caveats.** O10 was judged from titles and a few bodies, not by running anything. A title that claims a rule was taken to test it, and only the clean-1 promo test body was opened to check concurrency.
