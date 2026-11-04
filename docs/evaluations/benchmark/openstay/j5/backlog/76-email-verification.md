# 76. Email verification

Hosts and travellers deal with each other by email. OpenStay should know that an account's address is really its owner's.

- **Asking for a code.** A signed-in account asks for a code. OpenStay sends it a notice through the notice service (request 10: `POST {NOTIFY_URL}` with a JSON body, sent again until the service accepts it with a `2xx`, the first retry within a second, each later one at most five seconds after the previous attempt, and never again once accepted, even across a crash). Its body is `{ id, kind: "email-verification", accountId, email, code }`: `email` the account's current address, `code` six digits, as a string. Without `NOTIFY_URL`, nothing is sent.
- **Always sent.** `email-verification` is a security notice: it cannot be turned off (request 75), and is sent whatever the account's preferences.
- **The code.** It is valid for `EMAIL_CODE_TTL_SECONDS` seconds (900 when not set). Asking again gives a new code, and the earlier one no longer works. An account whose email is already verified is refused a code.
- **Verifying.** The account sends the code. The right code, still valid, verifies the email, and is then spent. A wrong code is refused; after five wrong codes, the current code is spent too, and even the right one is refused until a new one is asked for. Wrong codes sent at the same moment, to two servers, each count. An expired code, a spent one, or none asked for, is refused.
- **Changing the email.** An account changes its email, under request 1's rules: it must look like one (something, `@`, something with a dot), and an email used by another account is refused, whatever its case. The account then signs in with the new email, and no longer with the old one. Its email is no longer verified, and a code asked for before the change no longer works.
- **What shows.** The account shows whether its email is verified, `false` until it is.
- **Who.** A signed-in account, for itself.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/accounts/me/email/verify-request` | |
| `POST /v1/accounts/me/email/verify` `{ code }` | |
| `PUT /v1/accounts/me/email` `{ email }` | |
| `GET /v1/accounts/me` | gains `emailVerified` |
