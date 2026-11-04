# 94. The yearly report on hosts

Platforms in the European Union report each year what their hosts earned through them (the DAC7 rules). OpenStay's administrators need the figures, host by host.

- **Administrators.** The accounts whose email is in `ADMIN_EMAILS` (a comma-separated list, request 37). Only they read the report: anyone else gets `403`. Reading it changes nothing and is no entry of the audit log.
- **Which bookings count.** For a year, a booking counts when:
  - its check-in date falls in that year;
  - its payment was made through the provider (request 27: `payment.status` `paid`), whatever became of the booking afterwards (cancelled included);
  - and it was not refunded in full (`payment.refunded`, request 31, is less than what was paid).

  A payment declared paid by the host (request 36), or never paid, counts nothing.
- **One row per host, country and currency.** The host is the booking's `hostId`. The country is the listing's `country` (request 84, `FR` for a listing that never set one), and the currency the booking's (request 87). Each row says:
  - `bookings`: how many bookings count;
  - `nights`: their nights, by their current dates;
  - `paid`: what was paid for them through the provider, less what was refunded of it (`payment.refunded`);
  - `fees`: the provider's fees for those payments (`payment.fee`, request 27).

  Rows are in the order of `hostId`, then `country`, then `currency`. A host with no booking that counts has no row.
- **Reportable.** A host is `reportable` for the year when, across all their rows, they have 30 bookings or more, or `paid` of 2,000 euros or more. An amount in another currency is turned into euros at the rates an administrator set (request 88: `rates` gives the amount of a currency for 1 euro, so the amount divided by its rate is in euros; ¥320 000 at a rate of 160 is 2,000 euros). A currency with no rate set counts nothing towards the 2,000 euros, but its bookings count towards the 30. Every row of a host carries the same `reportable`.
- **A year that makes no sense** (not four digits) is refused with `400`.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/hosts-report?year=YYYY` | `200 [ { hostId, country, currency, bookings, nights, paid, fees, reportable } ]`, in the order above |
