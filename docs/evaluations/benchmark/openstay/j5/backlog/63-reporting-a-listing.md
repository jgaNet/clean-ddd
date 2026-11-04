# 63. Reporting a listing

A traveller who finds a listing that is a scam, or is not what it says, needs a way to tell OpenStay.

- **A report.** A signed-in account reports a listing it can see (request 2: a published one, for anyone but its host), with a reason from this list: `inaccurate`, `scam`, `offensive`, `unsafe`, `other`; and, if it wishes, details of at most 1,000 characters. A reason outside the list is refused.
- **Not the host's own.** The listing's host cannot report it. Nor can the members of its organisation (request 24).
- **One open report per person and listing.** While an account's report of a listing waits for the administrators, a second report of the same listing by the same account is refused. Once the administrators have closed it (request 64), the account may report the listing again. Several accounts may each have their own report of the same listing open.
- **What it changes.** Nothing, by itself: the listing stays as it is, found, quoted and booked as before. The report waits for the administrators (request 64), as a report of kind `listing`.
- **Two at once.** Two reports of the same listing sent at the same moment by the same account, to one server or to two, make one open report: the other is refused.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings/{id}/report` `{ reason, details? }` | creates the report, `{ id }` |
