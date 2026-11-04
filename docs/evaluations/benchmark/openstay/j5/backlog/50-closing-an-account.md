# 50. Closing an account

A person may leave OpenStay.

- **Closing.** An account closes itself. It is refused while the account has a stay to come: a booking confirmed or requested, as traveller, whose check-out is after today; or, as host, such a booking on a listing they host.
- **What goes.** The email and the password: the account can no longer sign in, and its email is free for a new account. Its listings are archived. Its holds and favourites are gone.
- **What stays.** Its bookings, their payments, refunds, payouts and receipts: the money's record is kept. Where they named the person, they now say nothing about them: a closed account's contact (request 9) is never shown.
- **Who.** The account itself.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/accounts/me/close` | |
| `POST /v1/accounts/login` | refused for a closed account |
