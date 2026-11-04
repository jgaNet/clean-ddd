# 72. A claim decided with money

When an administrator agrees with a traveller who paid through OpenStay, the traveller should get the money back, not only a decision.

- **The claims.** As request 71 says: the traveller or the host side of a stay that took place opens a claim (`openedBy` `traveller` or `host`) with an `amount` in cents; an administrator (an account whose email is in `ADMIN_EMAILS`) decides it, `traveller`, `host` or `rejected`, with a `note`, once.
- **The amount decided.** For a claim the traveller opened and decided for the `traveller`, the administrator may give an `amount`, from 1 cent up to the claim's amount; without it, it is the claim's amount. The decision shows it as `decision.amount`. Every other decision has `decision.amount` `null`, and giving an `amount` with it is refused.
- **Paid through the provider.** When the booking's payment is `paid` (request 27), that decision refunds the traveller through the provider, as request 31 refunds: `POST /refunds` with the booking's provider payment, the booking's id as the `reference`, asked again until it succeeds, `refunded` only once the provider says `refund.succeeded`.
- **Never more than is still refundable.** The refund is the amount decided, or what is left to refund of what was paid if that is less: what was paid, less every refund of the booking already made or under way (the cancellation's, request 31, and the host's, request 32). A decision and a host's refund made at the same moment never together exceed what was paid. When nothing is left, nothing is sent, and the claim's `refund` is `null`.
- **Seen with the booking's refunds.** The refund is listed by `GET /v1/bookings/{id}/refunds` (request 32) as `{ id, amount, reason, by, status, at }`, with `by` the administrator's id and `reason` the decision's note; the booking's `payment.refunded` counts it, and the host's payout and statement follow, as for any refund (requests 33, 35).
- **Once.** The refund is asked once, even when the decision is sent twice or a server is killed and started again; a `refund.succeeded` delivered twice counts once (request 29).
- **Paid directly, or not paid.** On a booking whose payment was declared paid by its host (request 36), or not paid through the provider at all, the decision is recorded and nothing moves: OpenStay does not guarantee a refund made directly between the two. The claim's `refund` is `null`.
- **Decided for the host, or rejected.** Nothing moves, whoever opened the claim: OpenStay charges no traveller anything. `refund` is `null`.
- **The audit log.** Each decision is still one entry of the audit log (request 67), `action` `claim-decided`, `subjectId` the claim's id, `note` the decision's note.

The API works as request 1 says; the provider and its webhooks are request 26's:

| Provider request or webhook | |
| --- | --- |
| `POST /refunds` `{ payment, amount, reference }` | `201 { id, payment, amount, reference, status: "pending" }`; `400` when more than what is left |
| webhooks `refund.succeeded`, `refund.failed` | `data` is the refund |

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/admin/claims/{id}/decide` `{ outcome, note, amount }` | `amount` may be given, as above |
| `GET /v1/claims/{id}` | `decision` gains `amount`; the claim gains `refund: { amount, status }` or `null`, `status` `owed`, `pending` or `refunded` |
