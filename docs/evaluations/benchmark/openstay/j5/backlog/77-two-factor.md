# 77. Two-factor sign-in

A stolen password should not be enough to take over a host's account and their payouts. An account may ask for a second proof at every sign-in.

- **Turning it on.** A signed-in account asks for a secret: a new random secret, in base32 (RFC 4648, no padding), which the person enters in their authenticator app. It is not on yet: the account confirms with a code made from that secret, and two-factor sign-in is then on. Asking for a secret again before confirming replaces the earlier one. An account with two-factor sign-in on is refused a new secret.
- **The codes.** Time-based codes as RFC 6238 makes them: HMAC-SHA-1, six digits, a step of 30 seconds from the Unix epoch, sent as a string. The code of the current step is accepted, and so is the code of the step just before or just after. Codes follow the machine's own clock, never `CLOCK_OFFSET_DAYS` (request 57).
- **Recovery codes.** Confirming answers ten recovery codes, all different, for a person who has lost their app. Each works once, in place of a code.
- **Signing in.** With two-factor sign-in on, the email and the right password alone are not enough: `POST /v1/accounts/login` answers `401 { twoFactorRequired: true }`, and no token. With them, a valid `code` or an unused `recoveryCode` gives a token, as before. A wrong password answers `401` as request 1 says, whatever else is given; the right password with a wrong code, or a spent recovery code, answers `401 { twoFactorRequired: true }`.
- **A code is used once.** A code accepted once for the account, to sign in, to confirm or to turn it off, is refused afterwards, and so is the code of any earlier step. The same code sent twice at the same moment, to two servers, gives one token.
- **Turning it off.** The account turns it off with a valid code or an unused recovery code. Its recovery codes are then spent; turning it on again gives a new secret and ten new codes.
- **Tokens.** Tokens given before two-factor sign-in was turned on or off still work.
- **What shows.** The account shows whether two-factor sign-in is on, `false` until it is.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/accounts/me/2fa` | `{ secret }`, at once or as the operation's result |
| `POST /v1/accounts/me/2fa/confirm` `{ code }` | `{ recoveryCodes }`, ten strings, at once or as the operation's result |
| `POST /v1/accounts/me/2fa/disable` `{ code }` or `{ recoveryCode }` | |
| `POST /v1/accounts/login` `{ email, password, code }` or `{ email, password, recoveryCode }` | `200 { token }`; `401 { twoFactorRequired: true }` when a second proof is missing or wrong |
| `GET /v1/accounts/me` | gains `twoFactor` |
