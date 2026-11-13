# 9. Leave a group

The trip is over, someone moves out. A member leaves the group once they are even.

- **Leaving.** A member leaves a group. It is refused while their balance in it (request 5) is not 0. The owner cannot leave the group they created.
- **Once they have left:**
  - they are no longer among the group's members or its balances, and the group is not among their groups;
  - to them, the group no longer exists, as for anyone who is not a member;
  - they cannot be put in the split of a new expense, nor pay one;
  - the expenses they were in stay as they were, with their shares, and their statement can still be read by the group's members;
  - an expense that concerns someone who is no longer a member, as its payer or in its split, can no longer be edited or deleted, so that their balance stays 0 and the group's balances still add up to 0.
- **Coming back.** Someone who left may join again with an invitation (request 3). They are then a member again, from the moment they join: last in the order of the members, with the balance their earlier expenses give them, which is 0.

The API works as request 1 says.

## The API

| Request                                | Answer                    |
| -------------------------------------- | ------------------------- |
| `POST /v1/groups/{id}/leave`           | the caller leaves the group |
