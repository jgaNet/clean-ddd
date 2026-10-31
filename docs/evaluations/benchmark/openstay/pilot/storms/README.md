# The Clean DDD arm's storms: proposals, waiting for the maintainer

The Clean DDD arm gets a storm with each request, decided with the maintainer before the feature runs ([decision 9](../../j0.md#decisions-for-the-maintainer)). This file is the session's preparation: every hot spot the ten requests raise, with a proposal and what the alternative costs.

**Nothing here is decided.** The per-feature storms (`<feature>.yaml`) are written only once the maintainer has answered, in the inventory's words, as [`../../../storms/`](../../../storms) shows for the notes backlog. The time the session takes is counted as the arm's cost.

The simple arm never sees any of this.

## The strategic session: the contexts and how they relate

The [candidate model](../../j0.md#a-candidate-strategic-model-for-the-clean-ddd-arm) proposed four contexts for the pilot:
- **Accounts** (generic);
- **Listings** (supporting);
- **Booking** (core);
- **Notifications** (generic).

`create` already gives the arm a fifth, the **Tracker**, which follows the operations of the asynchronous protocol.

| # | Question | Proposal | The alternative, and what it costs |
| --- | --- | --- | --- |
| S1 | Which contexts does the pilot start with? | The four above. Each is declared, in the domain map and the binding, by the feature that first needs it: Accounts at 1, Listings at 2, Booking at 4, Notifications at 10. | All four at feature 1. Contexts with nothing in them would be declared before any storm names them. |
| S2 | Where do the calendar's rules live: blocked nights, stay limits, booking mode? | **Booking.** No double booking (invariant 3) spans the blocked nights, the requests that hold nights and the confirmed bookings. They are one rule, and so in one context. The routes stay under `/listings/{id}/…`, which is only where the API puts them. | **Listings.** The rule against double booking would then cross a boundary, and need a lock or a saga between two contexts. |
| S3 | How does Booking know a listing's terms (published or not, price, fee, tax, capacity, policy, host)? | **A port Booking owns** (`ListingTerms`), answered by an adapter over Listings' read model, read when a quote is made. The quote then keeps what it read. | **Listings publishes integration events,** and Booking keeps a copy of each listing. That is more code, and it gives eventual consistency where the quote wants the current terms. |
| S4 | Where does search live? | **Booking.** It asks Listings, through the same port, for the published listings of a city that take the guests, in the stated order, then keeps the ones whose calendar can give every night. The dependency goes one way, Booking → Listings, and `GET /listings?city=…` is served by Booking. | **Listings,** asking Booking for availability through a port of its own. The two contexts would then each depend on the other, through two ports in opposite directions. |
| S5 | What keeps two bookings off the same night? | **A `ListingCalendar` aggregate** per listing, holding its blocked nights and the nights taken by each request or booking (by id). The `Booking` is its own aggregate, since a listing's bookings grow without bound. Booking or requesting takes the nights in the calendar and creates the booking in **one transaction**. The calendar's version check is what refuses the second of two travellers ([CONC-OPTIMISTIC](../../../../../../conventions/architecture.yaml)). | **The bookings as entities inside the calendar:** one aggregate per transaction, but an aggregate that grows with every booking ever made. Or **a booking that reserves its nights afterwards,** by a policy: a moment where two confirmed bookings overlap, then a compensation. |
| S6 | Is the quote its own aggregate? | **Yes, `Quote`, in Booking.** It is created with a snapshot of the terms and lines, never changes, and is read only by its traveller. A booking copies what its quote showed. | Part of `Booking`: then a quote never booked would be a booking that never happened. |
| S7 | How do Listings and Booking know an account is a host, or a traveller? | **A port each owns** (`Hosts`, `Travellers`), answered by an adapter over Accounts' read model. | The roles carried in the token. That is quicker, but a role added later would need a new token, and the roles would leave Accounts' hands. |
| S8 | How does a booking show the other party's email (feature 9)? | **A port Booking owns** (`ContactDetails`), answered over Accounts' read model, read when the booking is read, and only once it was confirmed. | A copy of the email in the booking, taken when it is confirmed: a copy to keep, for a fact Accounts owns. |
| S9 | How does a request expire with nobody acting? | **Both:** the read side shows a request past its time as expired (request 7 asks for that), and a scheduled sweep records `BookingRequestExpired`, by nobody, which frees the nights and writes the history (feature 9). Time is a parameter (DOMAIN-NON-DETERMINISM). | Only lazily, at the next command or read. The history would then show the expiry at the moment someone looked. |
| S10 | Who notifies the host? | **Notifications,** a context of its own. It reacts to `BookingConfirmed` and `BookingRequested`, integration events Booking publishes, and keeps each notice as a delivery owed until the outside service accepts it. | Booking calls the service itself. That puts an unreliable outside system in the core context's transactions. |

The relationships these proposals give, to declare in the domain map:

| Relationship | Pattern | Mechanism |
| --- | --- | --- |
| Listings asks Accounts | customer–supplier | port (`Hosts`) |
| Booking asks Accounts | customer–supplier | port (`Travellers`, `ContactDetails`) |
| Booking asks Listings | customer–supplier | port (`ListingTerms`, with search candidates) |
| Booking tells Notifications | published language | integration events `BookingConfirmed`, `BookingRequested` |

## The hot spots of each feature

| Feature | Hot spot | Proposal |
| --- | --- | --- |
| 1 Accounts | Is signing in a fact? | No: it checks and answers a token, and records nothing, as in the notes backlog. |
| 1 | One account with two roles, or two accounts? | One account, roles a set. |
| 2 Listings | The life of a listing | `Listing` aggregate with `ListingDrafted`, `ListingDescribed`, `ListingPublished`, `ListingSuspended`, `ListingArchived`. Publishing again after a suspension is `ListingPublished` again. |
| 3 Search | Who may search | Anyone. A query in Booking (S4), with the order the request states, written on the port. |
| 4 Calendar | Blocking nights already blocked, freeing nights not blocked | Freeing is idempotent; blocking a blocked night is too. Only a taken night refuses a block. |
| 5 Quote | Validity | `QUOTE_TTL_SECONDS` is read by the composition root and passed to the handler. The quote stores `validUntil`; time is a parameter. |
| 5 | The tourist tax | A term of the listing, declared in Listings (`TouristTaxDeclared`), read through `ListingTerms`. |
| 6 Book | Idempotency key | A traveller's key → the booking it made, kept by Booking. The second request answers the first booking, with no new fact. |
| 6 | A conflict between two travellers | The calendar's version check refuses the second; the base handler retries it from a fresh read, which then refuses it as nights taken. |
| 7 Request | Accept, decline | Commands on the `Booking`. Declining releases the nights in the calendar in the same transaction, as booking takes them. |
| 8 Cancel | Who computes the refundable amount | The `Booking` itself, from its own policy, its lines, who cancels and the day (a parameter). The refund is a state of the booking (`owed`), not a payment. |
| 9 History | Where the history lives | A read model of Booking's own facts, each with its actor (null for the application) and time. |
| 10 Notify | The delivery owed | A `Delivery` aggregate in Notifications: its body fixed at creation, `accepted` once the service answers 2xx, retried by a scheduled sender. The outbox and the reactions' own transactions (ADR 24, 30) carry the fact from Booking. |

## What the maintainer is asked

1. S1–S10: confirm or change each proposal.
2. Each feature's hot spots: the same.
3. Then the storms are written, validated against the Clean DDD starting tree with `yarn architecture storm validate`, and committed here, `done: false`.
