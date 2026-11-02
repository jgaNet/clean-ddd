# 48. Earnings by month

Hosts look at their year month by month.

- **By month.** For a year, for the host's bookings paid through the provider (a declared payment counts nothing), each month in which something happened: what was charged for the host's bookings, the provider's fees, what was refunded, and what was paid out to them, by when the provider said each happened (as on the statement, request 35).
- **Who.** A host, for the bookings of the listings they host.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/earnings?year=YYYY` | `200 [ { month, charged, fees, refunded, paidOut } ]`, `month` as `YYYY-MM`, in order, only months with something; every amount positive |
