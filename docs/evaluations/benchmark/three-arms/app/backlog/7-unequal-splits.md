# 7. Unequal splits

Not every cost is shared equally: a couple takes two shares of the cottage, someone had the lobster.

- **Three ways to split.** An expense, when it is recorded or edited, gives exactly one of:
  - `splitBetween`, the members' account ids: an equal split, as request 4 says;
  - `splitExactly`, each member with the exact amount of their share;
  - `splitByShares`, each member with a whole number of shares.

  A body with none of the three, or with more than one, is of the wrong shape.
- **By exact amounts.** Each amount is 0 or more, and they add up to the expense's amount, exactly; otherwise the expense is refused. Each member's share is their amount.
- **By shares.** Each member has at least 1 share. Each member's share is the expense's amount times their shares, divided by the total of the shares, rounded down to a whole number. What that leaves over, the remainder, goes whole to the payer's share, as in an equal split: the shares add up to the amount, exactly.

  For instance, 1000 by shares of 1, 1 and 1 is the equal split of request 4, and 1001 by shares of 2 and 1, the payer listed second, is 667 and 334.
- **Everything else holds.** Only members of the group, each listed once, the payer always one of them, in the order given; the shares in that order when the expense is read. The balances (request 5) count each member's share, however it was split.
- **Reading an expense** says how it was split: `equal`, `exact` or `shares`. The expenses recorded before this request were split equally.

The API works as request 1 says.

## The API

| Request                                                                                                  | Answer                                                           |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /v1/groups/{id}/expenses` `{ description, amount, date, splitExactly: [ { memberId, amount } ] }`  | as in request 4, split by exact amounts                          |
| `POST /v1/groups/{id}/expenses` `{ description, amount, date, splitByShares: [ { memberId, shares } ] }` | as in request 4, split by shares                                 |
| `PUT /v1/expenses/{id}` `{ description, amount, date, version }` and one of the three splits             | as in request 6                                                  |
| `GET /v1/expenses/{id}`                                                                                  | the expense gains `splitKind`: `equal`, `exact` or `shares`      |
