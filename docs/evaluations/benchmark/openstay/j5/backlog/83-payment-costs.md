# 83. The cost of payments

Taking money is not free. Administrators want to see, month by month, what the provider took, on which payments, and who bore it.

- **Through the provider.** For a month, the payments through the provider that succeeded during it (when the provider said `payment.succeeded`, as on the host's statement, request 35), bookings' (request 27) and donations' (request 80) alike:
  - `payments`: how many;
  - `amount`: what they took, added up;
  - `fees`: the provider's fees for them, each as the provider gave it.
- **Who bore the fees.** A booking's fee is borne by its host: it comes off what the host is paid (request 33). A donation's fee is borne by OpenStay: it receives the donation less the fee. `boreByHost` adds up the first, `boreByOpenStay` the second, and together they are `fees`. A booking's fee stays its host's even when the booking was cancelled or lapsed and refunded afterwards.
- **Directly.** For the same month, the bookings their host declared paid directly during it (request 36, or by confirming a transfer, request 73):
  - `payments`: how many;
  - `amount`: their totals, added up;
  - `fees`: 0. OpenStay sees no fee for money it never handled.
- **What counts nothing.** A payment that failed, a payment still under way, and a refund: refunds give no fee back and change nothing here.
- **Months** are in UTC, by OpenStay's time (request 57: the machine's time plus `CLOCK_OFFSET_DAYS`). A month with nothing reads zeros everywhere.
- **Who.** Administrators only: the accounts whose email is in `ADMIN_EMAILS`, a comma-separated list (request 37). Anyone else gets `403`.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/payment-costs?month=YYYY-MM` | `200 { month, provider: { payments, amount, fees, boreByHost, boreByOpenStay }, direct: { payments, amount, fees } }`; `400` without a valid month |
