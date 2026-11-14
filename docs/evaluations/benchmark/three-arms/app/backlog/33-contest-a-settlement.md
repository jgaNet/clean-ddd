# 33. Contest a settlement

Bob says he paid Ann by card. The provider says so too. Ann's bank says nothing arrived. Someone has to decide.

- **Administrators.** The platform's administrators decide. The server is started with `ADMIN_EMAILS`, a list of emails separated by commas: the account with one of them, whatever its case, is an administrator. Nobody becomes one through the API. An administrator signs up and signs in as anyone does. What only an administrator may do is refused to anyone else; what only an administrator reads does not exist for anyone else.
- **Contesting.** The payee of a settlement through the provider (request 13) whose status is `paid` contests it: they say the money did not reach them. Only its payee may, only once for a settlement, and only while its payer and its payee are members of the group; anything else is refused, and nothing changes. The settlement is then `contested`.
- **Its effect is held.** While a settlement is contested, the balances do not count it: they are as they were before it was paid. It still waits, as a payment at the provider does (request 13): what its payer still owes, and what its payee is still owed, count it as paid; and its payer and payee do not leave the group (request 20), nor is the group archived (request 27) or merged (request 31), until it is decided. A webhook about its payment changes nothing.
- **An administrator decides.** An administrator lists the settlements contested now, the earliest contested first, each as `GET /v1/settlements/{id}` reads it, and decides each one:
  - **paid:** the money arrived. The settlement is `paid` again, and everything counts it as it did before it was contested;
  - **not paid:** it is `annulled`. Nothing counts it any more, and it no longer waits: what was owed is owed again.

  Only a contested settlement is decided, once.
- **Its history** (request 19) says `contested`, then `paid` or `annulled`, each with when Tally learned it.
- **The audit** (request 28) has two more entries: `settlement-contested`, when a settlement is contested, by its payee, with its amount; and `settlement-paid`, when an administrator decides it was paid, by that administrator. A settlement annulled is no other entry: the balances stopped counting it when it was contested.
- **Always logged.** Every decision of an administrator is an entry of the administrators' log, which only administrators read, the oldest first: its id, when (`at`), which administrator (`by`), what (`action`: `decided-paid` or `decided-annulled`) and about what (`subjectId`, the settlement). No request changes or removes an entry.

The API works as request 1 says.

## The API

| Request                                                          | Answer                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /v1/settlements/{id}/contest`                              | contests the settlement, the caller its payee                                                           |
| `GET /v1/admin/contests`                                         | `200 [ settlement ]`, the settlements contested now, the earliest contested first; administrators only  |
| `POST /v1/admin/settlements/{id}/decision` `{ paid }`            | decides a contested settlement: `paid` a boolean, `true` when the money arrived                         |
| `GET /v1/admin/log`                                              | `200 [ { id, at, by, action, subjectId } ]`, the oldest first; administrators only                      |
| `GET /v1/settlements/{id}`                                       | `status` may now be `contested` or `annulled`                                                           |
| `GET /v1/groups/{id}/audit`                                      | `action` may now be `settlement-contested`                                                              |
