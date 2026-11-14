# 12. Settle up in cash

Bob hands Ann the 30 euros he owes her. Ann records it, and they are even.

- **Recording a settlement.** A member who has been paid in cash by another member of the group records it: who paid them, and the amount. The member who records it is the settlement's **payee**; the member who paid is its **payer**.
- **What it changes.** As soon as it is recorded, the group's balances (request 5) count it: the payer's balance goes up by its amount, the payee's goes down by it. The balances still add up to 0.
- **Never more than is owed.** A settlement's amount is a whole number, at least 1, and it is never more than what the payer owes (the opposite of their balance) nor more than what the payee is owed (their balance), at the moment it is recorded. Otherwise it is refused, and nothing changes. The payer is a member of the group, and not the payee.
- **At the same moment.** Two settlements may be recorded at once, through one server or two on the same database. Each is decided on the balances as the other left them: when both together would pay more than is owed, one is kept and the other is refused.
- **Reading a settlement.** A member of the group reads a settlement: its group, payer, payee, amount, how it was paid (`cash`), its status (`paid`) and when it was recorded. To anyone else it does not exist.
- **Everything that reads a balance counts it:** the group's balances, the suggested settlements (request 11), and leaving (request 9). A member's statement (request 8) still lists expenses only: its balance is what the expenses give them, and differs from their balance in the group by the settlements they paid or received.

The API works as request 1 says.

## The API

| Request                                                    | Answer                                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/settlements/cash` `{ from, amount }` | records the settlement, the caller its payee, `{ id }`; `from` is the payer's account id                                    |
| `GET /v1/settlements/{id}`                                 | `200 { id, groupId, from, to, amount, method, status, at }`: `method` is `cash`, `status` is `paid`, `at` when it was recorded |
