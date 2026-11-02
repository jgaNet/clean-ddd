# 24. Collaborators and permissions

An organisation is several people. Its owner brings in collaborators, each with what they may do.

- **Members.** The owner adds an account to the organisation by its email, as a `manager` or a `viewer`, changes a member's role by adding them again, and removes a member. The owner is no member and cannot be added.
- **A manager** may do on the organisation's listings everything their host may do: describe, publish, suspend and archive them; set their calendar, prices, rules, window, days and discounts; accept and decline requests; cancel bookings as the host; read their bookings, their history and the traveller's contact; and anything else their host may do on them (the booking mode, the tourist tax, the location, the amenities, the stay limits).
- **A viewer** may read everything a manager reads on them (drafts included, calendars, bookings, history, contacts) and change nothing.
- **At once.** A member removed, or a manager made viewer, loses what they lost at once.
- **Everything else holds.** A listing in no organisation is its host's alone, as before. A member gains nothing over the listings of another organisation, or over listings outside it.
- **The host's own routes stay the host's.** `/hosts/me/…` (requests 21 and 22) cover the listings the caller hosts, as before, and moving a listing into an organisation stays its host's. A member quotes and books an organisation's listing like any traveller.
- **Who sees the members.** The owner and every member read the organisation and its members.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/organisations/{id}/members` `{ email, role }` | |
| `POST /v1/organisations/{id}/members/{accountId}/remove` | |
| `GET /v1/organisations/{id}` | gains `members: [ { accountId, email, role } ]`; readable by its members too |
| `GET /v1/listings/mine` | also lists the listings of the organisations the account is a member of |
