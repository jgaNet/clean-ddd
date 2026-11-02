# 26. Payout accounts

Money now goes through OpenStay. It never keeps any of it: what travellers pay goes to the hosts, through a payment provider, and the provider's fee is the only cost (requests 27 and 33). This request and the next ones say how.

- **The provider.** OpenStay works with one payment provider, at `PAYMENT_PROVIDER_URL`, with the key `PAYMENT_PROVIDER_KEY`. Its API is below. The provider is the only one who knows what happened to money: OpenStay believes a payment, a refund or a payout happened when the provider says so, by a webhook, and not before.
- **Webhooks.** OpenStay receives the provider's webhooks at `POST /v1/payments/webhook`. A webhook whose signature does not match `PAYMENT_WEBHOOK_SECRET`, or has none, or is more than five minutes old, is refused with `400` and changes nothing. One that is valid is answered `2xx`, whether OpenStay acts on it or not.
- **A payout account.** To be paid, a host connects an account with the provider. OpenStay asks the provider to open one, and keeps it: asking again gives the same account, never a second one. The host finishes the onboarding at the provider (`onboardingUrl`).
- **Its status.** An account is `pending` until the provider says it is `enabled`, or `disabled`, by an `account.updated` webhook. Nothing else changes it: not the host, not OpenStay.
- **Who.** A host, for themselves. Only the host reads their account.

The API works as request 1 says. Amounts are integers of euro cents, as everywhere.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/hosts/me/payout-account` | opens the host's account with the provider, or gives the one already open: `{ id, status, onboardingUrl }` |
| `GET /v1/hosts/me/payout-account` | `200 { id, status, onboardingUrl }`; `404` while the host has none |
| `POST /v1/payments/webhook` | the provider's webhooks, below |

## The provider's API

The provider answers at `PAYMENT_PROVIDER_URL`, in JSON, to requests that carry `Authorization: Bearer <PAYMENT_PROVIDER_KEY>`. Amounts are integers of euro cents. Every `POST` takes an optional `Idempotency-Key` header: the same key sent again on the same route gets the first answer again, and nothing more happens.

| Request | Answer |
| --- | --- |
| `POST /accounts` `{ reference }` | `201 { id, reference, status, onboardingUrl }`, `status` `pending` |
| `GET /accounts/{id}` | `200 { id, reference, status }`, `status` one of `pending`, `enabled`, `disabled` |
| `POST /payments` `{ amount, reference }` | `201 { id, amount, reference, status, payUrl }`, `status` `requires_payment`: the payer pays at `payUrl` |
| `GET /payments/{id}` | `200 { id, amount, reference, status, fee, refunded }` |
| `POST /refunds` `{ payment, amount, reference }` | `201 { id, payment, amount, reference, status }`, `status` `pending`; `400` when the amount exceeds what is left to refund |
| `POST /payouts` `{ account, amount, reference }` | `201 { id, account, amount, reference, status }`, `status` `pending`; `400` when the account is not enabled |
| `GET /transactions?date=YYYY-MM-DD` | `200 [ { id, type, amount, reference, object, at } ]`: every movement of money that day, `type` one of `charge`, `fee`, `refund`, `payout`, `dispute`; money coming in is positive, money going out negative |

`reference` is yours: the provider keeps it and gives it back, in its answers, its transactions and its webhooks.

**Webhooks.** The provider says what happened by `POST /v1/payments/webhook` to the application, with a body `{ id, type, created, data }` and a header `Provider-Signature: t=<unix seconds>,v1=<signature>`. The signature is the HMAC-SHA256, in hex, of `<t>.<the body as sent>`, keyed with `PAYMENT_WEBHOOK_SECRET`. The application answers `2xx` once it has handled an event, or decided to ignore it; anything else, and the provider sends it again, about every half second, up to twenty times.

| `type` | `data` |
| --- | --- |
| `account.updated` | the account, with its new `status` |
| `payment.requires_action` | the payment, and the `actionUrl` where the payer must act |
| `payment.succeeded` | the payment, with the provider's `fee` |
| `payment.failed` | the payment, and a `reason` |
| `refund.succeeded`, `refund.failed` | the refund |
| `payout.paid`, `payout.failed` | the payout |
| `dispute.created` | `{ id, payment, amount }` |
| `dispute.closed` | `{ id, payment, amount, outcome }`, `outcome` `won` or `lost` |
