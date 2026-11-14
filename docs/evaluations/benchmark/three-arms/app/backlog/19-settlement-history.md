# 19. A group's settlements

Who paid whom, when, and what became of each payment.

- **The group's settlements.** A member lists every settlement of the group, in cash or through the provider (requests 12 and 13), each as it reads on its own, the most recent first: the most recently recorded, or asked for, first.
- **Each settlement's history.** A settlement says every status it has had, the earliest first, each with when Tally learned it:
  - a settlement in cash: `paid`;
  - through the provider: `pending`, then `paid` or `failed`, then, for a refund (request 15), `refunding` and `refunded`.

  A webhook that changes nothing (request 14) adds nothing to it. A webhook that moves a settlement past a status it never had in Tally adds only the status it moves to.
- **Who reads them.** The members of the group, and they still see the settlements of a member who has left. To anyone else the group does not exist.

The API works as request 1 says.

## The API

| Request                                | Answer                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/settlements`      | `200 [ settlement ]`, each as `GET /v1/settlements/{id}` reads it, the most recent first             |
| `GET /v1/settlements/{id}`             | the settlement gains `history: [ { status, at } ]`, the earliest first                              |
