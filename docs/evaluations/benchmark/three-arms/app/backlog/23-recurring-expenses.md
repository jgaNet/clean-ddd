# 23. Recurring expenses

The rent is the same every month. Nobody should have to record it again.

- **A recurring expense.** A member sets up an expense they pay every month, with:
  - a description, an amount in the group's currency, and the members it is split between, by one of the three splits (request 7), under the same rules as an expense (requests 4 and 7): its members are members of the group, listed once, the payer among them;
  - `startsOn`, the day of its first month: a real day of the calendar, no more than 365 days before today nor more than 365 days after, whose day of the month is from 1 to 28, so that every month has it.

  Otherwise it is refused. The member who sets it up is its payer.
- **Its expenses.** On its day of every month, from the month of `startsOn` on, an expense of the group is recorded for it: dated that day, paid by its payer, with its description, its amount and its split. It is recorded at the first run of the background job (request 1) on that day or after it, never because someone read something. A recurring expense whose `startsOn` has passed has the expenses of every day already passed recorded at the next run.

  For instance, set up on 10 November with `startsOn` the 5th of September, it has its expenses of the 5th of September, of October and of November recorded at the next run, and the next one on the 5th of December.
- **Once.** Each day of a recurring expense has one expense, however many servers run on the database, even when the server is stopped at any moment and started again.
- **An expense like any other.** Each is split by the rule in force when it is recorded (request 10), counted by the balances, listed, read, told to the members of its split (request 17), and edited or deleted by its payer or the owner.
- **When a member has left.** On a day when its payer, or a member of its split, is no longer a member of the group, its expense is not recorded, and the recurring expense ends: it no longer exists, as if it had been stopped.
- **Reading it.** A member of the group reads a recurring expense, and lists the group's, the earliest set up first. Each reads its id, its group, its payer, its description, its amount, `startsOn`, the split it was given (`splitBetween`, `splitExactly` or `splitByShares`, as given), and `next`, the day of the next expense it will record.
- **Stopping it.** Its payer or the group's owner stops it: it no longer exists, and no expense is recorded for it from then on. The expenses it recorded stay.

The API works as request 1 says.

## The API

| Request                                                                                      | Answer                                                                                                                       |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/recurring` `{ description, amount, startsOn }` and one of the three splits | sets up the recurring expense, the caller its payer, `{ id }`                                                             |
| `GET /v1/recurring/{id}`                                                                     | `200 { id, groupId, paidBy, description, amount, startsOn, next }` and the split as it was given                             |
| `GET /v1/groups/{id}/recurring`                                                              | `200 [ recurring ]`, each as `GET /v1/recurring/{id}` reads it, the earliest set up first                                   |
| `DELETE /v1/recurring/{id}`                                                                  | stops it                                                                                                                     |
