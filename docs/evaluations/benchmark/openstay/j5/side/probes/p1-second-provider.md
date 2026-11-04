# P1. A second provider for the hosts of one country

OpenStay opens in Switzerland. Swiss hosts must be paid through a Swiss provider, Alpenpay, which has an API and webhooks of its own. Travellers still pay through the first provider (request 26), whatever the listing.

- **A host's country.** A host says the country they are paid in when they open their payout account: `CH`, or any other code of request 84 (`FR` when not given). It is kept, and asking again gives the same account, whatever country is sent.
- **Who pays whom.**
  - A host of country `CH` is paid through Alpenpay.
  - Any other host is paid through the first provider, as before.
  - What is paid, when, once, in which currency, per booking or weekly, and what waits (a failed payout, a disabled account, a dispute, a pause) is what requests 33, 34, 39, 47, 89 and 100 say, for both providers alike.
- **Alpenpay's account.** Opening a Swiss host's payout account opens an Alpenpay recipient. The account reads `pending` while Alpenpay reviews it, `enabled` once Alpenpay verifies it, and `disabled` if Alpenpay rejects it. The `onboardingUrl` is Alpenpay's `setupLink`, passed on as it is.
- **Alpenpay's payouts.** A Swiss host's payout is an Alpenpay transfer, with OpenStay's reference as its `externalId`. It reads `pending` while Alpenpay holds it, `paid` once Alpenpay completes it, and `failed` if Alpenpay returns it; a failed one is owed again, as request 34 says.
- **Webhooks.** Alpenpay's webhooks arrive at `POST /v1/payments/alpenpay/webhook`.
  - One whose signature does not match is refused with `400` and changes nothing. So is one with no signature, or one more than five minutes old.
  - A valid one is answered `2xx`, whether OpenStay acts on it or not.
  - The same event delivered twice changes things once, and one arriving out of order never undoes a success (request 29).
- **What a host sees** works the same for both providers: the payout account, the payouts, the statement (an Alpenpay transfer is a `payout` line, at the time Alpenpay said it completed: the webhook's `occurredAt`, or the transfer's `settledAt`), the earnings by month, and the yearly report on hosts (request 94).
- **Without Alpenpay.** A server started without `ALPENPAY_URL` starts. A Swiss host's payout account is refused, and so is anything else that needs Alpenpay; everything else works as before.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/hosts/me/payout-account` `{ country }` | `country` may be left out: `FR`. `{ id, status, onboardingUrl, country }` |
| `GET /v1/hosts/me/payout-account` | `200 { id, status, onboardingUrl, country }` |
| `POST /v1/payments/alpenpay/webhook` | Alpenpay's webhooks, below |

## Alpenpay's API

Alpenpay answers at `ALPENPAY_URL`, in JSON, to requests that carry the header `X-Api-Key: <ALPENPAY_KEY>`. Amounts are integers in the currency's minor unit, as in request 87. Every `POST` takes an optional `X-Request-Id` header: the same id sent again on the same route gets the first answer again, and nothing more happens.

| Request | Answer |
| --- | --- |
| `POST /v2/recipients` `{ externalId }` | `201 { recipientId, externalId, state, setupLink }`, `state` `review` |
| `GET /v2/recipients/{recipientId}` | `200 { recipientId, externalId, state }`, `state` one of `review`, `verified`, `rejected` |
| `POST /v2/transfers` `{ recipientId, value, currency, externalId }` | `201 { transferId, recipientId, value, currency, externalId, state }`, `state` `queued`; `422` when the recipient is not `verified` |
| `GET /v2/transfers/{transferId}` | `200 { transferId, value, currency, externalId, state, settledAt }`, `state` one of `queued`, `completed`, `returned`; `settledAt` when it completed or was returned, `null` while queued |

`externalId` is OpenStay's: Alpenpay keeps it and gives it back in its answers and its webhooks.

**Webhooks.** Alpenpay says what happened by `POST /v1/payments/alpenpay/webhook`. The body is `{ eventId, kind, occurredAt, object }`, with `occurredAt` in ISO 8601. The header is `X-Alpenpay-Signature: sha256=<signature>`, where the signature is the HMAC-SHA256, in hex, of the body as sent, keyed with `ALPENPAY_WEBHOOK_SECRET`. A webhook whose `occurredAt` is more than five minutes old is refused.

| `kind` | `object` |
| --- | --- |
| `recipient.verified`, `recipient.rejected` | the recipient |
| `transfer.completed`, `transfer.returned` | the transfer |
