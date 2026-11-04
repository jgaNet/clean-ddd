# J4's storms: what the session is asked to decide

The Clean DDD arm gets a storm with each request, decided with the maintainer before the feature runs, as in [the pilot](../../pilot/storms/README.md) and [J3](../../j3/storms/README.md). This file is the session's preparation for the defect report and requests 26 to 50: every hot spot they raise, with a proposal and what the alternative costs. The storms of features 1 to 25 are J3's, marked done.

**Decided on 2026-11-02: the maintainer accepted every proposal below.**
- The storms are written from the decisions, one per feature, and each was validated against the three Clean DDD trees after the J4 session's commit (`storm validate`: legal against the contract and the map; not in the code yet).
- Four add nothing to the wall: 25.1, 29, 40 and 44 hold rules on existing stickies or on infrastructure. Their storms record the decisions only, and are done from the start.
- Writing them added three relationships to the session's map:
  - Listings → Payments (a port, for who may refund or declare a payment);
  - Accounts → Listings and Accounts → Booking (integration events, for closing an account).

The simple arm never sees any of this.

## The strategic questions

| # | Question | Proposal | The alternative, and what it costs |
| --- | --- | --- | --- |
| U1 | Where does money live? | **A new context, Payments** (supporting): payments, refunds, payouts, the ledger, disputes, reconciliation, receipts. The framing proposed it ([j0](../../j0.md#a-candidate-strategic-model-for-the-clean-ddd-arm)). Direct payments declared by the host (36) stay in it, as a payment that never went through the provider. It is declared in the J4 session's commit, with the relationships below, `planned`. | **Money inside Booking.** One context fewer, but the core's transactions would hold an unreliable outside system, which ADR-level reasoning kept out of it for notices (S10). Or **two contexts** (provider payments, direct payments): a second context for one status. |
| U2 | How do Booking and Payments know of each other? | **By integration events both ways, and one port.** Booking publishes what it already decides: a booking confirmed (with its total, host lines, tax and check-in), cancelled (with its refundable amount), lapsed. Payments publishes `BookingPaid`. Booking keeps "paid" as a fact of the booking, so that the lapse is Booking's own rule. Booking shows a booking's `payment` through a port it owns (`PaymentStatus`), answered over Payments' read model. | **A port only, in one direction.** Booking would ask Payments "is it paid" at the lapse, and Payments would ask Booking for amounts. That is two ports in opposite directions, the coupling S4 avoided. |
| U3 | Where is the provider? | **Behind a port Payments owns** (`PaymentProvider`), named for what it decides (DOMAIN-NON-DETERMINISM). The webhook route is Payments' presentation. It checks the signature, then hands each event to a command. | Calling the provider from handlers directly: the provider's words would leak into the model. |
| U4 | How does a webhook change things once, in any order? | **The provider's event id is recorded in Payments, in the transaction that applies it.** A known id changes nothing. Each payment, refund and payout moves only forward (`requires_payment` → `requires_action` → `succeeded` or `failed`; `succeeded` is final), so a late event cannot undo a later one. | Ordering by the event's `created` time: the provider's clock decides, and two events in the same second tie. |
| U5 | Who runs the work nobody asks for (lapses, payouts, retries)? | **Scheduled sweeps,** started by the composition root every `JOBS_INTERVAL_SECONDS`, each a command with the time as a parameter. They take their context from the transport (the unit-of-work guide). | One timer per booking: lost on a restart. |
| U6 | Who is an administrator (37)? | **Accounts decides,** from `ADMIN_EMAILS`, read by the composition root and given to the handler. Payments asks through a port it owns (`Administrators`). | A role in the token: the J1 decision S7 refused it. |
| U7 | How do the contexts move to PostgreSQL (40)? | **One database, one schema per context.** Each context's adapters move into their schema, the outbox and each inbox included. A unit of work is one transaction over the database. Nothing outside Infrastructure changes. | One schema for all: contexts could then read each other's tables, which the import rules cannot see. |
| U8 | Does Pricing become a context (41)? | **Yes, at 41.** Seasons, discounts, last-minute prices, extra guests, codes and bulk prices leave Listings for a Pricing context. The quote asks Pricing for a stay's price lines through a port it owns (`StayPrices`), in place of the price parts of `ListingTerms`. The agent of feature 41 does the move, as an architecture task with its ADR. The split is what the framing asked J4 to measure. | **No split:** cheaper at 41, and nothing to measure. The prices keep growing inside Listings. |
| U9 | The context map | **New relationships, declared `planned` in the J4 session's commit:** Booking → Payments (published language: integration events); Payments → Booking (published language: `BookingPaid`; and the port `PaymentStatus`); Accounts → Payments (port `Administrators`, and the hosts' accounts); at 41, Pricing → Booking (port `StayPrices`), with Listings → Pricing (port: whose listing it is); and, at 49, Booking, Listings and Payments → Accounts (ports Accounts owns for the export). | — |

## The hot spots of each feature

| Feature | Hot spot | Proposal |
| --- | --- | --- |
| 25.1 Own routes | Where the rule goes | In the bulk handlers' check, "the caller hosts the listing", never through the collaborators port. |
| 26 Payout accounts | Whose account | Payments' `PayoutAccount` aggregate, one per host, its status changed only by the provider's event. |
| 27 Paying | What a payment is | Payments' `Payment` aggregate, one per booking, opened by the confirmed booking's integration event. "Paying again" returns the payment under way (the aggregate's rule). |
| 27 | The fee | Taken from the provider's event as it is: a value, never computed. |
| 28 Authentication | A state | `requires_action` on the payment, with its `actionUrl`. |
| 29 Webhooks | Once, in any order | U4. |
| 30 Lapse | Whose rule | Booking's (U2): it knows "paid" from `BookingPaid`, and its sweep lapses what is past `dueBy`. A payment that succeeds after the lapse is refunded by Payments, on Booking's `BookingLapsed`. |
| 31 Refunds | Owed, pending, refunded | A `Refund` aggregate in Payments, opened by the cancelled booking's event, with the refundable amount the event carries. |
| 32 Host refunds | Never more than paid | The `Payment` aggregate holds what was refunded and refuses more. Its version check refuses the second of two refunds made at once. |
| 33 Payouts | Never twice | A `Payout` aggregate, opened once per booking (a key on the booking), by the sweep. |
| 35, 48 Statement, earnings | Where the lines come from | A ledger read model in Payments, written by each fact the provider confirms. |
| 37 Reconciliation | Comparing | A query over the ledger and the provider's transactions (through the port). |
| 38 Tax | Where | A query on the ledger, with the tax each booking event carried. |
| 39 Disputes | Payout held | A state on the `Payment`, which the payout sweep reads. |
| 40 PostgreSQL | U7 | Done by the agent of feature 40, as an architecture task, with its ADR. |
| 41 to 45 Pricing | U8 | |
| 43 Codes | The last use | A `PromotionCode` aggregate whose uses are taken in the booking's transaction, behind its version check. |
| 46 Receipts | No gap | A sequence in Payments, taken in the transaction that records the success: the store decides the number (a counter row behind the version check, or a database sequence that never rolls back is *refused*: a rolled-back transaction would leave a gap). |
| 47 Weekly payouts | The schedule | On the `PayoutAccount`. |
| 49 Export | Who assembles it | Accounts, through ports it owns over each context's read model (Booking, Listings, Payments), declared as relationships. |
| 50 Closing | What each context does | Accounts publishes `AccountClosed`; Listings archives the listings and forgets the favourites, Booking forgets the holds and stops showing the contact. The refusal while a stay is to come is a question Accounts asks Booking through a port. |
