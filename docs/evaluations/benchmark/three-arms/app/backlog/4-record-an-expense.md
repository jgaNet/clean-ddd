# 4. Record an expense, split equally

Someone pays the groceries for the flat, and the cost is shared between the people it concerns.

- **Recording an expense.** A member records an expense they paid, with:
  - a description of 1 to 100 characters, not only spaces;
  - an amount, in the group's currency (request 2), from 1 to 100 000 000;
  - the date it was spent, a real day of the calendar, not after today in UTC;
  - the members it is split between, each given by their account id, in an order the member chooses.

  The member who records it is its payer.
- **Who can be in the split.** Only members of the group, each listed once. The payer is always one of them. An expense that breaks one of these is refused.
- **An equal split.** The amount is divided equally between the members of the split:
  - each one's share is the amount divided by their number, rounded down to a whole number;
  - what that leaves over, the remainder, is less than their number; it goes whole to the payer's share. It is never lost: the shares add up to the amount, exactly.

  For instance, 1000 split between three members, one of them the payer, is 333 and 333 for the two others, and 334 for the payer.
- **Reading an expense.** A member of the group reads an expense: its description, amount, date, payer, and each member's share, in the order the split was given. To anyone else it does not exist.

The API works as request 1 says.

## The API

| Request                                                                       | Answer                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/groups/{id}/expenses` `{ description, amount, date, splitBetween }` | creates the expense, `{ id }`; `splitBetween` is the list of the members' account ids                                          |
| `GET /v1/expenses/{id}`                                                       | `200 { id, groupId, description, amount, date, paidBy, shares: [ { memberId, amount } ] }`, `shares` in the order of the split |
