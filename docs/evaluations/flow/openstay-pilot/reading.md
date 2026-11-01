# OpenStay pilot (j2): reading of eight trees

Rubric: `docs/evaluations/benchmark/openstay/pilot/reading.md` (O1–O9, three change probes). All evidence is `file:line` at `main`. Simple trees were read against `08b94b0`, clean trees against `ccf7f75`. Nothing was run. Where an item needs the whole tree (O7 in particular), code the run inherited from its base is counted too, and the report says so.

How I applied the verdicts:
- **O1.** A rule fails the "one place" test if a second piece of code decides it on its own, for example a search query restating the stay limits. A tree gets **partial** when its decision paths (quote, book, cancel, decide) each call one function but a read path (search, calendar, read model) restates a rule. It would get **fail** if a decision rule itself were written twice. No tree reached that.
- **O3.** A typed refusal that is thrown and turned into a 4xx by an error handler reaches the client correctly, but it is "thrown through the request". That is **partial**. A refusal returned as a value is **pass**.
- **O4.** **Pass** means every deciding function takes the time as a parameter or an injected clock. **Partial** means at least one decision reads the wall clock inline or in SQL (`strftime('now')`). No tree uses fake timers (I grepped for `useFakeTimers`, `setSystemTime` and `mock.timers`). Every tree keeps amounts as integer cents.
- **O6.** **Fail** means two parts depend on each other's internals in both directions (a cycle). **Partial** means a one-way reach into another part's tables. **Pass** means only ports and read models, imported one way.

---

## O1. Each business rule lives in one place

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | partial | Quote lines are written once (`src/quotes/quotes.ts:148-154`) and so is the refund (`src/bookings/cancellation.ts:52`). The stay limits are written twice: `src/quotes/quotes.ts:141` and the search SQL at `src/listings/listings.ts:441`. Expiry is written twice: `src/bookings/bookings.ts:113` (read-time "lapsed") and `src/bookings/expiry.ts:37-50` (SQL sweep). Free nights are decided by `hasUnavailableNight` (`src/listings/listings.ts:400`), then restated in the search (`:443-450`) and the calendar (`:418-420`). Host checks appear at `listings.ts:494`, `bookings.ts:348` and `bookings.ts:373`. |
| simple-2 | partial | Expiry is written once (`src/bookings/request-expiry.ts:11`, and every read calls it), quote lines once (`src/quotes/quote-pricing.ts:9`), the refund once (`src/bookings/cancellation.ts:43`), and listing ownership once (`src/listings/listings.routes.ts:33`). The stay limits are written twice: `src/quotes/quotes.routes.ts:60` and `src/listings/listing-store.ts:165`. Free nights: `listing-store.ts:141-147`, then again in the search SQL (`:167-170`) and in the block check (`:118`). |
| simple-3 | partial | Free nights are decided once, in the SQL view `unavailable_nights` (`src/database.ts:149-154`), which quote, booking, search and calendar all use. Quote lines are written once (`src/quotes/quotes.ts:70`) and the refund once (`src/bookings/cancellation.ts:39`). The stay limits are written twice: `quotes.ts:118` and `src/listings/listings.ts:286`. Expiry is written three times: `src/bookings/bookings.ts:91` (`statusAt`), the view's `expires_at > strftime('now')` (`database.ts:154`), and `src/bookings/expiry.ts:10`. |
| simple-w | partial | The refund is written once (`src/bookings/refunds.ts:25`) and quote lines once (`src/quotes/quotes.ts:38`). The stay limits are written twice: `quotes.ts:74` and the search SQL at `src/listings/search.ts:63`. Expiry is written twice: `statusOf` at `src/bookings/bookings.ts:211` and the SQL `HOLDS` at `bookings.ts:16`. The "night is taken" query is pushed three times into registries (`bookings.ts:19-29`); they share the `HOLDS` helper. |
| clean-1 | partial | The refund is written once (`src/Contexts/Booking/Domain/Booking/Refund.ts:79`) and quote lines once (`Domain/Quote/Quote.ts`). The stay limits are written twice: `Quote.ts:115` and `Application/Queries/SearchListings/SearchListingsQueryHandler.ts:33`. The hold rule lives in `Domain/ListingCalendar/ListingCalendar.ts:161` and again in SQL at `Infrastructure/Sqlite/SqliteListingCalendarQueries.ts:20,40`. "Host of the listing" is decided at `Listings/Domain/Listing/Listing.ts:162` and again at `Booking/Application/Commands/requireHostOf.ts:18`. |
| clean-2 | partial | The refund is written once (`Booking/Domain/Booking/Refund.ts:51`). The stay limits are written twice: `Domain/Quote/Quote.ts:132` and `SearchListingsQueryHandler.ts:33`. The hold rule lives in `Domain/Calendar/ListingCalendar.ts:182` and again in SQL at `Infrastructure/SqliteCalendars.ts:113,125`. The host check appears at `Listings/Domain/Listing/Listing.ts:270` and at `Booking/Domain/Calendar/ListingCalendar.ts:100`. |
| clean-3 | partial | Expiry is written once: `statusAt` (`Booking/Domain/Booking/Booking.ts:80`) is reused by the read side (`Infrastructure/SqliteBookingQueries.ts:68`). Search asks the calendar (`SearchListingsQueryHandler.ts:38`) and no SQL predicate restates it. The refund is written once (`Refund.ts:44`). The stay limits are written twice: `Domain/Quote/Quote.ts:105` and `SearchListingsQueryHandler.ts:37`. |
| clean-w | partial | The stay limits are written once: `Stay.isWithin` (`Booking/Domain/Search/Stay.ts:27`), used by both `Quote.ts:100` and the search (`SearchListingsQueryHandler.ts:28`). The refund is written once (`Domain/Booking/Refundable.ts:50`). The hold rule lives in `Domain/Calendar/ListingCalendar.ts:71` and again in SQL as `NIGHT_STILL_TAKEN` (`Infrastructure/SqliteCalendarStore.ts:40`), which the quote uses (`SqliteCalendars.ts:33-42`). The expired status is restated at `Infrastructure/SqliteBookingQueries.ts:49`. |

## O2. No night twice, under concurrency

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | partial | The booking path is safe. It runs under `BEGIN IMMEDIATE` (`src/bookings/bookings.ts:171,401`), checks at `:189`, takes the nights at `:222-228`, and a primary key on `booked_nights` turns a clash into a 409 (`:230`). Blocking is not safe: `blockNights` checks for booked nights and then inserts with no transaction around them (`src/listings/listings.ts:314-327`). With two servers on one file, a booking can commit between the check and the insert, so a night ends up both booked and blocked. |
| simple-2 | pass | The booking runs in `transaction()` = `BEGIN IMMEDIATE` (`src/database.ts:14`, `src/bookings/bookings.routes.ts:202`). The check is at `:105` and the write at `src/bookings/booking-store.ts:128-131`, backed by a primary key (`database.ts:127-131`). Blocking is in a transaction (`src/listings/listing-store.ts:120`). |
| simple-3 | pass | `inTransaction(..., 'IMMEDIATE')` wraps the booking (`src/bookings/bookings.ts:159-231`): check at `:182`, write at `:212-217`, backed by a primary key. Blocking is also IMMEDIATE (`src/listings/listings.ts:309-326`). |
| simple-w | pass | `BEGIN IMMEDIATE` wraps the booking (`src/bookings/bookings.ts:129,239-240`): check at `:143-147`, write at `:178-181`. Blocking is also IMMEDIATE (`src/listings/calendar.ts:46`). |
| clean-1 | pass | The calendar aggregate is taken and saved in the unit of work (`Booking/Application/Commands/BookStay/BookStayCommandHandler.ts:89-95`). The save does `UPDATE … WHERE version = ?` (`Infrastructure/Sqlite/SqliteListingCalendarRepository.ts:51-54`) inside `BEGIN IMMEDIATE` (`src/Architecture/Infrastructure/Sqlite/SqliteUnitOfWork.ts:23`). A conflict is re-decided up to 3 times (base `CommandHandler.ts:83-92`). |
| clean-2 | pass | `BookStayCommandHandler.ts:71-82` takes the nights; the version check is at `Infrastructure/SqliteCalendars.ts:86-87`. |
| clean-3 | pass | `BookStayCommandHandler.ts:64-76`; the version check is at `Infrastructure/SqliteListingCalendars.ts:96-98`. |
| clean-w | pass | `BookStayCommandHandler.ts:45-61` and `Domain/Booking/StayBooking.ts:40`. The version is checked on save (`SqliteListingCalendarRepository.ts:43`) and again, atomically, by the write applied at commit (`:51-58`, `src/Architecture/Infrastructure/UnitOfWork/SqliteUnitOfWork.ts:55-58`). A conflict found at commit throws and becomes an unnamed ERROR rather than a retry; nights are still never taken twice. |

## O3. A refusal is an outcome, not a crash

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | partial | Every refusal reaches the client as a 4xx, but it is thrown as `HttpError` (for example `src/bookings/bookings.ts:183`) and turned into a reply by an error handler (`src/http.ts:14-23`). |
| simple-2 | pass | Refusals are `Problem` values that are returned (`src/bookings/bookings.routes.ts:30-32,85-118`). The unique-key violation is caught and becomes a 409 (`:211-216`). |
| simple-3 | partial | Refusals are thrown as `Refusal` (`src/bookings/bookings.ts:175`) and mapped by `src/errors.ts:17-27`. |
| simple-w | partial | Refusals are thrown through `conflict()` and `notFound()` (`src/bookings/bookings.ts:137-146`). |
| clean-1 | pass | Refusals are `Result.fail` values (`BookStayCommandHandler.ts:49-92`). The base handler turns a stray throw into a failed operation (`src/Architecture/Application/CommandHandler.ts:95-101`). The only `throw`s are in `fromSnapshot`. |
| clean-2 | pass | Refusals are `Result.fail` values (`Booking/Domain/Booking/Booking.ts:176-178`). The only `throw`s are for corrupted storage. |
| clean-3 | pass | Refusals are `Result.fail` values (`Booking/Domain/Booking/Booking.ts:122`). The only `throw`s are for corrupted snapshots and configuration. |
| clean-w | pass | Refusals become the ERROR of a 202 operation (`Booking/Presentation/API/REST/Controllers/FastifyBookingController.ts:30-59`). A lost race found at commit is an ERROR outcome but carries no rule name (`ExecutionContext.ts:252-258`). |

## O4. Time and money are values

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | partial | The expiry sweep takes `at` (`src/bookings/expiry.ts:11`) and the refund takes `daysBeforeCheckIn` (`cancellation.ts:52`). Quote validity reads the clock inline: `Date.parse(quote.validUntil) <= Date.now()` (`src/bookings/bookings.ts:182`). Amounts are integer cents. |
| simple-2 | partial | The refund takes `today` (`src/bookings/cancellation.ts:43`). Expiry reads the clock inside the function (`src/bookings/request-expiry.ts:12`). Quote validity is inline (`src/bookings/bookings.routes.ts:98`). |
| simple-3 | partial | `statusAt(row, now)` (`src/bookings/bookings.ts:91`) and `expireRequests(db, now)` take the time. Free nights come from the view, which uses `strftime('now')` (`src/database.ts:154`). Quote validity is decided inline in `create` (`bookings.ts:162,174`). |
| simple-w | partial | Every booking function takes `now = new Date()` (`src/bookings/bookings.ts:125,262,286`). Whether a request's hold has run out is decided in SQL with `SQL_NOW` (`bookings.ts:16`, `src/database.ts:132`), which a test cannot replace. |
| clean-1 | pass | Time is a parameter with a default everywhere: `Booking.ts:299` (`statusAt(at)`), `ListingCalendar.ts:123`, `Quote.ts:105`. The read side takes `at` too (`SqliteBookingQueries.ts:37-51`). Amounts are integers. |
| clean-2 | pass | `Booking.book({ at = … })` (`Booking.ts:166-169`), `accept`/`cancel`/`expire(at)` (`:249-298`), `Delivery.attemptFailed(at)`. Query handlers pass `at` into pure functions (for example `GetBookingQueryHandler.ts:33`). |
| clean-3 | pass | `statusAt(status, expiresAt, at)` (`Booking.ts:80`) and `ListingCalendar.take(…, { at })` (`:126`). |
| clean-w | pass | The handler's clock is injected (`BookStayCommandHandler.ts:28`) and the read adapters take `now` (`SqliteCalendars.ts:15`). Amounts are integers. One note: the refund is `Math.floor(rest * 0.5)` (`Refundable.ts:50`), which uses floating-point arithmetic but floors it to an integer. |

## O5. What was accepted is kept as accepted

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | pass | The booking copies the quote's lines, total and policy (`src/bookings/bookings.ts:214-216`). The refund reads the stored lines and policy (`:313-317`). |
| simple-2 | pass | `src/bookings/booking-store.ts:112-114`. |
| simple-3 | pass | `src/bookings/bookings.ts:204-206`. The refund uses the row's lines and policy (`:284-287`). |
| simple-w | pass | `src/bookings/bookings.ts:170-172`. |
| clean-1 | pass | `BookStayCommandHandler.ts:76-77`; persisted at `SqliteBookingRepository.ts:90`. |
| clean-2 | pass | `Booking.ts:193-195` (`lines: quote.lines…, total, cancellationPolicy`). |
| clean-3 | pass | `Booking.book` builds from the quote (`Booking.ts:110-140`); persisted as `lines_json`. |
| clean-w | pass | `SqliteBookingRepository.ts:94` stores the quote's lines; `bookings.cancellation_policy` (`SqliteBookingStore.ts:47`). |

## O6. The parts change apart

Each cell gives the cross-part imports in non-spec code, then any cross-part SQL.

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | fail | 17 imports. Bookings imports listings (3), quotes (2), accounts (3) and notices (1); listings imports bookings (1) and accounts (3); quotes imports listings (1) and accounts (3). Listings and bookings form a cycle: `src/listings/listings.ts:6` imports `bookings/expiry`, and listings reads the bookings table `booked_nights` at `:394,420,448`. `bookings.ts:105-106` joins the `accounts` table. |
| simple-2 | fail | 31 imports (bookings imports listings 9 times, quotes imports listings 8 times). Cycle: `src/listings/listing-store.ts:3` imports `bookings/request-expiry` and reads `booked_nights` at `:118,147,169`. |
| simple-3 | fail | 16 imports. Cycle: listings imports `bookings/expiry`, the shared view in `src/database.ts:149-154` joins `bookings`, and `listings.ts:333` reads `booked_nights`. `bookings.ts:316` reads the `accounts` table. |
| simple-w | partial | 12 imports, all one way (bookings into listings, quotes and notifications). Listings has no import of bookings: bookings extends listings' queries through registries (`src/bookings/bookings.ts:19-29`). Bookings reads the `quotes`, `listings` and `accounts` tables directly (`:136,140,311`), and `quotes.ts:63` reads `listings`. |
| clean-1 | pass | 5 adapter imports, one way, all through ports or read models: `Booking/Infrastructure/Listings/ListingsTerms.ts:5-6` and `Booking/Infrastructure/Accounts/*`. Each context's SQL touches only its own tables. Notifications imports only the shared-kernel events. |
| clean-2 | pass | 5 adapter imports through ports (`Booking/Infrastructure/ListingsAsTerms.ts:4-5`). |
| clean-3 | pass | 5 adapter imports (`Booking/Infrastructure/ListingsTerms.ts:2-3`). |
| clean-w | pass | 4 adapter imports (`Booking/Infrastructure/ListingsListingTerms.ts:1`). |

## O7. A crash or a second process loses or doubles nothing

| Tree | Verdict | Evidence (writes traced: booking → notice stored → sent → acceptance) |
| --- | --- | --- |
| simple-1 | pass | The notice row is stored in the booking's own transaction (`src/bookings/bookings.ts:242`). It is sent after the commit (`:246`), and the acceptance is written after a 2xx (`src/notices/notices.ts:112-114`). Unaccepted notices are resent at startup (`:61`). A crash between the 2xx and the acceptance resends the same id, which the request allows. `UNIQUE booking_id` is at `src/database.ts:230`. |
| simple-2 | pass | Stored in the transaction (`src/bookings/booking-store.ts:123`); the sender wakes after the commit (`bookings.routes.ts:209`); acceptance at `src/notices/notice-store.ts:45-46`; resumed at start (`src/app.ts:101`). |
| simple-3 | pass | Stored in the transaction (`src/bookings/bookings.ts:222`); delivered after the commit (`:234`); acceptance at `src/notices/notices.ts:113,141`; resumed at start (`src/app.ts:86`). |
| simple-w | pass | Stored in the transaction (`src/bookings/bookings.ts:184`, `ON CONFLICT(booking_id)`). Sending is under a lease kept in the database (`src/notifications/notices.ts:104-122`), so two servers do not send the same notice at once. |
| clean-1 | fail | **Window** between the commit of the booking's outbox row (`BookingConfirmedEvent`) and the commit of the `Delivery` row. The relay deletes the outbox entry (`src/Architecture/Application/Outbox.ts:50`, base code the run kept) right after `emit`. The reaction starts with `void eventHandler.handle` (`src/Architecture/Infrastructure/EventBus/InMemoryEventBus.ts:78`) and commits later in its own transaction. There are two such hops: `Booking/Application/Events/BookingConfirmedHandler.ts:13`, then `Notifications/Application/Events/BookingConfirmedIntegrationEventHandler.ts:23`. A kill in either gap loses the notice of a booking that was recorded. Doubling is prevented by `UNIQUE booking_id` (`Notifications/Infrastructure/Sqlite/deliverySchema.ts:10`) and `findByBooking` (`:18`). |
| clean-2 | fail | Same window (`Outbox.ts:49-50` unchanged; reactions in `PublishBookingConfirmedHandler.ts:16` and `OweNoticeHandler.ts:31`). **Suspected doubling:** `deliveries` has no unique key on `booking_id` (`Notifications/Infrastructure/SqliteDeliveries.ts:30-41`) and `OweNoticeHandler` does not check for an existing delivery. Two servers relaying the same pending row (`SqliteOutbox.ts:24-35`, no lease) would owe two notices under two ids. |
| clean-3 | pass (one suspected window) | The run fixed the relay: it marks an entry published only after its reactions settle (`src/Architecture/Application/Outbox.ts:65-66`, `InMemoryEventBus.ts:68`). `UNIQUE booking_id` (`Notifications/Infrastructure/SqliteNotices.ts:18`) and `NoticeOwing.ts:18` prevent doubling. Acceptance is recorded after the 2xx (`Application/NoticeDelivery.ts:37-46`). *Suspected:* a reaction that fails without a crash (for example a busy database) still settles, so its entry is marked published and the notice is lost (`InMemoryEventBus.ts`: the failure handler returns `undefined`). |
| clean-w | pass (one suspected window) | Fixed the same way (`Outbox.ts:57-61`, `InMemoryEventBus.ts:69`). `UNIQUE booking_id` and `findByBooking` (`SqliteDeliveryRepository.ts:43`, `BookingConfirmedIntegrationEventHandler.ts:18`). Sending and recording are at `Application/Services/NoticeSender.ts:33-43`. *Suspected:* a failed (not crashed) reaction counts as handled through `Promise.allSettled` (`InMemoryEventBus.ts:69`), so its entry is marked published. |

None of the eight trees has a cache that a second process could make stale. The in-memory inboxes and retry maps are per process and only delay or repeat a send, always under the same id.

## O8. Security basics

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | pass | Passwords: scrypt with a random salt (`src/accounts/password.ts:13-16`). Tokens: random, stored hashed (`accounts.ts:78,141`). Actor taken from the bearer token. Owner check at `listings.ts:494`. |
| simple-2 | pass | `password.ts:12-16`; `account-store.ts:34,68`; `listings.routes.ts:33-38`. |
| simple-3 | pass | `passwords.ts:13-15`; `accounts.ts:49,90`; `listings.ts:361-364`. |
| simple-w | pass | `src/auth.ts:10-12,26-30`; `ownListing`. |
| clean-1 | pass | `ScryptPasswordHasher.ts:11`. HMAC tokens are signed with `TOKEN_SECRET`, or else a random key stored in the database (`Accounts/module.local.ts:20`, `accountTokenSecret.ts:7`). Owner check at `Listing.ts:162`. |
| clean-2 | pass | `ScryptPasswordHasher.ts:8`. The token key is random and stored in the database (`SqliteDatabase.ts:83-89`). Owner check at `Listing.ts:270`. |
| clean-3 | pass | `ScryptPasswordHasher.ts:12`. The key is random and stored (`Accounts/module.local.ts:25`). Note: the token is `HMAC(accountId)` with no expiry (`HmacTokens.ts:28`). Owner check at `Listing.ts:268`. |
| clean-w | pass | `ScryptPasswordHasher.ts:14`. `TOKEN_SECRET`, or else a random stored secret (`HmacTokens.ts:18-21,44-52`), with an expiry. Owner check at `ListingCalendar.ts:139`. |

## O9. The rules are tested

Each cell lists the tree's own test for each rule.

| Tree | Verdict | Evidence |
| --- | --- | --- |
| simple-1 | pass | Concurrency: `bookings.spec.ts:325`. Stay limits: `quotes.spec.ts:258`. Lines/total: `quotes.spec.ts:127,154`. Rounding: `cancellation.spec.ts:65`. Expiry: `requests.spec.ts:308`. Owner: `listings.spec.ts:282`. |
| simple-2 | pass | `bookings.spec.ts:237,249` (across servers). `quotes.spec.ts:255`. `quotes.spec.ts:142`. `refund.spec.ts:59`. `requests.spec.ts:385`. `listings.spec.ts:230`. |
| simple-3 | pass | `bookings.spec.ts:302`. `quotes.spec.ts:372`. `quotes.spec.ts:177`. `cancellation.spec.ts:41`. `requests.spec.ts:345`. `listings.spec.ts:284`. |
| simple-w | pass | `bookings.spec.ts:306`, `servers.spec.ts:7`. `quotes.spec.ts:246`. `quotes.spec.ts:137`. `refunds.spec.ts:54`. `requests.spec.ts:284`. Owner: calendar and listing specs. |
| clean-1 | pass | `booking.routes.e2e.spec.ts:184`. `Quote.spec.ts:81`. `Quote.spec.ts:36`. `Refund.spec.ts:53`. `BookingRequest.spec.ts:85`. `listing.routes.e2e.spec.ts:131`. |
| clean-2 | pass | `booking.routes.e2e.spec.ts:184`. `SearchListingsQueryHandler.spec.ts:76`. `quote.routes.e2e.spec.ts:99`. `Refund.spec.ts:53`. `booking.request.expiry.e2e.spec.ts:68`. `listings.routes.e2e.spec.ts:157`. |
| clean-3 | pass | `bookings.routes.e2e.spec.ts:187`. `Quote.spec.ts:99`. `Quote.spec.ts:40`. `Refund.spec.ts:46`. `Booking.spec.ts:118`. `Booking.spec.ts:141`. |
| clean-w | pass | `booking.routes.e2e.spec.ts:142`. `calendar.routes.e2e.spec.ts:140`. `Quote.spec.ts:35`. `Booking.spec.ts:268`. `Booking.spec.ts:147,193`. `Listing.spec.ts:152`. |

---

## Change probes

Each cell gives the files to edit, then about how many lines I read to find them. For the clean trees, "+N new" counts new files in the shape of the canonical example: a command's event and handler, plus a value object or event handler. Their convention files (a storm, the domain map) are not counted. On probe 1, every tree already keeps existing quotes and bookings unchanged, because they copy the lines when they are made, so that part costs no file anywhere.

| Tree | 1. Seasonal prices | 2. `non-refundable` | 3. Traveller notice |
| --- | --- | --- | --- |
| simple-1 | **4** (~1,070): `database.ts`, `listings/listings.ts`, `listings/routes.ts`, `quotes/quotes.ts` | **2** (~80): `listings/listings.ts:10`, `bookings/cancellation.ts` | **3** (~840): `notices/notices.ts`, `bookings/bookings.ts` (create and accept), `database.ts` (`UNIQUE booking_id` and the `CHECK` on kind) |
| simple-2 | **6** (~810): `database.ts`, `listing-store.ts`, `listing.ts`, `listings.routes.ts`, `quote-pricing.ts`, `quotes.routes.ts` | **2** (~80): `listings/listing.ts:1`, `bookings/cancellation.ts` | **5** (~760): `notice.ts`, `notice-store.ts`, `booking-store.ts`, `bookings.routes.ts` (wake after accept), `database.ts` |
| simple-3 | **4** (~880): `database.ts`, `listings/listings.ts`, `listings/routes.ts`, `quotes/quotes.ts` | **2** (~80): `listings/listings.ts:10`, `bookings/cancellation.ts` | **3** (~730): `notices/notices.ts`, `bookings/bookings.ts`, `database.ts` |
| simple-w | **4** (~540): `database.ts`, `listings/calendar.ts`, `listings/routes.ts`, `quotes/quotes.ts` | **2** (~60): `listings/listings.ts:6`, `bookings/refunds.ts` | **4** (~750): `notifications/notices.ts`, `bookings/bookings.ts`, `bookings/routes.ts`, `database.ts` |
| clean-1 | **19** (16 + 3 new; ~1,340): Listing, DTOs, events, Commands index, repository, schema, terms port and query, controller, routes, route schema, module; Booking `IListingTerms`, `ListingsTerms`, `Quote.ts`, `QuoteStay` handler | **2** (~90): `CancellationPolicy.ts`, `Refund.ts` | **13** (11 + 2 new; ~870): shared-kernel events; a Booking reaction to `BookingRequestAccepted` (new), Events index, Booking module; `NoticeKind`, `Delivery`, the integration-event handler, a new handler, Events index, the repository port, the repository, `deliverySchema` (`UNIQUE booking_id`), Notifications module |
| clean-2 | **17** (14 + 3 new; ~1,350) | **2** (~80): `CancellationPolicy.ts`, `Refund.ts` (`RefundPolicy` and the switch) | **9** (8 + 1 new; ~860): the shared-kernel payload lacks `travellerId`, plus `PublishBookingConfirmedHandler`, a new accept reaction, Booking module, `Notice.ts`, `Delivery.ts`, `OweNoticeHandler`, `SqliteDeliveries`, Notifications module |
| clean-3 | **17** (14 + 3 new; ~1,300) | **4** (~300): `ListingDescription.ts`, `Refund.ts`, plus two response-schema enums (`listings.routes.schema.ts:65`, `search.routes.schema.ts:42`; documentation only) | **13** (11 + 2 new; ~800): shared-kernel events, a Booking accept reaction, Booking module, `DTOs`, `Notice`, `NoticeOwing` (the one-per-booking rule), `INoticeRepository`, `SqliteNotices` (`UNIQUE`), the IE handler, `NoticeDelivery`, module |
| clean-w | **19** (16 + 3 new; ~1,190) | **2** (~110): `ListingDescription.ts:12-13`, `Refundable.ts` | **11** (9 + 2 new; ~890): shared-kernel events, a Booking accept reaction, Events index, Booking module, `Delivery`, the IE handler, the repository port, `SqliteDeliveryRepository` (`UNIQUE`), module |

Caveat: these counts are a proxy. A clean-tree file is short and does one job, so a higher count partly reflects how the code is split, not only how much it is coupled. Probe 3 is the one where the clean trees' count reflects real work: Booking has to publish a new fact when a host accepts a request, and Notifications has to move from one notice per booking to one per recipient. The simple trees need the same per-recipient schema change (`UNIQUE booking_id` in all four).

---

## Per tree

**simple-1.** A compact layout of one service class per part. Bookings are guarded by `BEGIN IMMEDIATE` and a primary key per night, but blocking nights (`listings.ts:314-327`) is a check followed by an unguarded insert, which matters with several servers. The notice is stored in the booking's transaction and is reliable. Refusals are thrown `HttpError`s. Listings and bookings depend on each other, through `bookings/expiry` and the `booked_nights` table. Tests cover every rule. Its change probes are the cheapest (4, 2 and 3 files).

**simple-2.** The only simple tree that returns its refusals as values (`Problem`). Request expiry is a single function that every read calls, and pricing is a single function. The rules sit in route handlers rather than in a model. Listings and bookings form a cycle through `listing-store.ts:3` and `booked_nights`. Concurrency and notices are sound. Its probes are a little wider (6, 2 and 5 files).

**simple-3.** One SQL view (`unavailable_nights`) decides free nights for every path, the cleanest statement of that rule in any simple tree. Expiry, though, lives in three places: TypeScript, the view, and the sweep. Concurrency and notices are sound. Refusals are thrown `Refusal`s. Listings and bookings form a cycle.

**simple-w.** The smallest tree. Bookings plug their nights into listings' queries through registries, so dependencies run one way, but bookings reads other parts' tables directly. Notices use a lease kept in the database, which makes it the most multi-process-safe sender of the eight. Request holds are decided by the SQL clock (`SQL_NOW`), which no test can replace. Refusals are thrown.

**clean-1.** Contexts are separated properly (adapters over ports, one way), there is a versioned calendar aggregate, refusals are Result values, and time is a parameter everywhere. But the run kept the base relay, which acknowledges an outbox entry before the reaction commits (`Outbox.ts:50`). Its notice therefore crosses two such gaps, and a crash in either loses the notice of a recorded booking. Duplicate notices are prevented by `UNIQUE booking_id`. The stay limits and the hold rule are each restated on the read side. Its probes are the widest (19, 2 and 13 files).

**clean-2.** The same strengths as clean-1, and the same lossy relay. On top of that, deliveries have no uniqueness on the booking and the handler does not dedupe, so two servers relaying one outbox row would plausibly send two notices under two ids (suspected). Ownership rules sit inside the aggregates (`Listing.ownedBy`, the host check in `ListingCalendar`). Its probe 3 is the cheapest of the clean trees.

**clean-3.** Fixed the relay itself (`Outbox.ts:65-66`: wait for the reactions, then acknowledge) and enforces one notice per booking twice, through `NoticeOwing` and a unique key. Expiry is one function, `statusAt`, which the read side reuses, and search asks the calendar aggregate, so it has the fewest restated rules of the clean trees (only the stay limits). One window is suspected: a reaction that fails without a crash is still acknowledged.

**clean-w.** Built a unit of work that holds writes until the commit and re-checks versions at write time. It fixed the relay like clean-3, uses a unique key on deliveries, and is the only tree with a single stay-limits function (`Stay.isWithin`). The hold rule is restated in SQL (`NIGHT_STILL_TAKEN`). A conflict found only at commit ends as an unnamed ERROR and is not retried. It has the same suspected failed-reaction window as clean-3.
