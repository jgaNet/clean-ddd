# 27. Archive a group

The trip is over and everyone is even. The group stays, for the record, and nothing changes in it any more.

- **Archiving.** The group's owner archives it, once every member's balance (request 5) is 0 and no settlement through the provider is `pending` or `refunding` (requests 13 and 15). Otherwise it is refused, and so it is for any other member. An archived group stays archived.
- **Read only.** Every request that would change something in an archived group is refused, by the name of that one rule, the same for all of them, and changes nothing: recording, editing or deleting an expense, attaching a receipt, recording a settlement or asking for one, refunding one, creating an invitation, joining, leaving, setting up or stopping a recurring expense, setting or removing a budget, saving, replacing or removing a template, and archiving it again.
- **Nothing by itself.** The background job records no expense of a recurring expense (request 23) in an archived group.
- **Everything reads.** Its members read it as before: the group, its members, balances, expenses and their receipts, statements, settlements, suggested settlements, budgets, templates and recurring expenses. It stays among their groups. The group reads when it was archived, as `archivedAt`, once it is archived, and only then.

The API works as request 1 says.

## The API

| Request                              | Answer                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/archive`       | archives the group                                                           |
| `GET /v1/groups/{id}`                | an archived group also has `archivedAt`, when it was archived; so does `GET /v1/groups/mine` |
