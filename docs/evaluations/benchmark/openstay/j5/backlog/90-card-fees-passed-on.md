# 90. Card fees passed on where the law allows

Hosts in some countries asked why they pay for the traveller's card when the law there lets a merchant pass that cost on. Where an administrator says the law allows it, the traveller now pays the provider's fee, named on the quote before booking; everywhere else nothing changes.

- **What changes.** Until now the provider's fee was the host's cost everywhere (request 27: "the fee is the host's cost; the traveller pays the total, no more"; request 33: the host is paid what was paid, less the fee, less refunds). That stays true for every listing whose country is not on the administrator's list. For a listing whose country is on it, the fee for paying the booking is the traveller's: a line of the quote, inside the total, and the host receives their lines and the tourist tax in full. Everything else holds.
- **The countries.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) sets the countries where a card fee may be passed on, codes of request 84's list (`AT`, `BE`, `CH`, `DE`, `ES`, `FR`, `GB`, `IE`, `IT`, `JP`, `LU`, `NL`, `PT`, `US`); any other is refused. Setting it replaces the list. It is empty until set, so a server started as before behaves as before. A listing's country is its `country` (request 84) when the quote is given.
- **The provider's schedule.** The provider publishes the fee it charges: `GET /fees?amount=&currency=` answers `{ fee }`. The provider the tests play charges 1.4 % of the amount, rounded half up to the minor unit, plus 25 in `EUR`, `GBP` and `CHF`, or plus 40 in `JPY` (¥40), and charges every payment the fee its schedule gives for the payment's amount and currency, given as before in `payment.succeeded`. OpenStay asks the provider for the schedule's fees, and keeps no copy of its own.
- **The card fee line.** A quote for such a listing has a line `{ label: "cardFee", for: "external", amount }`, in the listing's currency (request 87). Its amount is the provider's fee on the whole payment, card fee included, so that the provider keeps exactly that line: the smallest amount `c` for which the schedule's fee on `t + c` is `c`, where `t` is the sum of the quote's other lines. Starting from the fee on `t`, and asking again with the last answer added, until the answer no longer changes, finds it. For example, `t` = 10,000 euro cents: the fee on 10,000 is 165, on 10,165 it is 167, on 10,167 it is 167: the line is 167, and the total 10,167.
- **Kept as given.** The total is the sum of the lines, the line included. A quote keeps its line, or has none, whatever the list says afterwards; so does the booking made from it (requests 6, 7) and its conditions (request 25). A quote given before its country was added has no line. A change of dates (request 19) is priced as a quote would be today, line or not.
- **Paying and being paid.** The payment is the booking's total, line included (request 27), and the provider's fee for it is the line. The payout is still request 33's: what was paid, less the provider's fee, less refunds; so the host receives the other lines in full. A payment declared paid directly (request 36) is declared as before.
- **The card fee is not refunded.** The provider keeps its fee: a cancellation's refundable amount (request 8) leaves the line out, whoever cancels (the traveller, the host, or the platform, request 66), and every refund of the booking together (requests 31, 32, 72) never exceeds what was paid less the line. A payment that succeeds after its booking lapsed is still refunded whole (request 30).
- **What follows.** The host's statement (request 35) and earnings (request 48) are unchanged in their rules: the `charge` is the whole payment, and the `fee` the line. A payment's receipt (request 46) is for the whole payment and gains `cardFee`, the line's amount (0 for a refund, and for a booking without the line). The cost of payments (request 83) gains `boreByTraveller`, the fees of payments of bookings with the line; `boreByHost` counts the other bookings' fees; `boreByHost + boreByOpenStay + boreByTraveller = fees`.
- **Without the provider.** A quote for a listing in a listed country is refused while the provider does not answer the schedule, or without `PAYMENT_PROVIDER_URL` (request 26). Quotes for other listings are unaffected.
- **The audit log.** Each setting of the list is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `fee-pass-through-set`, `subjectId` `fee-pass-through`, `note` `null`.
- **Who.** Only administrators set and read the list: `403` to anyone else.

The API works as request 1 says; the provider is request 26's, with request 87's currency, and gains its schedule:

| Provider request or webhook | |
| --- | --- |
| `GET /fees?amount=&currency=` | `200 { fee }`, the schedule's fee for that amount, in that currency's minor unit |
| `POST /payments` `{ amount, currency, reference }` | as before; the fee it charges is `GET /fees` for its amount and currency |
| webhook `payment.succeeded` | `data` is the payment, with its `currency` and the provider's `fee` |

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/fee-pass-through` `{ countries }` | |
| `GET /v1/admin/fee-pass-through` | `200 { countries }`, in alphabetical order; `[]` until set |
| `GET /v1/quotes/{id}`, `GET /v1/bookings/{id}` | `lines` may hold `{ label: "cardFee", for: "external", amount }`, counted in `total` |
| `GET /v1/receipts/mine` | each receipt gains `cardFee` |
| `GET /v1/admin/payment-costs?month=&currency=` | `provider` gains `boreByTraveller` |
| `GET /v1/admin/audit?subjectId=fee-pass-through` | as request 67; `action` `fee-pass-through-set` |
