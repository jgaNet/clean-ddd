# 75. Notice preferences

Some people want a notice for every message, others only for what matters. But nobody should miss news of their money or their account's safety.

- **The kinds of notice.** Every notice goes out as request 10 says (`POST {NOTIFY_URL}`, sent again until accepted), and has a `kind`:
  - `booking-confirmed` and `booking-requested` (request 10), to the listing's host (`hostId`): a booking made, or a request to decide;
  - `message` (request 55), to the account a new message is for (`accountId`);
  - `booking-cancelled` (request 66), to the traveller (`accountId`) of a booking the platform cancelled and refunds: it is about their money;
  - `email-verification` (request 76), to the account (`accountId`) whose email is to be verified: it is about their account's safety.
- **Turning a kind off.** Each account turns each of `booking-confirmed`, `booking-requested` and `message` on or off, for itself. Every kind is on until its account turns it off.
- **What cannot be turned off.** `booking-cancelled` is about payments, and `email-verification` about security: they are always on. A change that turns one of them off is refused, and so is one that names a kind that does not exist, or gives a value that is not a boolean. A refused change changes nothing, not even the other kinds it named.
- **Only what is named.** A change names the kinds it changes; the others keep their value.
- **Off means not sent.** A notice of a kind its account has turned off, when the notice arises, is not sent, then or later: turning the kind on again sends only the notices that arise afterwards. A notice not sent counts for nothing, so a message notice after the kind is turned on again is sent as if the earlier ones had never been (request 55's window counts only notices sent).
- **Everything else holds.** A notice of a kind that is on is sent exactly as before, once, whatever a crash or a restart does.
- **Who.** A signed-in account reads and changes its own preferences.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/accounts/me/notices` `{ <kind>: boolean, … }` | e.g. `{ "message": false }` |
| `GET /v1/accounts/me/notices` | `200 { "booking-confirmed": true, "booking-requested": true, "message": true, "booking-cancelled": true, "email-verification": true }`, every kind with its value |
