# 49. A traveller's data

A traveller may ask for everything OpenStay holds about them.

- **One export.** Their account (without the password), their bookings with their history and conditions, their quotes, their holds, their favourites, and their receipts.
- **Theirs only.** Nothing about anyone else: no other traveller's booking, no host's contact unless the booking shows it (request 9).
- **Who.** A signed-in account, for itself.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/accounts/me/export` | `200 { account, bookings, quotes, holds, favourites, receipts }` |
