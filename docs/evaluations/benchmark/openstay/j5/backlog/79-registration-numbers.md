# 79. Registration numbers by city

Many cities require a short-term let to show the number the town hall gave it. OpenStay must not publish a place that lacks one where the city asks for it.

- **A city's rule.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) sets whether a city requires a registration number, and its format: a regular expression the whole number must match, letters' case included, as if written `^(?:pattern)$`. Character classes (`[A-Z]`, `\d`), counts (`{3}`, `{2,5}`, `+`, `*`, `?`), groups and `|` are enough for any city. A city is named in the route and matches whatever its case, as in search (request 3). Setting it again replaces it; `required: false` lifts it, and `pattern` may then be `null`. A pattern that is not a regular expression, or none with `required: true`, is refused. No city requires a number until an administrator says so.
- **Anyone may read a city's rule,** signed in or not: a city with no rule reads `{ required: false, pattern: null }`.
- **A listing's number.** The listing's host, or a manager of its organisation (request 24), sets its registration number: 1 to 50 characters, not only spaces, kept as given, in any of the listing's states but archived. Anyone who can see the listing sees it, `null` until set.
- **Publishing.** Publishing a listing (request 2: a draft, or a listing its host suspended) whose city requires a number is refused unless the listing's number matches the city's pattern. Everything else about publishing holds.
- **Already published.** A listing published before its city's rule, or before its city or number changed, stays published. The rule is checked when a listing is published, and only then.
- **The audit log.** Each time an administrator sets a city's rule is an entry of the audit log (request 67): `{ id, at, adminId, action, subjectId, note }` with `action` `city-registration-set`, `subjectId` the city's name in lower case, and `note` `null`. It is read at `GET /v1/admin/audit?subjectId=<city in lower case>`.
- **Who.** Only administrators set a rule: the administrator route answers `403` to anyone else.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/cities/{city}/registration` `{ required, pattern }` | |
| `GET /v1/cities/{city}/registration` | `200 { required, pattern }` |
| `PUT /v1/listings/{id}/registration-number` `{ number }` | |
| `GET /v1/listings/{id}` | gains `registrationNumber`, or `null` |
