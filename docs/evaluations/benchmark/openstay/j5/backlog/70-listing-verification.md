# 70. Listing verification

Travellers trust a place more when someone at OpenStay has checked that it is where it says it is. That check only holds for the address that was checked.

- **Verifying.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) verifies a listing that is not archived, with a note of 1 to 500 characters saying what was checked. Anyone else gets `403`. Verifying a listing that is verified already, or archived, is refused.
- **What it shows.** The listing reads `verified: true` and `verifiedAt`, the time it was verified, everywhere it is shown: its page, search results and the host's list (request 2). A listing never verified reads `verified: false` and `verifiedAt: null`.
- **A change of address undoes it.** When the listing's city changes (request 2, `PUT /v1/listings/{id}`), or its location (request 14, `PUT /v1/listings/{id}/location`), whoever changed it (the host or a manager, request 24), the listing reads `verified: false` and `verifiedAt: null` again, until an administrator verifies it again. Sending the same city or the same location again, or changing anything else (the title, the price, its status), keeps the verification.
- **Nothing else follows.** A verified listing is found, ordered and booked as any other: verification changes nothing in search.
- **In the audit log.** Each verification is an entry of the audit log (request 67): `action` `listing-verified`, `subjectId` the listing, `note` the note, with the administrator and the time. Losing the verification by a change of address is not an administrator's decision, and writes no entry.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/admin/listings/{id}/verify` `{ note }` | |
| `GET /v1/listings/{id}` | gains `verified` and `verifiedAt` (an ISO 8601 time, or `null`) |
| `GET /v1/admin/audit?subjectId=` | as request 67; `action` may now be `listing-verified` |
