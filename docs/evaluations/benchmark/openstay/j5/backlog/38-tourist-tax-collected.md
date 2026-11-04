# 38. Tourist tax collected

Hosts remit the tourist tax to their city. They need to know how much they collected.

- **Collected.** For a month, per city: the tourist tax (request 5's external line) of the host's bookings paid through the provider (a payment declared by the host, request 36, counts nothing here) whose check-in falls in that month. A booking cancelled after payment counts only what was not refunded of its tax; a lapsed or never-paid booking counts nothing.
- **Who.** A host, for the listings they host.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/tourist-tax?month=YYYY-MM` | `200 [ { city, collected } ]`, cities in alphabetical order, only those with something collected |
