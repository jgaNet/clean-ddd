# 24. Budgets

The flat agreed to spend no more than 400 euros a month on groceries. Everyone wants to know when a month goes over.

- **Categories.** An expense has a category, one of `groceries`, `rent`, `utilities`, `transport`, `food`, `travel`, `leisure` and `other`. It is given as `category` when the expense is recorded or edited, and is `other` when it is not given. A recurring expense (request 23) may give one too, which its expenses have. The expenses recorded before this request are `other`.
- **A budget.** The group's owner sets a monthly budget for a category: an amount in the group's currency, from 1 to 100 000 000. Setting it again replaces it; the owner removes it. Any other member is refused.
- **What a month spends** in a category is the sum of the amounts of the group's expenses of that category whose date is in that month, in UTC, deleted ones left out.
- **The budgets.** A member reads the group's budgets: each category that has one, in the order of the list above, with its amount and what the current month spends in it.
- **Passing a budget.** When an expense is recorded, or edited, and what its month then spends in its category is more than that category's budget, every member of the group receives a notice (request 17): its `kind` is `budget`, with the group, the category, the month (`YYYY-MM`), the budget, and what the month spends. The payer receives one too.
- **Once a month.** A notice for a group, a category and a month is made once: a month that goes further over, or comes back under and over again, makes no other. Setting or changing a budget makes none by itself. As for an expense's notices, it appears within a few seconds, without anyone acting, one for each member, even when the server is stopped at any moment and started again.

The API works as request 1 says.

## The API

| Request                                                    | Answer                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/expenses` `{ …, category }`          | `category` may be given, as when it is edited (`PUT /v1/expenses/{id}`) or set up to recur (`POST /v1/groups/{id}/recurring`)            |
| `GET /v1/expenses/{id}`                                    | the expense gains `category`                                                                                                              |
| `GET /v1/recurring/{id}`                                   | the recurring expense gains `category`                                                                                                    |
| `PUT /v1/groups/{id}/budgets/{category}` `{ amount }`      | sets the category's budget                                                                                                                |
| `DELETE /v1/groups/{id}/budgets/{category}`                | removes it                                                                                                                                |
| `GET /v1/groups/{id}/budgets`                              | `200 [ { category, amount, spent } ]`, in the order of the categories, `spent` what the current month spends                              |
| `GET /v1/notices`                                          | a notice's `kind` may now be `budget`: `{ id, kind, groupId, category, month, budget, amount, at }`, `amount` what the month spends        |
