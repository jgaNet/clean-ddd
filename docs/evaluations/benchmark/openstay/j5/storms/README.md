# J5's storms: what the session is asked to decide

The Clean DDD arm gets a storm with each request, decided with the maintainer before the feature runs, as at [J4](../../j4/storms/README.md). This file is the session's preparation for requests 51 to 100: every strategic question and every hot spot they raise, each with a proposal and what the alternative costs. The storms of features 1 to 50 are J4's, marked done. The simple arm never sees any of this.

**Decided on 2026-11-04: the maintainer accepted every proposal below.**

The three Clean DDD trees have the same seven contexts at their J4 heads: Tracker, Accounts, Listings, Booking, Notifications, Payments and Pricing. As at J4, a session commit in each tree declares the new contexts, empty, and the new relationships, `planned`, with their reasons and an ADR, before feature 51 runs.

## The strategic questions

| # | Question | Proposal | The alternative, and what it costs |
| --- | --- | --- | --- |
| V1 | Where do conversations live (51–56)? | **A new context, Messaging** (supporting): conversations, messages, attachments, what is held back, a message reported. It asks Booking, through a port it owns, whether a booking between the two is paid (53) and which bookings a traveller has of a listing (51). It asks Listings, through a port, who hosts a listing and who manages it (51). The notices are Notifications', on Messaging's `MessageSent`. | **Messages inside Booking.** One context fewer, but a conversation exists before any booking (51), and Booking's language would grow a second meaning of "party". |
| V2 | Where do reviews live (57–62)? | **A new context, Reviews** (supporting): the traveller's review, the guest review, the reply, the rules, the ratings. It asks Booking through a port whether a stay took place, and its dates. Search, which is Booking's, shows a listing's rating through a port Booking owns, answered over Reviews' read model. | **Reviews inside Listings.** The rating sits beside the listing, but Listings would need a booking's facts it has never had. |
| V3 | Where do reports, flags and the moderation queue live (56, 61, 63–65, 68)? | **A new context, Moderation** (supporting): a report of any kind, the queue, the decision, the flags. Messaging, Reviews and Listings tell it of a report by an integration event. Its decision is an integration event (`ReportUpheld`, with the kind and the subject), which Listings, Reviews and Messaging each apply in their own words. The flags read Booking's `BookingCancelled` and Messaging's `ConversationStarted`. | **A report in each context.** No new context, but three queues, and the administrators' view becomes a join across three of them. |
| V4 | Who suspends an account (66)? | **Accounts decides,** as it decides who signs in. `AccountSuspended` and `AccountReinstated` are integration events. Booking cancels the host's stays to come, by the platform, and keeps its suspended hosts out of search. Payments refunds them through the path a cancellation already takes (31). | **Moderation decides.** It is where the administrators act, but who may sign in is Accounts' rule (J1's S7). |
| V5 | Where is the audit log, and the dashboard (67, 99)? | **A new context, Backoffice** (generic): the audit log and the operations dashboard. Every context that takes an administrator's decision publishes one integration event, `AdministratorDecided` `{ action, subjectId, adminId, note, at }`, in the shared kernel. Backoffice records it, through its inbox, once. The dashboard asks each context for its count through a port Backoffice owns. | **The log in each context.** No pivot, but `GET /v1/admin/audit` would have to ask six contexts, and a new decision would have to be added to the reader. |
| V6 | Where do claims and support tickets live (71, 72, 74)? | **A new context, Support** (supporting): a ticket, a claim, its answer and its decision. It asks Booking through a port whether the stay took place. A claim decided with money is an integration event, `ClaimRefundDecided`, which Payments applies as it applies a host's refund (32), capped at what is left. | **Claims in Payments.** The refund is there, but a claim is a conversation and a decision before it is money, and a claim decided for the host moves nothing. |
| V7 | Where do the city and country rules live (79, 90–93)? | **A new context, Regulations** (supporting): which cities require a registration number and its format, a city's tourist tax rules by date, its cap on nights, and the countries where a card fee may be passed on. It is the brief's versioned catalogue of rules (§8). Listings asks it at publication (79), Pricing for the tax and the card fee (90–92), Booking for the cap (93), each through a port it owns. | **Each rule in the context that applies it.** No new context, but four administrator routes in four contexts for one subject, the city, and the brief's catalogue nowhere. |
| V8 | Where do donations and the transparency page live (80–83)? | **A new context, Sustainability** (the brief's name; supporting): a donation, the donors' list, the running costs and the indicators. The money goes through Payments: Sustainability's `DonationPledged` opens a provider payment, and Payments' `DonationPaid` and `DonationFailed` come back. The indicators ask Booking and Payments through ports. | **Donations in Payments.** One fewer pivot, but Payments would carry the donors' names and a public page about OpenStay itself. |
| V9 | How does money gain a currency (87)? | **A `Money` value, amount and currency in minor units, in the shared kernel,** used by every context that carries an amount. It is an architecture change, and the agent of feature 87 makes it, with its ADR, as feature 41's agent moved Pricing. | **A `currency` field beside each amount.** Cheaper at 87, and the next rule about money has to be written in seven places. |
| V10 | Where are the languages (85, 86)? | **In the context that owns the text:** a listing's translations in Listings, an account's language in Accounts. Notifications carries it: the notice's integration events gain the recipient's language, which Accounts answers through a port Notifications owns. | **A Localisation context** holding every text in every language: a context with no rule of its own. |
| V11 | Where is the calendar sync (95–97)? | **In Booking,** which owns the nights. The outside calendars are behind a port Booking owns, named for what it answers (the nights an outside calendar holds), and its result is a plain value the calendar validates, as DOMAIN-NON-DETERMINISM says. The conflict notice is Notifications', on Booking's `CalendarConflictFound`. | **A Calendar sync context** that publishes blocks to Booking: a second owner of the nights. |
| V12 | Where are the terms, the trader information and the bank details (69, 78, 98)? | **The terms and the trader information in Accounts,** which knows who someone is and what they agreed to. Booking and Listings ask, through a port, whether the caller accepted the current terms; a booking keeps the version. **The bank details in Payments,** with the direct payments (36), so that the fraud check (69) and the transfer proof (73) sit beside them. | **Terms in Regulations.** It is a rule, but acceptance is a fact about an account. |
| V13 | The context map | **New relationships, declared `planned` in the session commit,** one per pair above, with its pattern and its reason. Each is listed in the session's ADR. | — |

## The hot spots of each feature

| Feature | Hot spot | Proposal |
| --- | --- | --- |
| 51 Conversations | One per traveller and listing, under two servers | A unique key on (traveller, listing) in the store; the second writer reads the first's conversation. |
| 52 Unread | Per reader, not per message | Each reader's last read position, kept on the conversation. |
| 53 Held back | When it lifts | Messaging asks Booking at read time (a port): masking is a view, the message is kept as written. |
| 54 Attachments | Where the bytes are | Behind a port Messaging owns (a file store), in the database for the benchmark. |
| 55 Notices | The window | Notifications' rule, on `MessageSent`: the last notice per recipient and conversation. |
| 56 Reported | Hidden for the reporter only | A per-reader exclusion in Messaging; the report itself is Moderation's (V3). |
| 57 Reviews | "A stay took place" | Reviews asks Booking through a port; `CLOCK_OFFSET_DAYS` is the clock every context is given (time is a parameter). |
| 58 Guest reviews | Published together | A `StayReviews` aggregate per booking holds both and publishes them together. |
| 59 Ratings | Kept or computed | Computed by Reviews' read side on each published review; search asks through Booking's port. |
| 60 Replies | One, final | On the review, refused when one exists. |
| 61 Rules | Shared with 53 | The patterns are Reviews' own value object; Messaging's are its own (one rule each, not a shared helper). |
| 62 Sort | Who sorts | Booking's search, with the rating from its port. |
| 63 Listing reports | One open per person | Moderation's key on (reporter, subject) while open. |
| 64 Queue | Closing every report on a subject | One decision per subject: a `ModerationCase` per subject holds its reports. |
| 65 Upheld | Applying the decision | `ReportUpheld` consumed by Listings (suspended by moderation), Reviews (removed), Messaging (hidden). |
| 66 Suspended | Cancelling the host's stays | Booking's reaction on `AccountSuspended`, one cancellation per booking, with `by: platform`. |
| 67 Audit | Once per decision | Backoffice's inbox on `AdministratorDecided` (V5). |
| 68 Flags | Counting across contexts | Moderation keeps its own counts from the facts it receives. |
| 69 Bank details | Changed recently | Payments keeps when the IBAN took its value. |
| 70 Verified | Lost on a change of address | Listings' own rule, in the behaviour that changes the city or the location. |
| 71 Claims | A stay took place | Support asks Booking through a port. |
| 72 Claims with money | Never more than refundable | Payments' `Payment` caps it, as for 32. |
| 73 Transfer proof | Lapse stopped | Booking asks Payments' port at the sweep, or Payments publishes `TransferProofSent`: the latter, so the lapse stays Booking's own rule (J4's U2). |
| 74 Support | Who may read | Support's rule, with Accounts' administrators port. |
| 75 Preferences | Which kinds | Notifications' own list; payments and security kinds always on. |
| 76 Email | The code | Accounts' aggregate; the code through Notifications. |
| 77 Two-factor | A code used once | Accounts keeps the last step used. |
| 78 Trader | Shown on listings | Listings asks Accounts through its existing port. |
| 79 Registration | Checked at publication | Listings asks Regulations (V7). |
| 80 Donations | The provider's payment | V8. |
| 81 Never ranks | The test of invariant 9 | Search knows nothing of donations: nothing to decide. |
| 82 Transparency | Its numbers | Sustainability asks Booking and Payments through ports. |
| 83 Payment costs | Who bore the fee | Payments' ledger already knows. |
| 84 Countries | Default `FR` | Listings' value object, with its default for listings that predate it. |
| 85 Languages | The best match | Listings' rule, from `Accept-Language`. |
| 86 User language | On every notice | V10. |
| 87 Currencies | Money | V9. |
| 88 Indicative | Rates | Pricing, which already shows prices. |
| 89 Payouts per currency | One payout per currency | Payments' weekly payout groups by currency. |
| 90 Card fees | Who decides | Regulations says where; Pricing adds the line, asking Payments for the provider's published fee through a port. |
| 91–92 City tax | Replaces the host's | Pricing asks Regulations for the rule in force each night. |
| 93 Night cap | Two at once | Booking checks within the listing's calendar transaction, which already prevents double bookings. |
| 94 Report on hosts | Its numbers | Payments, which knows what was paid and refunded. |
| 95–97 Calendars | V11 | — |
| 98 Terms | V12 | — |
| 99 Dashboard | V5 | — |
| 100 Pause | Every server, across a restart | A fact in Payments' store, read by the payout sweep in its transaction. |
| 90 | The change not announced | Its storm is given with request 90, never before. |
