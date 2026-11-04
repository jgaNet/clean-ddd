# 61. Review rules

Reviews are only worth reading if everyone writes them under the same rules, and the rules are public. A review that breaks one says which.

- **The published rules.** Anyone, signed in or not, reads them: a comment has from 20 to 2,000 characters (counted as written, spaces included), and carries no contact details and no links.
- **Where they apply.** To the comment of a traveller's review of a stay (request 57, `POST /v1/bookings/{id}/review`), to the comment of a host's review of a guest (request 58, `POST /v1/bookings/{id}/guest-review`), and to the text of a host's reply (request 60, `POST /v1/reviews/{id}/reply`).
- **Contact details** are the ones request 53 hides in messages:
  - an email address: something, `@`, something with a dot, with no space in it;
  - a phone number: 8 or more digits, which may be separated by spaces, dots or dashes, with an optional leading `+`.
- **A link** is any `http://`, `https://` or `www.`, whatever its case.
- **A review that breaks a rule is refused, naming it.** The name is one of `COMMENT_TOO_SHORT`, `COMMENT_TOO_LONG`, `CONTACT_DETAILS`, `LINK`; when several are broken, the first in that order. A refusal at once is `422 { error: "<NAME>" }`; a refusal later is the operation's `{ status: "ERROR", error: "<NAME>" }`. Nothing is written: the author may try again, within request 57's window, since a refused review does not count as their one review.
- **Reporting a published review.** Any signed-in account but the review's author reports a published review (of a stay or of a guest), with a reason of 1 to 500 characters. An account reports a review once; a second report of the same review by the same account is refused. A review that is not published yet does not exist for anyone but its author (request 58), and cannot be reported. The report waits for the administrators (request 64), as a report of kind `review`; until then the review stays as it is, for everyone.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/review-rules` | `200 { minLength: 20, maxLength: 2000, forbidden: ["contact-details", "links"] }` |
| `POST /v1/bookings/{id}/review`, `POST /v1/bookings/{id}/guest-review`, `POST /v1/reviews/{id}/reply` | as requests 57, 58 and 60; a refusal under these rules names the rule, as above |
| `POST /v1/reviews/{id}/report` `{ reason }` | creates the report, `{ id }` |
