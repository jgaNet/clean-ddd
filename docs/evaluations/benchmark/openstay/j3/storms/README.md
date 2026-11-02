# J3's storms: what the session is asked to decide

The Clean DDD arm gets a storm with each request, decided with the maintainer before the feature runs, as in [the pilot](../../pilot/storms/README.md). This file is the session's preparation for requests 11 to 25: every hot spot they raise, with a proposal and what the alternative costs. The storms of features 1 to 10 are the pilot's, copied unchanged.

**Decided on 2026-11-01: the maintainer accepted every proposal below.** The storms are written from the decisions, one per feature, and each was validated against the three Clean DDD trees (`yarn architecture storm validate`: legal against the contract and the map, not in the code yet). Two notes from writing them:
- **12, search filters, adds nothing to the board:** the filters are parameters of `SearchListings`, which exists. Its storm records the decision only, and is done from the start.
- **The pilot's ten storms are marked done here:** every tree carries them.

The simple arm never sees any of this.

## The strategic questions

| # | Question | Proposal | The alternative, and what it costs |
| --- | --- | --- | --- |
| T1 | Do requests 11–25 need a new context? | **No.** Every term they bring belongs to a context that already speaks its language: amenities, house rules, location, seasons, discounts, the booking window and the arrival days are terms of a listing (Listings); holds, changes of dates, the dashboard and the conditions are nights and stays (Booking); organisations and members are who may act for whom (Accounts, T2). | A context per new noun (Pricing, Organisations). Each is a declaration, an ADR and new relationships before its first storm, for words that mean nothing different from what the existing contexts already say. |
| T2 | Where do organisations and their members live? | **Accounts.** An organisation is a set of accounts and what each may do: identity and access, which is Accounts' purpose. Accounts' language gains *Organisation*, *Member* and *Permission* (`manager` or `viewer`). *Role* already means traveller or host there, so a member's role is called its permission inside the model, while the API keeps the request's word. No new relationship: Listings and Booking already ask Accounts through ports they own. | **A context of its own** (Organisations, generic). Cleaner if organisations grow (billing, invitations), at the price of a context, an ADR and two new relationships now. Splitting later is a move. |
| T3 | Who decides who may act on a listing, once request 24 exists? | **Listings, for the listing; Booking, for its bookings; each through a port it owns** (`Collaborators`), answered over Accounts' read model: "what may this account do in this organisation". The listing carries its `organisationId` (request 23), and Booking reads it with the terms (`ListingTerms` gains it). A refusal stays the deciding context's. | **Accounts answers "may X act on listing L"** directly. Accounts would then have to know listings, which reverses the dependency the map declares. |
| T4 | How does a quote read terms that now vary by night (seasons, request 15) and by stay (discounts, window, days)? | **`ListingTerms` grows:** it answers a listing's terms for a range of nights (each night's price, the discounts, the window, the arrival days, the house rules). The quote computes its lines in Booking, as today, and keeps what it read. | **Listings computes the price** and Booking asks for a total. The quote's lines would then be decided in two contexts, and request 19's repricing in a third place. |
| T5 | The context map | **Unchanged**, apart from the language of Accounts and Listings (the new terms of T2 and T4). The session's outcome is one commit on each Clean DDD tree: the language in the domain map, with ADR 3 recording T1–T4. | — |

## The hot spots of each feature

| Feature | Hot spot | Proposal |
| --- | --- | --- |
| 11 Amenities and rules | The list and its order | A value object in Listings that keeps the request's order whatever the order sent; an unknown amenity is refused by the domain, not by the schema (API-BODY-SHAPE). |
| 11 | Kept as accepted | The quote and the booking copy the house rules they were made under, as they copy the policy (S6). |
| 12 Filters | Where the filters run | In the search Booking serves (S4): Listings' candidates are asked with the filters, through `ListingTerms`; a malformed filter is a `400` of the query. |
| 13 Favourites | Whose list | Listings, one `Favourites` aggregate per traveller, holding listing ids with when each was added. Favouriting twice changes nothing; a listing nobody can see is refused. |
| 14 Map | The box | A `Location` value object on the listing; the box is a query parameter, its edges inclusive, checked by the query. |
| 15 Seasons | Where the seasons live | On the `Listing`, as part of its terms: a later season replaces an earlier one on the nights they share, an invariant of one aggregate. The price of each night is read through `ListingTerms` (T4). |
| 16 Discounts | Which one applies | The quote's rule, in Booking: monthly from 28 nights, else weekly from 7, on the nights line only, rounded down, as a line for the host with a negative amount. |
| 17 Window | Time | A parameter of the quote, as its validity is (DOMAIN-NON-DETERMINISM). |
| 18 Days | Weekdays | Of the dates in UTC, a rule of the quote. |
| 19 Change dates | One transaction | The `Booking` and its `ListingCalendar` change together, as booking does (S5): the calendar frees the old nights and takes the new ones; the booking replaces its lines and records `BookingDatesChanged`. No notice (request 19). |
| 20 Holds | What a hold is | Its own aggregate, `Hold`, whose nights are taken in the `ListingCalendar` like a request's, with an expiry. A hold past its time is free for everyone at once: the calendar decides with the time as a parameter, so no sweep is needed for correctness. |
| 20 | Three at most | A rule over a traveller's holds: a repository count in a domain service, checked then written. Two holds made by the same traveller at the same instant may then both pass; the alternative is one aggregate per traveller holding their holds, which a race cannot pass. **Proposal: the per-traveller count, accepting the window**, since no test reaches it and it costs a traveller one extra hold at worst. |
| 21 Dashboard | Whose listings | Queries in Booking; the host's listings come through `ListingTerms`, the nights from the calendars. |
| 22 Bulk | All or nothing across listings | **One transaction over several aggregates**: the handler loads every calendar (or every listing, for seasons), asks each, and saves them all in one unit of work, each with its version check, which is what refuses a booking made at the same moment. The rule "one aggregate per transaction" is broken on purpose, and the storm says why. The alternative, a saga with compensation, shows a half-blocked state to the others for a moment, which the request forbids. |
| 23 Organisations | The move | `MoveToOrganisation` is the listing's (Listings), after Accounts says, through `Collaborators`, that the caller owns the organisation. |
| 24 Members | At once | Every permission is read when the command or query runs, never cached, so a removal applies to the next request. |
| 24 | Adding again | `AddMember` with an existing member changes its permission, as the request says; one command, two facts (`MemberAdded`, `MemberPermissionChanged`). |
| 25 Conditions | Where the versions live | Child entities of the `Booking` (`ConditionsVersion`): few, written with the booking, never changed. Version 1 is written when the booking is made; request 19's change adds one. |
| 25 | A traveller's quotes | A query over the quotes, with `valid` decided with the time as a parameter. |
