# 28. An audit of money changes

Ann swears the dinner was 60 euros, not 90. Who changed it, and when?

- **Every change of money is an entry** of its group's audit, from now on: who made it (`by`, an account id), when (`at`), what (`action`, about `subjectId`), and how much (`amount`).

  | `action`              | The change                                                                                                    | `by`                                                                | `subjectId`       | `amount`                                    |
  | --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------- | ------------------------------------------- |
  | `expense-recorded`    | an expense recorded (requests 4 and 21), a recurring expense's included (request 23)                           | its payer                                                           | the expense       | its amount                                  |
  | `expense-edited`      | an expense edited (request 6)                                                                                 | who edited it                                                       | the expense       | its amount after the edit                   |
  | `expense-deleted`     | an expense deleted (request 6)                                                                                | who deleted it                                                      | the expense       | the amount it had                           |
  | `settlement-paid`     | a settlement the balances start to count: in cash when it is recorded (request 12), through the provider when the provider says it succeeded (request 13) | in cash its payee, who recorded it; through the provider its payer | the settlement    | its amount                                  |
  | `settlement-refunded` | a settlement the balances no longer count, when the provider says it is refunded (request 15)                  | its payee, who refunded it                                          | the settlement    | its amount                                  |
  | `balance-passed`      | the balance a member who left passed to the owner (request 20), when it is not 0                              | the member who left                                                 | the member who left | their balance as they left, positive or negative |

  Nothing else is an entry: a payment asked for, failed or refunding, a recurring expense set up, a budget, a receipt.
- **With the change.** An entry is written with the change it records. A change answered as done has its entry, even when the server is killed right after it and started again; a change refused, or one that changes nothing (a webhook said twice), has none. However many servers run on the database, a change has one entry.
- **Never changed.** No request changes or removes an entry. It stays when its expense is deleted, or its member leaves.
- **Reading it.** A member of the group reads the group's audit, the oldest first. To anyone else the group does not exist.

The API works as request 1 says.

## The API

| Request                              | Answer                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/audit`          | `200 [ { id, at, by, action, subjectId, amount } ]`, the oldest first                     |
