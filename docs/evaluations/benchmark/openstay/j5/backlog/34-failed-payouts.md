# 34. Failed payouts

A payout can fail: a closed bank account, a mistyped number.

- **Failed.** A payout the provider says `payout.failed` reads `failed`. What it carried is owed again, and is paid by a new payout at the next run of the work (request 30), as long as the account is enabled.
- **Disabled.** While the host's account is `disabled` (request 26), nothing is paid out to it; what is due waits, and is paid once the provider enables the account again.
- **Never twice.** A failed payout and the one that replaces it never both read `paid`; what reaches the host is what was due, once.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/payouts` | `status` may be `failed` |
