# 8. A group's expenses, and a member's statement

Before settling up, people check what was recorded, and how they came to owe what they owe.

- **The group's expenses.** A member lists every expense of the group that has not been deleted, each as it reads on its own (requests 4, 6 and 7). The order is stated:
  1. the latest date first;
  2. on the same date, the most recently recorded first. An edit does not change when an expense was recorded.
- **A member's statement.** A member of the group reads the statement of any member of the group, themselves included: every expense, not deleted, that the member paid or is in the split of, in the order of a bank statement:
  1. the earliest date first;
  2. on the same date, the earliest recorded first.

  Each entry has the expense's id, date and description, what the member paid for it (its amount when they are its payer, 0 otherwise), their share of it (0 when they are not in its split), and their balance once that entry is counted, starting from 0. The statement also gives the member's balance: the last entry's, or 0 when it has none, which is the one the group's balances give them (request 5).
- **Who reads them.** The members of the group. To anyone else the group does not exist, and a statement of someone who has never been a member of the group does not exist either.

The API works as request 1 says.

## The API

| Request                                                | Answer                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/expenses`                         | `200 [ expense ]`, each as `GET /v1/expenses/{id}` reads it, the latest date first, then the most recently recorded first          |
| `GET /v1/groups/{id}/members/{memberId}/statement`     | `200 { memberId, balance, entries: [ { expenseId, date, description, paid, share, balance } ] }`, the earliest first, as above     |
