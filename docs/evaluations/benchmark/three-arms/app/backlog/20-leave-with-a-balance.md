# 20. Leave with a balance

Members who moved out could not leave until someone chased them for the last few euros. The rule changes: they leave, and the owner of the group takes over what is left.

- **From now on,** a member may leave a group whatever their balance (request 9). What they owe, or are owed, passes to the group's owner: the owner's balance moves by the leaving member's balance, in the same step as they leave. At no moment do the balances of the group's members fail to add up to 0.

  For instance, with balances of 600 for Ann, the owner, −300 for Bob and −300 for Cy, when Bob leaves: Ann 300, Cy −300.
- **The owner** still cannot leave the group they created.
- **A payment waiting at the provider.** A member cannot leave while a settlement they pay or receive through the provider is `pending` or `refunding` (requests 13 and 15): that is refused, and they leave once it has ended.
- **At the same moment.** An expense or a settlement may be recorded at the moment someone in it leaves, through one server or two on the same database. Either it is recorded before they leave, and what passes to the owner counts it, or it is refused, because they are no longer a member. Either way the balances of the group's members add up to 0.
- **Everything else holds** (request 9): once gone, they are in no list of the group, which no longer exists to them; their expenses stay as they were and are not changed; their statement is still read by the members. Someone who left and joins again is a member from that moment, with a balance of 0.

The API works as request 1 says.

## The API

No route changes.
