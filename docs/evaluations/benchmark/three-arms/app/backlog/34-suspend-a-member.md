# 34. Suspend a member

Someone records invented expenses in every group they are in. An administrator stops them while it is looked into.

- **Suspending.** An administrator (request 33) suspends an account, and reinstates it. Suspending an account already suspended, or reinstating one that is not, changes nothing. Anyone else is refused.
- **What a suspended account cannot do,** in any group, from the moment it is suspended until it is reinstated: record an expense (requests 4 and 21), set up a recurring expense (request 23), record a settlement in cash (request 12), ask to pay through the provider (request 13), or ask for a netting (request 32). Each is refused, by the name of that one rule, the same for all of them, and changes nothing.
- **What it still can.** Everything else: signing in, reading, editing or deleting an expense, leaving a group, refunding or contesting a settlement. The others of its groups go on as before: they may put it in a split, record its payment to them in cash, or pay it through the provider.
- **Its recurring expenses.** The background job records no expense for a recurring expense whose payer is suspended. Its days wait: at the first run after the payer is reinstated, every day that has come is recorded (request 23).
- **Nothing written in a group.** A suspension, or its end, changes nothing in any group: not its members, its balances, its expenses, its settlements or its audit.
- **Always logged.** Each suspension and each reinstatement is an entry of the administrators' log (request 33), its `action` `suspended` or `reinstated`, its `subjectId` the account. One that changes nothing is no entry.

The API works as request 1 says.

## The API

| Request                                            | Answer                                                         |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `PUT /v1/admin/accounts/{id}/suspension`           | suspends the account                                           |
| `DELETE /v1/admin/accounts/{id}/suspension`        | reinstates it                                                  |
| `GET /v1/admin/log`                                | `action` may now be `suspended` or `reinstated`                |
