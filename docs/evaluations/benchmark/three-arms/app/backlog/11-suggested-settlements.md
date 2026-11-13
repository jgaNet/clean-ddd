# 11. Suggested settlements

The trip is over and everyone wants to be even, with as few transfers as possible.

- **The suggestion.** A member reads the transfers that would bring every balance of the group (request 5) to 0: each from a member who owes to a member who is owed, with its amount. Tally makes them by this algorithm, so that every member reading it sees the same transfers:
  1. Start from the group's balances.
  2. Take the member who owes the most (the lowest balance) and the member who is owed the most (the highest balance). When two members owe, or are owed, the same, take the one who joined the group first (request 3).
  3. The first pays the second the smaller of the two: what the first owes, and what the second is owed. That is one transfer. Both balances move by its amount, and whoever is now at 0 is even.
  4. Repeat from step 2 until every balance is 0.

  The transfers are listed in the order they were made. They are never more than one fewer than the members whose balance is not 0. When every balance is already 0, there is no transfer.

  For instance, with balances of 500 for Ann, 100 for Bob, −300 for Cy and −300 for Dan, who joined in that order: Cy pays Ann 300; then Dan pays Ann 200; then Dan pays Bob 100.
- **Only a suggestion.** Reading it changes nothing and records nothing: the balances are what the expenses make them.
- **Who reads it.** The members of the group. To anyone else the group does not exist.

The API works as request 1 says.

## The API

| Request                                      | Answer                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/settlements/suggested`  | `200 [ { from, to, amount } ]`, `from` and `to` the members' account ids, in the order made     |
