# 35. Delete an account

Cy moved abroad and wants to leave no trace. The groups he was in still need their sums to add up.

- **Deleting.** A signed-in person deletes their own account. It is refused while they own a group that has another member, and while a settlement they pay or receive through the provider is `pending`, `refunding` or `contested` (requests 13, 15 and 33); nothing changes then.
- **Gone as a person.** Once deleted, nobody signs in with that email and password, as if no account had them (request 1), and any token they had proves nothing. Their email may be used by a new account, which is someone else.
- **Erased everywhere.** Their name and their email are erased from everything Tally keeps. Their account's id stays where it is: in the groups' members, the expenses' payers and shares, the settlements, the audit (request 28) and the administrators' log (request 33). It means no one any more.
- **Their balances are kept.** In every group they were a member of, they stay a member, at their place, with their role and the balance they had: the balances still add up to 0. The members list names them `Deleted account`. Their expenses, settlements and statements read as before.
- **What can no longer happen to them.** A deleted account cannot be put in the split of a new expense, nor be paid through the provider, nor be netted with (request 32); a recurring expense they pay, or are in the split of, ends on its next day, as when a member has left (request 23). Tally tells them nothing any more. The others may still record in cash a payment they received from them (request 12), so that the group can be brought back to even.
- **What it changes for the others.** Nothing else: their groups, expenses, balances and audits read as they did, but for the name.

The API works as request 1 says.

## The API

| Request                       | Answer                                        |
| ----------------------------- | --------------------------------------------- |
| `DELETE /v1/accounts/me`      | deletes the caller's account                  |
