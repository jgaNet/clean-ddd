# 5. A group's balances

Everyone wants to know where they stand: who is owed, and who owes.

- **A member's balance** in a group is what they paid for the group's expenses, minus the shares they have in them, over every expense of the group. It is positive when the group owes them, negative when they owe the group, and 0 when they are even.
- **The group's balances.** A member reads the balances of every member of the group, in the order they joined (request 3), the earliest first. A member who has recorded nothing and is in no split has a balance of 0.
- **The zero sum.** What one member is owed, the others owe: a group's balances always add up to 0, exactly. That holds after any sequence of expenses, whatever happens at once: many members recording expenses at the same moment, through several servers running on the same database, each expense counts once, and the balances add up to 0.
- **Who reads them.** The members of the group. To anyone else the group does not exist.

The API works as request 1 says.

## The API

| Request                            | Answer                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/balances`     | `200 [ { memberId, balance } ]`, in the order the members joined, the earliest first |
