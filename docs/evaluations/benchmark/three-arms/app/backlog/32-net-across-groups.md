# 32. Net what two people owe each other across their groups

Ann owes Bob 30 euros in the flat, and Bob owes Ann 40 in the climbing club. Nobody needs to move money for the first 30.

- **A netting.** A member asks Tally to net what they and another person owe each other in one currency, across every group the two of them are members of now, in that currency, that is not archived (request 27). Tally does it at once, as settlements.
- **What can be netted.** In each of those groups, what the caller can pay the other there is the smaller of what the caller still owes and what the other is still owed, when the caller owes and the other is owed (requests 12 and 13: a payment waiting at the provider counts as paid); and the same, the other way round, for what the other can pay the caller. The amount netted is the smaller of the two totals: what the caller can pay the other across the groups, and what the other can pay the caller. When it is 0, the netting is refused, and nothing changes.
- **The settlements it makes.** The caller pays the other the amount netted, group by group, in the order the groups were created, the earliest first, in each the smaller of what is left to net and what the caller can pay there; and the other pays the caller the same amount, the same way, in the groups where they can. Each is a settlement of its group, with its payer and its payee, its amount, `method` `net` and `status` `paid`: no money moves, so it counts at once, as a settlement in cash does, in everything that counts one (the balances, the suggestions, leaving, the statement as `Settlement by netting`, the audit as `settlement-paid` by the member who asked). It is never refunded.

  For instance, Ann owes Bob 300 in the flat and 200 in the trip, created later, and Bob owes Ann 400 in the club: Ann can pay 500, Bob 400, so 400 is netted. Ann pays Bob 300 in the flat and 100 in the trip; Bob pays Ann 400 in the club.
- **All or nothing.** A netting makes all its settlements or none. Two nettings, or a netting and another settlement, may be asked at the same moment, through one server or two: each is decided on what the other left, and no settlement ever pays more than is still owed.
- **Reading a netting.** The two people read it: who asked, with whom, its currency, the amount netted, and its settlements, in the order they were made. To anyone else it does not exist.
- **Who.** Any signed-in person may ask, with anyone. A netting with oneself, in a currency that is not one of Tally's, or with someone with whom there is nothing to net, is refused.

The API works as request 1 says.

## The API

| Request                                     | Answer                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /v1/nettings` `{ with, currency }`    | nets what the caller and `with`, an account id, owe each other in `currency`, `{ id }`                       |
| `GET /v1/nettings/{id}`                     | `200 { id, by, with, currency, amount, settlements: [ settlementId ] }`, the settlements in the order made    |
| `GET /v1/settlements/{id}`                  | `method` may now be `net`                                                                                    |
