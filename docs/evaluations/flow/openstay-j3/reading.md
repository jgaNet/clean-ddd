# OpenStay J3: reading of six trees after request 25

Rubric: `docs/evaluations/benchmark/openstay/j3/reading.md` (O1 to O10, three change probes). Every path below is relative to the tree's `app/` directory and read at `main`. Simple trees were diffed against their J3 starts (a495b01, d94a13c, 955dd98) and the pilot start 08b94b0; clean trees against 159c51d, 141b51f, 81b3aa0 and ccf7f75. Nothing was run, built or changed in any tree. The backlog was read; the acceptance directory and `*.acceptance.ts` files were not opened.

How the verdicts were applied (the same for both arms):

- **O1** follows the rubric literally: one rule written twice fails the item. Each cell counts the rules written twice, so trees that fail can still be compared.
- **O3**: a refusal thrown as a typed error and mapped to a 4xx by an error handler reaches the client, but it is "thrown through the request", so it gets **partial**. A refusal returned as a value gets **pass**.
- **O4**: **partial** when some decision reads the clock inline (`Date.now()` inside the deciding code, or SQL `strftime('now')`). **Pass** when every deciding function takes the time as a parameter (with or without a default) and handlers pass it in. All six trees round the discount with the same `-Math.floor((nightsAmount * percent) / 100)`. That is a float division floored, which equals the integer quotient for these magnitudes. I do not mark down either arm for it.
- **O6**: **fail** when two parts depend on each other's internals both ways (a cycle of imports or table reads). **Partial** when they are coupled both ways through ports or read models only. **Pass** when coupling is one way and through ports or read models only.
- **O10**: graded on where the permission is decided, not on how many files were touched. The file counts are reported beside the verdict.

## Summary

| Tree | O1 | O2 | O3 | O4 | O5 | O6 | O7 | O8 | O9 | O10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| simple-1 | fail (7 twice) | pass | partial | partial | pass | fail | pass | pass | pass | pass (11 files) |
| simple-2 | fail (5 twice) | pass | pass | partial | pass | fail | pass | pass | pass | pass (13 files) |
| simple-3 | fail (6 twice) | pass | partial | partial | pass | fail | pass | pass | pass | pass (9 files) |
| clean-1 | fail (4 twice) | pass | pass | pass | pass | pass | pass | partial | pass | pass (84 files) |
| clean-2 | fail (6 twice) | pass | pass | pass | pass | pass | pass | pass | pass | partial (71 files) |
| clean-3 | fail (5 twice) | pass | pass | pass | pass | partial | pass | partial | pass | pass (87 files) |

## Change probes

Each cell gives the files a developer would edit, and roughly how many lines I read to find them. Counts marked ~ are my best enumeration without making the change. Clean counts include new files (a handler, an event) but no convention files (storm, domain map, ADR).

| Tree | 1. Accountant | 2. Cleaning day | 3. Holds that cost |
| --- | --- | --- | --- |
| simple-1 | **5** (~1,300) | **1** (~300) | **4** (~700) |
| simple-2 | **6** (~1,250) | **2** (~400) | **7** (~800) |
| simple-3 | **3** (~1,000) | **2** (~350) | **4** (~700) |
| clean-1 | **~11** (~900) | **2** (~400) | **~18** (16 + 2 new; ~1,000) |
| clean-2 | **~10** (~800) | **2** (~350) | **~15** (14 + 1 new; ~900) |
| clean-3 | **~11** (~850) | **2** (~350) | **~16** (14 + 2 new; ~900) |

The files are listed in each tree's section. The count is a proxy, as the rubric says. A clean-tree file is short and does one job, so part of the higher count is how the code is split. Probe 3 is real work in every tree: the notice service today knows only notices about a booking (`booking_id NOT NULL UNIQUE` in all six), and a deposit needs a notice about a hold.

---

## simple-1 (`/runs/openstay/simple-1/app`)

**O1: fail.** Decided once:
- the price of a night: `nightlyPricesOf`, `src/listings/listings.ts:748`;
- the discount: `discountOf`, `src/listings/discounts.ts:64`;
- the quote's lines: `stayLines`, `src/quotes/quotes.ts`;
- the refund: `src/bookings/cancellation.ts:52`;
- whether a hold still holds: decided only by the sweep at `src/holds/expiry.ts:29-31`, which every read runs first;
- who may change a listing: `forChange`, `src/listings/listings.ts:879`, over `accessToListing`, `src/organisations/access.ts:15`.

Written twice:
- **stay limits**: `quotes.ts:117` and the search SQL at `listings.ts:805`;
- **booking window**: `quotes.ts:121` and `listings.ts:821`;
- **arrival days**: `quotes.ts:130` and `listings.ts:825`;
- **free nights**: `hasUnavailableNight` (`listings.ts:704`), the search SQL (`:812-819`) and the calendar SQL (`:732`);
- **request expiry**: `bookings.ts:121` (read time) and the sweep at `src/bookings/expiry.ts:37-50`;
- **quote validity**: `bookings.ts:191` and `quotes.ts:284`;
- **who may read a booking**: `accessToListing` and the membership SQL in `visibleRow`, `bookings.ts:487-491`.

**O2: pass.** Every write that takes a night runs in `inWriteTransaction` = `BEGIN IMMEDIATE` (`src/database.ts:402-412`):
- booking and request: `bookings.ts:180`;
- change of dates: `:364`;
- hold: `src/holds/holds.ts:116`;
- block and bulk block: `listings.ts:439`.

`booked_nights` and `held_nights` also have a primary key on `(listing_id, night)` (`database.ts:192,327`).

**O3: partial.** Refusals are thrown as `HttpError` (for example `holds.ts:109-112`, `bookings.ts:191`) and mapped by `src/http.ts`.

**O4: partial.** The checks take `today` as a parameter (`checkStayTerms`, `quotes.ts:110`; `releaseExpiredHolds(db, at = new Date())`). But quote validity reads the clock inline (`bookings.ts:191`, `Date.now()`), and so does the search's window (`listings.ts:820`, `todayAsDay()`). Amounts are integer cents.

**O5: pass.**
- The booking copies the quote's lines, total, policy and house rules (`bookings.ts:207-231`).
- `changeDates` replaces the lines from today's terms (`:394-399`) and keeps the policy and rules in the new version (`:403-414`).
- Versions are insert-only, enforced by triggers (`database.ts:359-375`).

**O6: fail.** There are 49 cross-directory imports, and they form cycles:
- listings imports `bookings/expiry` and `holds/expiry` (`listings.ts:8-9`), while bookings, quotes and holds import listings 12 times;
- listings imports `organisations/access` (`:4`), and organisations imports listings.

Table reads cross parts too: listings reads `booked_nights` and `held_nights` (`listings.ts:732-737,812-816`), `access.ts:20-26` joins `listings` with `organisation_members`, and `bookings.ts:111-114` joins `accounts`.

**O7: pass.**
- The notice is written in the booking's transaction (`bookings.ts:245`) and sent after the commit (`:249`). J3 did not touch the notices code.
- Bulk changes are one transaction (`listings.ts:439,505`).
- Holds, change of dates and conditions each commit with what they describe.
- No cache: the `deliveries` map (`notices.ts:53`) only de-duplicates sends in flight, under the same id.

**O8: pass.**
- Membership is read from the database on each request (`access.ts:20-33`).
- The bulk routes are host-only (`listings.ts:432,498`, scope `'host'`).
- Moving a listing is host-only (`organisations.ts:183`).
- Passwords and tokens are unchanged since the pilot.

**O9: pass.**
- discount rounding: `src/quotes/discounts.spec.ts:204`;
- seasons in a quote: `src/listings/seasonal-prices.spec.ts:350`;
- window: `src/listings/booking-window.spec.ts:245`;
- arrival days: `src/listings/arrival-days.spec.ts:271`;
- hold expiry: `src/holds/holds.spec.ts:478`;
- permissions and removal at once: `src/organisations/permissions.spec.ts:155,255,318,335`.

**O10: pass.** Commit `a1147a8` changed 11 files: 8 source, 3 spec.
- One function, `accessToListing`, answers the standing. `forChange` (`listings.ts:879-889`) applies it to every listing change: 15 call sites, about 17 actions, none of which needed an edit.
- Bookings asks it in cancel and decide (`bookings.ts:318,504`). The test `host || manager` appears 3 times.
- Earlier actions reached: about 27, counting every listing change and the booking reads, decisions and lists.

**Probes.**
1. **5 files**: `database.ts` (the role `CHECK`), `organisations/organisations.ts` (`MEMBER_ROLES`), `organisations/access.ts`, `listings/listings.ts` (`findReadable`, which must not open drafts and calendars), `bookings/bookings.ts` (`visibleRow`, contact in `toBooking`, history).
2. **1 file**: `listings/listings.ts`. Widen `hasBookedNight` and `hasHeldNight` by a night each side, and the search SQL. Every taker already calls `hasUnavailableNight` inside `BEGIN IMMEDIATE`.
3. **4 files**: `holds/holds.ts` (10 % of the nights line from `stayLines`, recorded in the hold's transaction), `notices/notices.ts`, `database.ts` (`notices.booking_id` references bookings), `app.ts` (give `Holds` the notices).

## simple-2 (`/runs/openstay/simple-2/app`)

**O1: fail.** Decided once:
- seasons: `nightPrices`, `src/listings/seasonal-prices.ts:37`;
- the discount and the lines: `src/quotes/quote-pricing.ts:16`;
- request expiry: `src/bookings/request-expiry.ts:11`;
- hold expiry: `expireHolds`, `src/holds/hold-store.ts:48`;
- who may act: `standingOn` and `mayManage`, `src/organisations/access.ts:13,27`.

Written twice:
- **stay limits**: `src/quotes/stay-terms.ts:54` and `src/listings/listing-store.ts:334`;
- **window**: `startsInWindow` (`stay-terms.ts:60`) and the SQL date arithmetic at `listing-store.ts:343`;
- **arrival days**: `stay-terms.ts:68` and `listing-store.ts:346`;
- **free nights**: `unavailableNights` (`:290`), the search SQL (`:336-342`) and `blockNightsIn` (`:195`);
- **quote validity**: `src/bookings/bookings.routes.ts:151` and `src/quotes/quotes.routes.ts:87`.

**O2: pass.** `transaction()` is `BEGIN IMMEDIATE` (`src/database.ts:12-25`). It wraps:
- booking and request: `bookings.routes.ts:340`;
- change of dates: `:446`;
- hold: `src/holds/holds.routes.ts:50`;
- block and bulk block: `listing-store.ts:195`, `src/hosts/hosts.routes.ts:119`.

**O3: pass.** Refusals are returned `Problem` values (`holds.routes.ts:50-66`, `bookings.routes.ts:121-160`). The only `throw`s are configuration errors and rethrows.

**O4: partial.** `refuseStay` takes `today`. But these read the clock inline:
- `expireHolds` (`hold-store.ts:49`);
- `expireRequests` (`request-expiry.ts:12`);
- quote validity (`bookings.routes.ts:151`);
- the search's window, through `todayUtc()`.

**O5: pass.** The booking copies the quote's lines, total, policy and house rules (`src/bookings/booking-store.ts:95-134`). `changeDates` (`:159-176`) replaces only the dates, lines and total, and records a version from the row.

**O6: fail.** There are 88 cross-directory imports. Listings imports bookings and holds (request and hold expiry) and is imported by them 25 times. Listings and organisations import each other. Listings reads `booked_nights` and `holds` (`listing-store.ts:196,290-300,336-342`).

**O7: pass.**
- The notice is recorded in the booking's transaction (`booking-store.ts:129`) and sent after the commit (`bookings.routes.ts`, `notices.wake()`).
- Bulk changes are one transaction (`hosts.routes.ts:119,153`).
- No cache.

**O8: pass.**
- `standingOn` reads membership on each request (`access.ts:13-24`).
- The bulk routes use `changeableHostedListingOf`, which is host-only (`hosts.routes.ts:34-42`).

**O9: pass.**
- discount rounding: `src/quotes/quote-discounts.spec.ts:134`;
- seasons: `src/listings/seasonal-prices.spec.ts:278`;
- window: `src/listings/booking-window.spec.ts:191`;
- arrival days: `src/listings/arrival-days.spec.ts:211`;
- hold expiry: `src/holds/holds.spec.ts:391`;
- permissions: `src/organisations/members.spec.ts:396,485,636`.

**O10: pass.** Commit `930718f` changed 13 files: 11 source, 2 spec.
- The decision is in `standingOn` and `mayManage`, and every route asks it through `managedListing` or `seenListing` (`listings.routes.ts`) and `stanceOn` (`bookings.routes.ts`).
- The `organisations` store was threaded through 23 call sites in `listings.routes.ts`. That is a mechanical edit; the check was not copied.
- Earlier actions reached: about 27.

**Probes.**
1. **6 files**: `database.ts` (`CHECK (role IN …)`, `:102`), `organisations/organisation.ts`, `organisations/access.ts`, `listings/listings.routes.ts` (`seenListing` and `canSee`), `bookings/bookings.routes.ts` (`isParty`, history), `bookings/contact.ts`.
2. **2 files**: `listings/listing-store.ts` (`unavailableNights` and the search SQL), `holds/hold-store.ts` (`heldNightsOf`).
3. **7 files**: `holds/holds.routes.ts`, `holds/hold-store.ts`, `notices/notice.ts`, `notices/notice-store.ts`, `notices/notice-sender.ts`, `database.ts`, `app.ts`.

## simple-3 (`/runs/openstay/simple-3/app`)

**O1: fail.** Decided once:
- free nights: the `unavailable_nights` view (`src/database.ts:250-262`), used by quote, booking, hold, search and calendar;
- seasons: `nightPrices` in `src/listings/listings.ts`;
- the discount and the lines: `src/quotes/quotes.ts:108,117`;
- who may act: `standingOf`, `listings.ts:753`.

Written twice:
- **stay limits**: `quotes.ts:192` and `listings.ts:587`;
- **window**: `quotes.ts:171` and `listings.ts:591`;
- **arrival days**: `quotes.ts:177-188` and `listings.ts:592`;
- **hold expiry**, three places: `database.ts:258` (the view), `src/holds/expiry.ts:10-12` and `src/holds/holds.ts:164`;
- **request expiry**, three places: `database.ts:255`, `src/bookings/bookings.ts:97-98` and `src/bookings/expiry.ts:15-18`;
- **quote validity**: `bookings.ts:182` and `quotes.ts:274`.

**O2: pass.** `inTransaction(…, 'IMMEDIATE')` (`src/transactions.ts:8`) wraps:
- booking and request: `bookings.ts:166-255`;
- change of dates: `:337-384`;
- hold: `holds.ts:89-135`;
- block and bulk block: `listings.ts:634-659`;
- bulk seasons: `listings.ts:429-443`.

**O3: partial.** Refusals are thrown as `Refusal` (`holds.ts`, `bookings.ts`) and mapped by `src/errors.ts`.

**O4: partial.** `priceStay` reads `Date.now()` inline to decide the window and "not before today" (`quotes.ts:165`). The view decides whether a request or a hold still holds with `strftime('now')` (`database.ts:255,258`), which no test can replace.

**O5: pass.** The booking keeps the quote's lines, policy and house rules (`bookings.ts:196-245`). `changeDates` writes a version with the booking's own policy and rules (`:371-381`).

**O6: fail.** There are 44 cross-directory imports. Listings imports `bookings/expiry` and `holds/expiry`, and bookings, quotes and holds import listings. The shared view joins `bookings` and `holds` from the listings side.

**O7: pass.**
- The notice is recorded in the booking's transaction (`bookings.ts:247`) and delivered after the commit (`:259`).
- Bulk changes are one IMMEDIATE transaction.
- No cache.

**O8: pass.**
- Standing is read on each request (`listings.ts:753-766`).
- The bulk routes use scope `'host'` (`listings.ts:717-731`).

**O9: pass.**
- discount rounding: `src/quotes/discounts.spec.ts:200`;
- seasons: `src/listings/seasonal-prices.spec.ts:372`;
- window: `src/listings/booking-window.spec.ts:194`;
- arrival days: `src/listings/arrival-days.spec.ts:177`;
- hold expiry: `src/holds/holds.spec.ts:416`;
- permissions: `src/organisations/members.spec.ts:672,750`.

**O10: pass.** Commit `de911bf` changed 9 files: 7 source, 2 spec.
- `standingOf` and `allowed` (`listings.ts:717,753`) replaced the old `owned`. Every listing change already went through it.
- Bookings asks `standingOn` in `visible` and `decides` (`bookings.ts:399,411`).
- Earlier actions reached: about 27.

**Probes.**
1. **3 files**: `organisations/organisations.ts` (`MEMBER_ROLES`; there is no `CHECK` in the schema), `listings/listings.ts` (`Standing`, draft and calendar reads), `bookings/bookings.ts` (`visible`, `withContact`, history).
2. **2 files**: `database.ts` (the views merge blocked and taken nights, and adjacency applies to taken nights only), `listings/listings.ts` (`hasUnavailableNight`).
3. **4 files**: `holds/holds.ts`, `notices/notices.ts`, `database.ts`, `app.ts`.

## clean-1 (`/runs/openstay/clean-1/app`)

**O1: fail.** Decided once:
- window: `withinBookingWindow`, `src/Contexts/Booking/Domain/BookingWindow.ts:21`, used by the quote (`Domain/Quote/Quote.ts:228`) and the search (`Application/Queries/SearchListings/SearchListingsQueryHandler.ts:63`);
- arrival days: `checkInAllowed`, `Domain/ArrivalDays.ts:22`, also used by both;
- seasons: `nightlyPricesOf`, `Listings/Domain/Listing/Season.ts:90`;
- the discount: `Quote.ts:280`;
- quote validity: `isValidAt`, `Quote.ts:190`;
- the refund: `Refund.ts`.

Written twice:
- **stay limits**: `Quote.ts:247` and `SearchListingsQueryHandler.ts:61-62`;
- **whether a hold or a request still holds**: `Domain/Hold/Hold.ts:150`, `Domain/ListingCalendar/ListingCalendar.ts:234-238` (`heldUntil` copied onto the calendar), and SQL at `Infrastructure/Sqlite/SqliteListingCalendarQueries.ts:29,48` and `SqliteHoldRepository.ts:38`;
- **free nights**: the calendar aggregate, and the same SQL that the quote and the search use;
- **who may change a listing**: `Listings/Domain/Listing/Listing.ts:270` and `Booking/Application/Access/listingAccess.ts:37`.

**O2: pass.** Every taker loads the versioned `ListingCalendar` and saves it with `UPDATE … WHERE version = ?` (`SqliteListingCalendarRepository.ts:58-59`), inside `BEGIN IMMEDIATE` (`src/Architecture/Infrastructure/Sqlite/SqliteUnitOfWork.ts:23`):
- booking and request: `BookStayCommandHandler.ts:93-107`;
- hold: `HoldNightsCommandHandler`, `holdNights`, then save;
- change of dates: `ChangeBookingDatesCommandHandler.ts:62-82`;
- block: `BlockNightsCommandHandler.ts:37-41`;
- bulk block: every calendar in one unit of work, `BlockNightsInListingsCommandHandler.ts:39-55`.

**O3: pass.** Refusals are `Result.fail` values. The only throw in J3 code is a programming error (`Quote.ts`, a night price not read).

**O4: pass.** The domain takes `at`: `priceStay({ at })`, `Hold.running(at)`, `ListingCalendar.holds(night, at)`, `isValidAt(validUntil, at)`. Handlers read the clock and pass it in.

**O5: pass.** The booking holds `#cancellationPolicy`, `#houseRules` and `#conditions` (`Domain/Booking/Booking.ts:111-157`). `changeDates` (`:355-363`) replaces stay and lines and pushes a version built from its own policy and rules. Versions are stored `INSERT OR IGNORE` and never updated (`Infrastructure/Sqlite/bookingConditions.ts:88`).

**O6: pass.** There are 16 cross-context imports, all one way:
- Booking imports Accounts 7 times and Listings 4 times; Listings imports Accounts 5 times;
- every one is in an `Infrastructure/<Other>/` adapter or a `module.local.ts`, against a port or a value type;
- no SQL reaches another context's tables.

Organisation listings reach Accounts through an integration event (`Accounts/Application/Events/ListingMovedToOrganisationIntegrationEventHandler.ts`).

**O7: pass.**
- The relay marks an outbox entry published only after every reaction succeeded (`src/Architecture/Application/Outbox.ts`, `relayOutbox`; `InMemoryEventBus.ts:100-106`). This was fixed at `67d53ce`, before J3, which closes the window the pilot reader named.
- `deliverySchema.ts:10` is `UNIQUE booking_id`, and the handlers check `findByBooking`.
- Hold, booking and calendar are saved in one unit of work, and bulk is one unit of work.

**O8: partial.** Membership is read on each request through `ICollaborators` (nothing is cached). But the host-only bulk routes accept managers, against request 24 and the tree's own `docs/adr/0025-collaborators-and-permissions.md:51`:
- `/hosts/me/block` checks `requireManagerOf` (`Booking/Application/Commands/BlockNightsInListings/BlockNightsInListingsCommandHandler.ts:41`);
- `/hosts/me/seasonal-prices` checks `loadListingOf`, then `Listing.authorize`, which admits a manager (`Listings/Application/Commands/SetSeasonalPriceInListings/SetSeasonalPriceInListingsCommandHandler.ts:38`, `Listing.ts:270`).

**O9: pass.**
- discount: `Booking/Domain/Quote/Quote.spec.ts:155`;
- seasons: `Quote.spec.ts:117`, `Listings/Domain/Listing/Season.spec.ts:67`;
- window: `Quote.spec.ts:202`;
- arrival days: `Listings/Presentation/API/REST/Routes/arrival-days.routes.e2e.spec.ts:161`;
- hold: `Booking/Domain/Hold/Hold.spec.ts:40`;
- permissions: `Accounts/Presentation/API/REST/Routes/organisation.routes.e2e.spec.ts:198`, `Listings/Domain/Listing/Listing.spec.ts:137`.

**O10: pass.** Commit `b0d3f28` changed 84 files: 75 source, 5 spec, 4 conventions or docs.
- The decision is one function per context, over one port: `loadListingOf` then `Listing.authorize` in Listings; `requireManagerOf`, `requireReaderOf` and `bookingStandingOf` in Booking.
- Every handler had to be edited to inject `ICollaborators`. That is 29 earlier handlers: 17 Listings commands, 6 Booking commands and 6 queries.
- The same edit carried the permission into the two `/hosts/me` bulk handlers, which is wrong (O8).

**Probes.**
1. **~11 files**:
   - Accounts: `Domain/Organisation/Permission.ts`, `organisation.routes.schema.ts` (the role enum);
   - Booking: `Application/Ports/ICollaborators.ts`, `Application/Access/bookingAccess.ts`, `Application/Access/listingAccess.ts`, `GetBookingQueryHandler.ts` (contact), `GetBookingHistoryQueryHandler.ts`, `Infrastructure/Listings/ListingsTerms.ts`;
   - Listings: `Domain/Listing/ListingVisibility.ts`, `Application/viewerOf.ts`, `Application/Ports/ICollaborators.ts`.
2. **2 files**: `Booking/Domain/ListingCalendar/ListingCalendar.ts` (`checkFree`, `changeNights`) and `CalendarExceptions.ts`. The quote's SQL read would still give a quote that the booking then refuses; a third file keeps them consistent.
3. **~18 files**:
   - Booking: `Hold.ts`, `HoldEvents.ts`, `HoldNightsCommandHandler.ts`, `holdSchema.ts`, `SqliteHoldRepository.ts`, a new event handler, `Application/Events/index.ts`, `module.local.ts`;
   - shared kernel: an integration event;
   - Notifications: `NoticeKind.ts`, `Delivery.ts`, a new integration-event handler, `Events/index.ts`, `IDeliveryRepository.ts`, `SqliteDeliveryRepository.ts`, `deliverySchema.ts`, `HttpNoticeService.ts`, `module.local.ts`.

## clean-2 (`/runs/openstay/clean-2/app`)

**O1: fail.** Decided once:
- arrival days: `checkInAllowed`, `Booking/Domain/Quote/ArrivalDays.ts:23`, used by `Quote.ts:214` and the search;
- seasons: `SeasonalPrices.pricesOf`, `Listings/Domain/Listing/SeasonalPrices.ts:70`;
- the discount: `Quote.ts:142-152`;
- the refund: `Refund.ts`.

Written twice:
- **stay limits**: `Quote.ts:218-219` and `Booking/Application/Queries/SearchListings/SearchListingsQueryHandler.ts:37`;
- **window**: `Quote.ts:211-212` compares the notice itself, and `BookingWindow.ts:24-27` (`allowsCheckIn`, used by the search) compares it again;
- **whether a hold still holds**: `Booking/Domain/Calendar/ListingCalendar.ts:206`, `Domain/Hold/Hold.ts:106`, and SQL at `Infrastructure/SqliteCalendars.ts:113,125` and `SqliteHolds.ts:94,115`;
- **free nights**: the aggregate, and the SQL the search uses (`canGiveNights`);
- **who may read a listing**: `GetCalendarQueryHandler.ts:35` restates `ListingVisibility`;
- **who may change**: see O10.

**O2: pass.**
- The calendar is versioned (`SqliteCalendars.ts:86-87`).
- Booking, hold (`HoldNightsCommandHandler.ts:50-79`), change of dates (`ChangeBookingDatesCommandHandler.ts:51-77`) and block all go through it.
- Bulk block loads and saves every calendar in one unit of work.

**O3: pass.** `Result.fail` values throughout.

**O4: pass.** Domain functions take `at` (`Hold.holds(at)`, `ListingCalendar.held(night, at)`, `allowsCheckIn(…, at)`). Handlers read the clock and pass it in (for example `ReleaseHoldCommandHandler.ts:31`).

**O5: pass.** Conditions are versions, written by `SqliteBookings.ts:175-194` from the booking's own policy and rules. `changeDates` is at `Booking.ts:336`.

**O6: pass.** There are 16 cross-context imports, one way, all in adapters or wiring: Booking imports Accounts 7 times and Listings 4 times, and Listings imports Accounts 5 times. No cross-context SQL.

**O7: pass.**
- The relay acknowledges an entry after its reactions (`src/Architecture/Application/Outbox.ts:62-71`; fixed at `75c025e`).
- The pilot's suspected double notice is closed: there is a unique index on `deliveries(booking_id)` (`Notifications/Infrastructure/SqliteDeliveries.ts:43`), and `OweNoticeHandler` checks `hasNoticeFor` (fixed at `141b51f`).

**O8: pass.**
- Membership is read on each request.
- The bulk routes are host-only: `BlockNightsInListingsCommandHandler.ts:42` passes no `actsForHost`, and `SetSeasonalPriceInListingsCommandHandler` calls `listing.setSeasonalPrice({ actorId })` with no manager flag.

**O9: pass.**
- discount: `Booking/Domain/Quote/Quote.spec.ts:69`;
- seasons: `Listings/Domain/Listing/SeasonalPrices.spec.ts:26`;
- window: `Booking/Domain/Quote/BookingWindow.spec.ts:30`, `Quote.spec.ts:112`;
- arrival days: `Quote.spec.ts:145`;
- hold: `Booking/Domain/Hold/Hold.spec.ts:40`, `ListingCalendar.spec.ts:184`;
- permissions: `Accounts/Presentation/API/REST/Routes/organisations.routes.e2e.spec.ts:223,265`.

**O10: partial.** Commit `25dbb13` changed 71 files: 64 source, 3 spec, 4 conventions or docs.
- One port per context, `permissionOver` (`Booking/Application/Permissions/permissionOver.ts`, `Listings/Application/Permissions/permissionOver.ts`).
- But what "manager" means is spelt out in each action: `actsForHost: permission === 'manager'` appears in 14 Listings command handlers and 5 Booking command handlers. Examples: `SetDiscountsCommandHandler.ts:43`, `CancelBookingCommandHandler.ts:42`, `UnblockNightsCommandHandler.ts:38`.
- The aggregates then decide (`Listing.ownedBy`, `Listing.ts:655`; `Booking.ts:310`).
- Earlier actions reached: 27 handlers.

**Probes.**
1. **~10 files**:
   - Accounts: `OrganisationPermission.ts`;
   - Booking: `Application/Ports/ICollaborators.ts`, `Infrastructure/AccountsCollaborators.ts`, `GetCalendarQueryHandler.ts`, `GetBookingQueryHandler.ts`, `GetBookingHistoryQueryHandler.ts`;
   - Listings: `Application/Ports/ICollaborators.ts`, `Infrastructure/AccountsCollaborators.ts`, `GetListingQueryHandler.ts`, `GetNightlyPricesQueryHandler.ts`.

   The 19 copies of `=== 'manager'` already refuse an accountant, so no command needs an edit.
2. **2 files**: `Booking/Domain/Calendar/ListingCalendar.ts` and `CalendarExceptions.ts`.
3. **~15 files**:
   - Booking: `Hold.ts`, `HoldEvents.ts`, `HoldNightsCommandHandler.ts`, `SqliteHolds.ts`, a new event handler, `module.local.ts`;
   - shared kernel: an integration event;
   - Notifications: `Notice.ts`, `Delivery.ts`, `OweNoticeHandler.ts`, `IDeliveries.ts`, `SqliteDeliveries.ts` (the unique index), `HttpNoticeService.ts`, `module.local.ts`.

## clean-3 (`/runs/openstay/clean-3/app`)

**O1: fail.** Decided once:
- window: `stayWithinWindow`, `Booking/Domain/Quote/BookingWindow.ts:18`;
- arrival days: `staysOnArrivalDays`, `ArrivalDays.ts:21`. Both are used by the quote and the search;
- free nights: the search asks the calendar aggregate (`Infrastructure/CalendarsOfListings.ts:13-15`);
- request expiry: `statusAt` (`Domain/Booking/Booking.ts:89-90`), reused by the read side;
- the discount: `StayDiscount.ts:29`;
- seasons: `Listings/Domain/Listing/SeasonalPrices.ts:87`.

Written twice:
- **stay limits**: `Quote.ts:94` and `SearchListingsQueryHandler.ts:53`;
- **whether a hold still holds**: `Domain/Hold/Hold.ts:139`, `Domain/Calendar/ListingCalendar.ts:257`, and SQL at `Infrastructure/SqliteHolds.ts:51,59` and `SqliteHoldQueries.ts:13`;
- **quote validity**: `Booking.ts:142` and `Domain/Quote/QuoteReadModels.ts:52`;
- **who may read a listing**: `GetCalendarQueryHandler.ts:58` restates `Listings/Domain/Listing/ListingVisibility.ts:8`;
- **who may change**: "host or manages the organisation" is written in `Listing.ts:540`, `ListingCalendar.ts:105` and `Booking.ts:267,402`, and `callerOf` is copied in both contexts (`Booking/Application/ListingCallers.ts:18`, `Listings/Application/ListingCallers.ts:18`).

**O2: pass.** The calendar is versioned (`Infrastructure/SqliteListingCalendars.ts:38-40`). Every taker goes through it:
- booking: `BookStayCommandHandler.ts:83-90`;
- hold: `HoldNightsCommandHandler.ts:51-70`;
- change of dates: `ChangeBookingDatesCommandHandler.ts:58-81`;
- block: `BlockNightsCommandHandler.ts:41-44`;
- bulk block: one unit of work.

**O3: pass.**

**O4: pass.** `statusAt(…, at)`, `Hold.isRunning(at)`, `ListingCalendar.givesEveryNight(nights, at)`. Handlers and read adapters pass `new Date()` in (for example `SqliteBookingQueries.ts:43`).

**O5: pass.** The booking keeps the policy and rules (`Booking.ts:159-160`). `changeDates` (`:313`) writes a version with its own policy and rules (`:391-392`).

**O6: partial.** There are 12 cross-context imports, all against ports. But Accounts and Listings depend on each other:
- `Accounts/Infrastructure/ListingsOfOrganisations.ts` imports `Listings/Domain/Listing/Ports/IListingQueries`;
- `Listings/Infrastructure/AccountsCollaborators.ts` imports `Accounts/Domain/Organisation/Ports/IOrganisationQueries`.

The pair is declared in `conventions/domain.yaml:146-153`. No cross-context SQL.

**O7: pass.**
- A failed reaction keeps its entry pending (`src/Architecture/Application/Outbox.ts:66-68`, `InMemoryEventBus.ts:68`; fixed at `326fed7`). This closes the pilot's suspected window.
- There is a unique key on the booking for notices.

**O8: partial.** Same defect as clean-1:
- `/hosts/me/block` builds the caller with `callerOf`, and `ListingCalendar.actsForHost` admits a manager (`Booking/Application/Commands/BlockNightsInListings/BlockNightsInListingsCommandHandler.ts:50`, `ListingCalendar.ts:104-105`);
- `/hosts/me/seasonal-prices` does the same (`Listings/Application/Commands/SetSeasonalPriceInListings/SetSeasonalPriceInListingsCommandHandler.ts:47`, then `Listing.ts:540`).

No test covers a manager on these routes. Membership is read on each request.

**O9: pass.**
- discount: `Booking/Domain/Quote/StayDiscount.spec.ts:25`;
- seasons: `Quote.spec.ts:65`;
- window: `BookingWindow.spec.ts:13`;
- arrival days: `ArrivalDays.spec.ts:19`;
- hold: `Booking/Domain/Hold/Hold.spec.ts:54`;
- permissions: `Booking/Presentation/API/REST/Routes/collaborators.routes.e2e.spec.ts:77,105`, `Accounts/Domain/Organisation/Organisation.spec.ts:95`.

**O10: pass.** Commit `89da2ce` changed 87 files: 70 source, 13 spec, 4 conventions or docs.
- One port, read through `callerOf`: one copy per context, and every action asks it.
- The aggregates decide on the `ListingCaller` value object (`src/SharedKernel/Domain/ListingCaller.ts`).
- 30 earlier handlers were edited to call it. Like clean-1, that included the two `/hosts/me` bulk handlers (O8).

**Probes.**
1. **~11 files**:
   - Accounts: `Domain/Organisation/Permission.ts`;
   - Booking: `Application/Ports/ICollaborators.ts`, `Infrastructure/AccountsCollaborators.ts`, `Application/ListingCallers.ts` (`readsThroughOrganisation`), `GetCalendarQueryHandler.ts`, `GetBookingQueryHandler.ts`, `GetBookingHistoryQueryHandler.ts`;
   - Listings: `Application/Ports/ICollaborators.ts`, `Infrastructure/AccountsCollaborators.ts`, `Domain/Listing/ListingVisibility.ts`, `GetNightlyPricesQueryHandler.ts`.
2. **2 files**: `Booking/Domain/Calendar/ListingCalendar.ts` (`take` and `givesEveryNight`) and its exceptions file.
3. **~16 files**: the same set as clean-2, with clean-3's names (`NoticeOwing` and `SqliteNotices` hold the one-per-booking rule).

---

## What differs between the arms

- **O1 fails in every tree.** The weaknesses split by arm:
  - **Shared by all six:** the search restates the stay limits.
  - **Simple trees:** all three restate the booking window and the arrival days in search SQL.
  - **Clean trees:** clean-1 and clean-3 reuse one function for both; clean-2 restates the window comparison.
  - **Hold expiry:** written more than once in all three clean trees (the aggregate, a copy on the calendar, and SQL) and in simple-3. In simple-1 and simple-2 it is decided once, by a sweep every read runs first.
  - **Clean trees, read side:** clean-2 and clean-3 restate listing visibility in `GetCalendar`.
- **O2 passes in all six, by different means.** The simple trees serialise every check-and-take under `BEGIN IMMEDIATE`. The clean trees use a versioned calendar aggregate inside `BEGIN IMMEDIATE`.
- **O3:** refusals are values in all three clean trees and in simple-2. simple-1 and simple-3 throw them.
- **O4:** the clean trees pass the time into every deciding function. All three simple trees read the clock inline somewhere: quote validity, hold or request sweeps, or SQL `now`.
- **O6:** each simple tree has an import cycle between listings and bookings (expiry helpers) and reads other parts' tables. The clean trees couple only through ports; clean-3 couples two contexts both ways.
- **O7:** no tree shows a window after J3. The clean trees' relay windows found in the pilot were fixed before J3 began.
- **O8:** two of the three clean trees (clean-1, clean-3) let a manager use the host-only `/hosts/me` bulk routes, against request 24. All three simple trees and clean-2 kept those routes host-only.
- **O10:** in all six, request 24 was decided centrally; only clean-2 copied the meaning of "manager" into each action (19 handlers).
  - Request 24 touched 9 to 13 files in the simple trees and 71 to 87 in the clean trees.
  - In the clean trees, 27 to 30 earlier handlers were each edited to receive the collaborators port.
- **Probes:**
  - Probe 2 (cleaning day) is 1 to 2 files in every tree.
  - Probe 1 (accountant) is 3 to 6 files in the simple trees and about 10 to 11 in the clean trees.
  - Probe 3 (holds that cost) is 4 to 7 files in the simple trees and about 15 to 18 in the clean trees.
  - The clean trees' probe counts are partly the cost of short, single-purpose files and of the port, event and handler each cross-context change needs.
