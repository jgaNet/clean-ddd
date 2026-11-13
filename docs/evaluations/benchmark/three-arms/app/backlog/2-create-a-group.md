# 2. Create a group

People share expenses inside a group: the flat, the trip to Lisbon, the climbing club.

- **Creating a group.** A signed-in person creates a group with:
  - a name of 1 to 60 characters, not only spaces;
  - a currency, one of `EUR`, `USD`, `GBP`, `CHF`, `CAD` and `AUD`. Each of them counts in hundredths (cents, pence), and every amount of the group is an integer number of those hundredths: `1250` in a `EUR` group is 12.50 euros.

  The person who creates it is its **owner**, and its first member.
- **The currency is fixed.** It is chosen when the group is created and never changes: every amount of the group is in it.
- **Who sees a group.** Its members, and nobody else. To anyone else it does not exist.
- **My groups.** A signed-in person lists the groups they are a member of, the most recently created first.

The API works as request 1 says.

## The API

| Request                                    | Answer                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `POST /v1/groups` `{ name, currency }`     | creates the group, `{ id }`                                                     |
| `GET /v1/groups/{id}`                      | `200 { id, name, currency, ownerId }`                                           |
| `GET /v1/groups/mine`                      | `200 [ { id, name, currency, ownerId } ]`, the most recently created first      |
