# 92. Tax rates that change on a date

A city announces in the autumn the rate it will charge from the first of January. Administrators enter it when it is announced, not on the night it starts.

- **A city's rule, as request 91 says.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) sets a city's tourist tax rule: `per-guest-night` with an `amount`, or `percent` with a `percent` (a whole number from 1 to 10) and a `capPerGuestNight`; either with `childrenUnder`, the age under which children are exempt, or `null`. A quote may say how many of its guests are `children`. The rule applies to the listings whose `city` is that city, whatever its case, and replaces the host's own declaration (request 5: `touristTax`, per guest and night) on the nights it covers.
- **A rule from a date.** Setting a rule now takes `from`, a date: the first night it taxes. It is today when not given, so a rule set without it behaves as request 91 says. A `from` before today is refused. Today is the server's date, moved by `CLOCK_OFFSET_DAYS` (request 57: the server takes as now the machine's time plus that many days, 0 when that is not set).
- **Several rules.** A city may have several rules, each from its own date. Setting a rule with the same `from` as one the city has replaces that one; the others stay. A rule set before this request is from the day it was set. A city is named in the route and matches whatever its case, as in search (request 3): `Colmar` and `colmar` are one city, with one list of dated rules, set and read under either.
- **Each night by its own rule.** A night is taxed by the city's rule with the latest `from` on or before that night, as request 91 says for one night (the exemption, the percent of the night's price, the cap: each the rule's own). A night before every rule of its city is taxed as the host declared it: the guests times the host's amount, nobody exempt. The tax line is the sum of the nights' taxes, still one line, `for` `external`.
  - For example: a city with 300 per guest and night from 2027-01-01, and 400 from 2027-01-03; 2 guests, from 2027-01-01 to 2027-01-04: 600 + 600 + 800 = 2 000.
- **A quote does not change.** A quote and a booking keep the tax they showed, whatever rule is set afterwards, even one that starts on their nights. A change of dates (request 19) is priced as a quote for the new dates would be today.
- **Seen on the listing.** `cityTouristTax` (request 91) is the rule in force today (the latest `from` on or before today), or `null`.
- **Read by administrators.** An administrator reads a city's rules, in the order of `from`; a city with none answers `[]`.
- **The audit log.** Each rule set is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `city-tourist-tax-set`, `subjectId` the city in lower case, `note` `null`.
- **Who.** These routes answer `403` to anyone but an administrator.

The API works as request 1 says. `{city}` is the city's name, URL-encoded.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/cities/{city}/tourist-tax` `{ kind, …, childrenUnder, from }` | as request 91; `from` may be given |
| `GET /v1/admin/cities/{city}/tourist-tax` | `200 [ { from, kind, amount, childrenUnder } or { from, kind, percent, capPerGuestNight, childrenUnder } ]`, in the order of `from` |
