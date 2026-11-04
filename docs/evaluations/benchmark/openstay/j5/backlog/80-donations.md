# 80. Donations

OpenStay takes no commission, so it lives on what people choose to give. Giving should be easy, alone or when paying for a stay, and never be mistaken for the price of a stay.

- **A donation.** A signed-in account gives an amount in cents, at least 100. OpenStay asks the provider (request 26) for a payment of that amount, with `donation:<the donation's id>` as its `reference`, and gives the donor the provider's `payUrl`, as the provider gave it. The donor pays there. The provider is asked once per donation, even when a server is killed and started again.
- **Beside a booking.** The donor may name one of their own bookings (`bookingId`), to give when paying for it: the donation is still a payment of its own. Naming a booking that is not the caller's is refused.
- **Paid or failed.** A donation is `pending` until the provider says `payment.succeeded` (it is then `paid`, with the provider's `fee`) or `payment.failed` (`failed`; the donor may give again, with a new donation). Webhooks count as request 29 says: twice counts once, and `paid` is final.
- **Named or not.** A donor chooses whether their donation may be shown by name: `public`, `false` unless given. A public donation has a `name` of 1 to 100 characters, not only spaces; a public one without a name is refused. A donation that is not public has `name` `null`.
- **Never a booking's money.** A donation never changes anything a booking shows or owes: its `total`, its `payment` (amount, fee, refunded), its refunds. It is not paid out to a host (requests 33, 47), and is on no host's statement, earnings or tourist tax (requests 35, 48, 38). It takes no receipt and no receipt number (request 46): receipts stay those of bookings, numbered without a gap. It is never a commission: the platform's line of every quote and booking stays 0.
- **Reconciled.** A day's reconciliation (request 37) counts a donation's `charge` and `fee` under its `reference`, as movements OpenStay saw: a paid donation's lines match the provider's.
- **Without a provider,** a donation is refused.
- **Who.** The donor reads their donations; to anyone else a donation does not exist (`404`).

The API works as request 1 says; the provider and its webhooks are request 26's:

| Provider request or webhook | |
| --- | --- |
| `POST /payments` `{ amount, reference }` | `201 { id, amount, reference, status: "requires_payment", payUrl }` |
| webhook `payment.succeeded` | `data` is the payment, with the provider's `fee` |
| webhook `payment.failed` | `data` is the payment, and a `reason` |

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/donations` `{ amount, bookingId, public, name }` | creates the donation, `{ id }`; `bookingId`, `public` and `name` may be left out |
| `GET /v1/donations/{id}` | `200 { id, amount, bookingId, public, name, status, payUrl, fee }`, `status` `pending`, `paid` or `failed`; `bookingId` `null` when none; `fee` 0 until paid |
| `GET /v1/donations/mine` | `200 [ donation ]`, the most recent first |
