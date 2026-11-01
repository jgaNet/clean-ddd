# OpenStay J3: hidden acceptance tests 11–25 vs. requests (fresh-agent review)

Scope: `docs/evaluations/benchmark/openstay/j3/backlog/11..25` against `acceptance/11..25` and `acceptance/openstay.ts`. I read requests 1–10 for the conventions the later requests build on. I did not review tests 1–10.
Read only. Nothing was run. Paths below are relative to `docs/evaluations/benchmark/openstay/j3/`.

Severities:
- `blocking`: an agent that implements the requests faithfully can fail the test.
- `weak`: the test checks clearly less than the request says.
- `wording`: an ambiguity or a leak in the request that would change what an agent writes.

Totals: **blocking 3, weak 12, wording 13.**

Arithmetic checked and correct:
- 15: 52 000, then [10 000, 20 000, 15 000, 15 000, 15 000].
- 16: 62 600; 65 700 with −7 000; 228 800 with −56 000; and −7 000 for 70 007 × 10 %.
- 19: 50 000.
- 21: 9 / 2 / 22 and 10 / 0 / 0.
- 22: 42 000.
- 25: 22 000 and 38 000.

Every route, body field and response field the tests use is named in a request. No test 11–23 is broken by a later request (17's default 365-day window, 24's permissions) when 1–25 are graded together at the end.

---

## Blocking

### B1. A traveller-only account must get `200 []` from the host dashboard
- **Where:** `acceptance/21-host-dashboard.acceptance.ts:38`
- **Assertion:** `expect(await api.list(\`/hosts/me/bookings?from=${day(10)}&to=${day(15)}\`, tom.token)).toEqual([]);`
- **What is wrong:**
  - `tom` is created with `roles: ['traveller']` only. `api.list` throws on anything but `200`.
  - Request 21 speaks only of hosts. It never says what an account that is not a host gets from `/hosts/me/...`.
  - Request 2 sets the precedent that a non-host is refused ("An account that is not a host cannot create one"). Request 1 allows `404` for "something … that the caller may not see". So `403` and `404` are both faithful answers for a traveller on a host-only route, and both fail this test.
  - The assertion also tests little. The isolation the request asks for ("A host sees their own listings only") is better shown by the other host, `ian`, whose listing `elsewhere` has a booking in the same range (line 31).
- **Request:** 21-host-dashboard.md:5 "A host lists the bookings of all their listings …"; :7 "**Who.** A host sees their own listings only."; 1-accounts.md:22 "`404` for something that does not exist or that the caller may not see"; 2-publish-a-listing.md:13 "An account that is not a host cannot create one."
- **Fix:** Call with `ian.token` and expect only ian's booking, or accept `200 []`, `403` or `404`.
- **Severity:** blocking

### B2. "Most recently created first" with no time gap between the two creations
- **Where:**
  - `acceptance/23-organisations.acceptance.ts:32`: `/listings/mine` equals `[kept, moved]`. The two are created back to back at lines 19–20.
  - `acceptance/23-organisations.acceptance.ts:35`: `/organisations/mine` equals `[second, first]`. Only a few HTTP calls separate the two creations, at lines 21 and 34.
- **What is wrong:**
  - The order is "the most recently created first". A faithful agent keeps a creation time and sorts on it, with ties broken by id, as request 3 does.
  - Request 1 fixes the format of times (ISO 8601), not their resolution. A store at one-second resolution is common, for example SQLite `datetime('now')` or `toISOString()` truncated to the second. With such a store, both rows usually carry the same second. Random ids then decide the order, and the test fails about half the time.
  - The kit itself knows this. Every earlier recency check separates the creations by 1.1 s: `2-publish-a-listing.acceptance.ts:107,110`, `3-search.acceptance.ts:20,22`, `6-book-instantly.acceptance.ts:126` and `13-favourites.acceptance.ts:26`. Test 23 does not.
- **Request:** 2-publish-a-listing.md:24 "the most recently created first"; 23-organisations.md:19 "`GET /v1/organisations/mine` … the most recently created first"; 1-accounts.md:23 "**times** are ISO 8601, in UTC".
- **Fix:** Add `await sleep(1100)` between the two creations in each case.
- **Severity:** blocking. The test is flaky for an implementation that is correct.

### B3. `GET /quotes/mine` ordered after a 20 ms gap
- **Where:** `acceptance/25-conditions-history.acceptance.ts:82-90`
- **Assertion:** `await sleep(20)` between the `older` and `newer` quotes, then `expect(quotes.map(...)).toEqual([[newer, true], [older, true]])`.
- **What is wrong:** This is the same defect as B2, and worse:
  - The 20 ms gap guarantees the two quotes fall in the same second almost every time.
  - A quote's creation time at one-second resolution is natural here. Request 5 defines `validUntil` as a time, and a TTL counted in seconds.
  - Ordering by that time, with ties broken by id, fails about half the time.
- **Request:** 25-conditions-history.md:6 "A traveller lists their quotes, the most recently given first"; 1-accounts.md:23.
- **Fix:** Use `sleep(1100)`.
- **Severity:** blocking

---

## Weak

### W1. An archived listing still accepting amenities or house rules is never tested
- **Where:** `acceptance/11-amenities-and-house-rules.acceptance.ts` (the whole file)
- **What is wrong:** No test archives a listing and then declares amenities or house rules on it. An implementation that lets an archived listing's amenities change passes.
- **Request:** 11-amenities-and-house-rules.md:7 "Only the listing's host declares them, and an archived listing changes no more."
- **Severity:** weak

### W2. An area search does not check the order, the dates or the filters
- **Where:** `acceptance/14-map-search.acceptance.ts:32`
- **Assertion:** `.map(each => each.id).sort()`
- **What is wrong:**
  - The ids are sorted before they are compared, so an area search may answer in any order.
  - No area search gives dates, guests or a filter.
  - An implementation whose area path skips request 3's order, request 4's blocked nights or request 12's filters passes.
- **Request:** 14-map-search.md:7 "**Everything else holds.** The dates, the guests, the filters and the order of requests 3 and 12 apply as before."
- **Severity:** weak

### W3. The highest-price filter is checked in one direction only
- **Where:** `acceptance/15-seasonal-prices.acceptance.ts:52-55`
- **What is wrong:**
  - The test sets a season above `maxPrice` on a listing whose base price is below it, and checks that the listing is found.
  - An implementation that compares the cheapest night of the stay, or of the seasons, also passes.
  - The other direction is never tested: a season below `maxPrice` on a listing whose base price is above it, which must not be found.
- **Request:** 15-seasonal-prices.md:8 "The highest-price filter of request 12 still compares the listing's nightly price, not its seasons."
- **Severity:** weak

### W4. "Bookings already given keep their prices" is tested on quotes only
- **Where:**
  - `acceptance/15-seasonal-prices.acceptance.ts:45`
  - `acceptance/16-discounts.acceptance.ts:57`
- **What is wrong:** Both tests re-read a quote after the listing changes. Neither books, then changes the season or the discount, then re-reads the booking. Invariant 8 is the point of both requests. An implementation that re-prices a booking from the listing's current terms passes.
- **Request:** 15-seasonal-prices.md:7 "Quotes and bookings already given keep their prices."; 16-discounts.md:9 "Quotes and bookings already given keep what they showed."
- **Severity:** weak

### W5. Changing the dates checks the total, not the lines or the other refusals
- **Where:** `acceptance/19-change-dates.acceptance.ts:34-41, 53-73`
- **What is wrong:**
  - Only `total` is checked after a change. An implementation that updates `total` but keeps the old `lines` passes. Test 25:73 sums the lines of the *conditions* version, not of the booking.
  - The house rules staying the booking's own are not checked.
  - The window and arrival-day refusals are not checked.
  - The absence of a second notice is not checked.
- **Request:** 19-change-dates.md:6 "the booking's lines and total are replaced. The cancellation policy and the house rules stay the booking's own."; :7 "(… the booking window, the arrival days)"; :9 "The host is not notified again".
- **Severity:** weak

### W6. A hold is never tested against a booking, or against a quote's refusals
- **Where:** `acceptance/20-holds.acceptance.ts:25-36`
- **What is wrong:**
  - The test checks that others cannot *quote*, *hold* or *block* held nights. It never checks that they cannot *book* them.
  - The case to test: `una` obtains a quote before `tom`'s hold, then books after it. Refusing that booking is the invariant-3 part of the feature. An implementation that checks holds only at quote time passes.
  - "A hold is refused for everything a quote would refuse" is not tested either: an unpublished listing, too many guests, the host's own listing, a past check-in.
- **Request:** 20-holds.md:6 "they cannot be quoted, booked, held or blocked"; :5 "A hold is refused for everything a quote would refuse."
- **Severity:** weak

### W7. The dashboard's tie-breaking order, range edges and excluded states are not exercised
- **Where:** `acceptance/21-host-dashboard.acceptance.ts:26-37`
- **What is wrong:**
  - The two bookings listed have different check-in dates. The orders "then by listing id, then by booking id" are never reached.
  - No booking touches an edge of the range, so which edge is inclusive is never tested.
  - Only a cancelled booking is shown to be excluded. Declined and expired ones are not.
- **Request:** 21-host-dashboard.md:5 "whose stay overlaps a range of dates: requested and confirmed ones only, ordered by check-in date, then by listing id, then by booking id."
- **Severity:** weak

### W8. A bulk block is refused only because of a booked night
- **Where:** `acceptance/22-bulk-calendar.acceptance.ts:41-68`
- **What is wrong:**
  - A bulk block is refused for a *booked* night only. *Requested* and *held* nights, which the request names, are untested.
  - For bulk seasons, only a listing that belongs to someone else is tested. A listing that does not exist is not.
- **Request:** 22-bulk-calendar.md:7 "(a night already booked, requested or held, for a block)".
- **Severity:** weak

### W9. Organisation membership is not tested from the owner's side
- **Where:** `acceptance/23-organisations.acceptance.ts:38-57`
- **What is wrong:**
  - The test refuses `ian` moving a listing into `hal`'s organisation. That is the non-owner case.
  - It never refuses the *owner* moving a listing they do not host. That is `hal` moving `iansListing` into his own organisation.
  - It never tests "one organisation at most": moving a listing that already belongs to an organisation.
- **Request:** 23-organisations.md:6 "The owner moves a listing they host into the organisation. A listing belongs to one organisation at most".
- **Severity:** weak

### W10. A manager adding a member is refused for the wrong reason
- **Where:** `acceptance/24-collaborators.acceptance.ts:86`
- **Assertion:** `mia` (manager) adds `x@changes.test` and is refused.
- **What is wrong:** No account has that email, so the request is refused even on a server that lets managers add members. The assertion cannot fail on the implementation it is meant to catch. It should use an existing account's email, for example `ian.email`.
- **Request:** 24-collaborators.md:5 "The owner adds an account to the organisation by its email".
- **Severity:** weak

### W11. Most of request 24's permissions are untested
- **Where:** `acceptance/24-collaborators.acceptance.ts:40-79`
- **What is wrong:** Only these are tested:
  - a manager blocking, describing, setting the booking mode and accepting a request;
  - a viewer reading a draft, a booking and a listing's bookings.

  These are untested:
  - a manager cancelling *as the host*, which should give `cancellation.by: 'host'` and a full refund;
  - a manager declining a request;
  - a manager publishing, suspending or archiving;
  - a member reading a booking's history or the traveller's `contact`;
  - a viewer reading a draft's calendar;
  - "A member gains nothing over the listings of another organisation". `outside` is in *no* organisation, so the other-organisation case is never built.

  The feature exists to change permissions across earlier features, and most of those features are not covered.
- **Request:** 24-collaborators.md:6 "accept and decline requests; cancel bookings as the host; read their bookings, their history and the traveller's contact."; :7 "(drafts included, calendars, bookings, history, contacts)"; :9 "A member gains nothing over the listings of another organisation".
- **Severity:** weak

### W12. Conditions are read only by the traveller and the host
- **Where:** `acceptance/25-conditions-history.acceptance.ts:36, 59, 74`
- **What is wrong:** The request extends reading to "anyone who may read the booking", which means organisation members since request 24. No member reads them. The first version's `lines` are not checked either; only its `total` is, at line 44.
- **Request:** 25-conditions-history.md:5 "The traveller, the host, and anyone who may read the booking read every version …"
- **Severity:** weak

---

## Wording

### R1. Request 11 never says which times are refused, and the test refuses `25:00`
- **Where:** 11-amenities-and-house-rules.md:6; the test is `acceptance/11-amenities-and-house-rules.acceptance.ts:49`.
- **What is wrong:**
  - The request says the times are "each as `HH:MM`". It never says a time is refused, or that hours stop at 23.
  - `25:00` has the `HH:MM` format, so an agent that checks the shape with `/^\d{2}:\d{2}$/` accepts it and fails line 49.
  - Most agents will check the range, so the risk is low. One sentence would remove it: "a time that is not one (`24:00`, `noon`) is refused".
- **Request:** 11-amenities-and-house-rules.md:6 "from what time guests may arrive, and before what time they leave, each as `HH:MM`"
- **Severity:** wording

### R2. `pets=false` has no meaning
- **Where:** 12-search-filters.md:17
- **What is wrong:** "`pets` is `true` when given" leaves `pets=false` open. It could be ignored, mean "listings that do not allow pets", or be refused. Agents will differ. No test depends on it.
- **Request:** 12-search-filters.md:17 "`pets` is `true` when given"
- **Severity:** wording

### R3. Which listings can be saved to favourites is unclear
- **Where:** 13-favourites.md:5-6
- **What is wrong:**
  - "A listing that cannot be seen (a draft, or one that does not exist)" leaves out suspended and archived listings. Under request 2, those cannot be seen by a traveller either.
  - A host *can* see their own draft. It is unclear whether the host may save it.
- **Request:** 13-favourites.md:5 "saves a published listing"; :6 "A listing that cannot be seen (a draft, or one that does not exist) cannot be saved."
- **Severity:** wording

### R4. A partial box is not covered
- **Where:** 14-map-search.md:8
- **What is wrong:** Only some of `south`, `west`, `north` and `east` given, or a non-numeric coordinate, is in none of the listed refusals. Agents may ignore the partial box or refuse it.
- **Request:** 14-map-search.md:8 "neither a city nor an area, a box whose south is above its north …"
- **Severity:** wording

### R5. Seasons and price reads have no stated range limits
- **Where:** 15-seasonal-prices.md:5-6
- **What is wrong:** A season's range has no stated limits: at least one night, at most 365 as for blocking in request 4. Neither does `GET /prices`. Agents will invent different limits, and a bulk season (request 22) inherits them.
- **Request:** 15-seasonal-prices.md:5 "for a range of nights (from a date, up to the night before another)"
- **Severity:** wording

### R6. The discount line: rounding of a negative amount, and a 0 % discount
- **Where:** 16-discounts.md:7-8; the test is `acceptance/16-discounts.acceptance.ts:54`.
- **What is wrong:**
  - "It is rounded down to the cent", next to "a negative amount", allows the line to be `Math.floor(-7000.7) = -7001`. The test expects `-7000`, the size of the discount rounded down. The sentence should say "the discount, before its sign, is rounded down".
  - A stay of 7 or more nights on a listing whose discount is 0 % may or may not get a `0` line ("a discount that applies" against "a quote with no discount has no such line").
- **Request:** 16-discounts.md:7 "It is rounded down to the cent."; :8 "with a negative amount … A quote with no discount has no such line."
- **Severity:** wording. The test depends on the first reading, which is the more natural one.

### R7. A notice above the advance limit is not addressed
- **Where:** 17-booking-window.md:5
- **What is wrong:** `minNoticeDays` above `maxAdvanceDays`, for example `{ 30, 10 }`, makes every stay impossible. The request does not say whether that is refused.
- **Request:** 17-booking-window.md:5
- **Severity:** wording

### R8. What uses up a hold, and what its traveller sees
- **Where:** 20-holds.md:7
- **What is wrong:** These are left open:
  - whether the hold is used up by the quote or by the booking;
  - whether a quote for only part of the held nights uses it up;
  - whether the holder's own calendar or search shows the held nights as taken.

  "taken for everyone else" suggests not, but the calendar and search have no notion of who is asking.
- **Request:** 20-holds.md:6 "the held nights are taken for everyone else"; :7 "quotes and books them as usual; the hold is then used up."
- **Severity:** wording

### R9. The dashboard's `to` and the set of listings it covers
- **Where:** 21-host-dashboard.md:5-6, 15-16
- **What is wrong:**
  - Neither route says whether `to` is exclusive. The occupancy test (`21-host-dashboard.acceptance.ts:51-54`, 10 nights for `day(10)`–`day(20)`) depends on the convention of requests 4, 15 and 22. A restatement ("from `from` to the night before `to`") would remove the doubt.
  - "Overlaps a range of dates" does not say whether a stay ending on `from` overlaps it.
  - Occupancy does not say whether draft, suspended and archived listings are counted.
  - Nothing says what an account that is not a host gets (see B1).
- **Request:** 21-host-dashboard.md:5 "whose stay overlaps a range of dates"; :6 "over a range of nights"
- **Severity:** wording

### R10. Request 23: a clause that can never apply, and "one organisation at most"
- **Where:** 23-organisations.md:6-7
- **What is wrong:**
  - Only the owner moves a listing, and only one "they host". So every listing of an organisation is hosted by its owner, and "its organisation's owner may do" whatever its host could can never differ from the host's own rights. An agent will build a permission layer that this request cannot exercise, or will wonder whether the owner may move *any* listing.
  - "One organisation at most" does not say whether moving a listing to a second organisation is refused or moves it.
- **Request:** 23-organisations.md:6 "The owner moves a listing they host … A listing belongs to one organisation at most"; :7 "its organisation's owner may do."
- **Severity:** wording

### R11. Request 24's list of a manager's actions leaves several out
- **Where:** 24-collaborators.md:6; the test is `acceptance/24-collaborators.acceptance.ts:61`.
- **What is wrong:**
  - The list after "everything their host may do:" omits the booking mode (7), the tourist tax (5), the location (14), the amenities (11, unless "rules" covers them) and the stay limits (4, unless "calendar" covers them).
  - An agent that reads the colon as the definition refuses `mia` setting the booking mode at line 61. The general clause covers it, so the risk is low.
  - Saying "everything, including …" or ending the list with "and anything else their host may do" would settle it.
- **Request:** 24-collaborators.md:6 "everything their host may do: describe, publish, suspend and archive them; set their calendar, prices, rules, window, days and discounts; …"
- **Severity:** wording

### R12. Request 24 does not say how members reach the host's routes elsewhere
- **Where:** 24-collaborators.md:6-9
- **What is wrong:** Request 24 says nothing about:
  - whether a manager's `/hosts/me/block` and `/hosts/me/seasonal-prices` (22) accept the organisation's listings ("is not the caller's");
  - whether `/hosts/me/bookings` and `/hosts/me/occupancy` (21) include them;
  - whether a member's quote on an organisation listing is refused as "the listing's host" (5);
  - whether a manager may move a listing to an organisation (23).

  These are the cross-feature edges of "the change not announced in advance". Agents will differ on every one.
- **Request:** 24-collaborators.md:6 "everything their host may do"; 22-bulk-calendar.md:7 "is not the caller's"; 21-host-dashboard.md:7 "A host sees their own listings only."
- **Severity:** wording

### R13. `valid` for a quote already booked, and `since` for a request
- **Where:** 25-conditions-history.md:5-6
- **What is wrong:**
  - "whether it is still valid" does not say whether a quote that has already been booked is still `valid` until its TTL.
  - For a request-mode booking, the first version's `since` could be the time of the request or the time it was accepted.
- **Request:** 25-conditions-history.md:6 "each with whether it is still valid"; :5 "when each began (`since` …)".
- **Severity:** wording

---

## What was done with each finding

Every finding was read against the requests, before any run.

**Blocking: all closed in the tests.**
- **B1:** the dashboard is now read by `ian`, another host, who sees his own booking only. Request 21 now says that an account that is not a host is refused.
- **B2, B3:** a pause of 1.1 s now separates every two creations whose order is checked, as in the earlier requests.

**Weak: closed in the tests where a test could say it plainly.**

| Finding | What the test checks now |
| --- | --- |
| W1 | An archived listing refuses amenities and house rules. |
| W3 | A listing whose base price is above the filter, with a season below it, is not found. |
| W4 | A booking keeps its total after a season changes its nights (15). |
| W5 | After a change of dates, the booking's host lines are the new nights and the fee, and its lines add up to its total. |
| W6 | A booking made with a quote given before the hold is refused. A hold is refused for the host and for too many guests. |
| W8 | A bulk block is refused on a requested night. |
| W9 | The owner cannot move a listing they do not host, nor move a listing already in an organisation (the request now says so). |
| W10 | A manager adding a member is refused for an account that exists. |
| W11 | A viewer reads a booking's history. A manager cancels as the host (`cancellation.by` is `host`), and declines a request a viewer may not decline. A member of one organisation cannot act on another organisation's listing. |

Three weak findings are left as they are:
- **W2:** the area search's order is request 3's, which the earlier tests hold.
- **W7:** the dashboard's tie-breaking is stated in the request, and no test reaches it.
- **W12:** a member reading the conditions follows from W11's reading of a booking.

**Wording: applied to the requests,** all but R10's first point, which was applied by rewording the clause:

| Finding | Request | What it says now |
| --- | --- | --- |
| R1 | 11 | A time is from `00:00` to `23:59`, and `25:00` or `noon` is refused. |
| R2 | 12 | `pets` absent or `false` filters nothing. |
| R3 | 13 | Only a published listing can be saved, whoever asks. |
| R4 | 14 | A box with some of its edges and not all is refused, as is a coordinate that is not a number. |
| R5 | 15 | A season is 1 to 365 nights. |
| R6 | 16 | A discount's amount is rounded down before it is made negative, with the example. |
| R7 | 17 | A notice longer than the advance is refused. |
| R8 | 20 | For its traveller, a hold does not take the nights. It is used up when its traveller books a stay that shares a night with it. The calendar and the search show held nights as taken, whoever asks. |
| R9 | 21 | Every range runs from `from` to the night before `to`. Occupancy counts every listing the host has, whatever its state. |
| R10 | 23 | The host is the owner, and does everything as before. Moving a listing already in an organisation is refused. |
| R11 | 24 | The list of what a manager may do ends with "anything else their host may do". |
| R12 | 24 | `/hosts/me/…` stays the caller's own hosted listings. Moving a listing into an organisation stays its host's. A member quotes and books like any traveller. |
| R13 | 25 | `valid` means not past `validUntil`, booked or not. The first version's `since` is when the booking was made. |
