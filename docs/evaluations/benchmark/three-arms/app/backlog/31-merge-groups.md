# 31. Merge two groups

Ann's flat had one group for the rent and another for the groceries. One is enough: she merges them.

- **Merging.** The owner of two groups merges one of them, the group merged, into the other, the group kept. Both are in the same currency (request 2). It is refused when the caller does not own both, when the two are one group, when their currencies differ, and while a settlement through the provider in the group merged is `pending` or `refunding` (requests 13 and 15). A group that is archived, either of the two, is not merged: that is refused by the rule that keeps an archived group read only (request 27), as any change in it is.
- **The members.** Every member of the group merged becomes a member of the group kept, if they are not one already, with the role `member`: they join it at the merge, after its members, in the order they had joined the group merged. A member of both stays where they are. Someone who had left the group merged is a former member of the group kept (request 9): their statement is read there.
- **Everything moves.** The expenses of the group merged, with their receipts, its settlements, its recurring expenses, what passed to its owner when someone left with a balance (request 20), and the entries of its audit (request 28) are the group kept's from then on. Each keeps its id, and everything it says but its group: an expense keeps its payer, its shares, its version and its category; a settlement its status and its history. The group kept's lists read them at their place in its order (requests 8, 19, 23 and 28). Its budgets, its templates and its invitations do not move: the group kept's are the ones that hold.
- **The balances.** Each member's balance in the group kept is then what it was there, plus what it was in the group merged. The balances of every group add up to 0 at every moment, during the merge too.
- **The group merged is gone.** As soon as the merge is done, the group merged no longer exists, for anyone, and its invitations no longer let anyone join. Everything it held is the group kept's within a few seconds.
- **At the same moment.** An expense or a settlement may be recorded in the group merged at the moment it is merged, through one server or two on the same database. Either it is recorded before, and moves with the rest, counted once in the group kept, or it is refused, because the group no longer exists.
- **What stays.** Notices (requests 17, 18 and 24) stay as they were made.

The API works as request 1 says.

## The API

| Request                                       | Answer                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/merge` `{ from }`       | merges the group `from` into the group `{id}`, which is kept              |
