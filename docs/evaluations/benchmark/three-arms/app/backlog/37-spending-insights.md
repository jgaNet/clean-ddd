# 37. Spending insights

Ann wants to know what she spends, month by month, on rent, groceries and travel, whichever group it was in.

- **What one spent.** A signed-in person reads what they spent across every group they are a member of now: for each month, each currency and each category (request 24), the sum of their shares (requests 4 and 7) in the group's expenses of that category dated in that month, in UTC. Deleted expenses count for nothing; an expense counts in its group's currency, whatever it was paid in (request 21). Groups they have left count for nothing.
- **Its lines.** One line for each month, currency and category where they spent something: their shares there add up to more than 0. The earliest month first; in a month, the currencies in alphabetical order; in a currency, the categories in the order request 24 lists them.
- **Who reads it.** Each person reads their own. Nobody else does.

  For instance, Ann's share of the flat's groceries is 4000 in March and 3500 in April, in euros, and her share of a trip's travel 25000 in April, in Swiss francs: her lines are `2026-03 EUR groceries 4000`, `2026-04 CHF travel 25000`, `2026-04 EUR groceries 3500`.

The API works as request 1 says.

## The API

| Request                              | Answer                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `GET /v1/accounts/me/insights`       | `200 [ { month, currency, category, amount } ]`, `month` as `YYYY-MM`, `amount` the caller's shares |
