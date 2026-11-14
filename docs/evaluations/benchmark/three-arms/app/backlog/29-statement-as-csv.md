# 29. A statement as CSV

Ann's accountant wants her Tally statement in a spreadsheet, and the money she was paid back on it too.

- **Settlements in the statement.** From now on, a member's statement (request 8) lists, beside the expenses, the settlements they paid or received that the balances count (requests 12, 13 and 15): one in cash from when it is recorded, one through the provider from when it is paid until it is refunded. Every entry says what it is, as `kind`:
  - an expense's entry is as request 8 says, its `kind` `expense`;
  - a settlement's entry has `kind` `settlement` and the settlement's id as `settlementId`, in place of `expenseId`. Its `date` is the day, in UTC, the balances started to count it; its `description` is `Settlement in cash` or `Settlement through the provider`; `paid` is its amount for its payer and 0 for its payee, `share` its amount for its payee and 0 for its payer; and `balance`, as for every entry, the member's balance once it is counted.

  The order is request 8's: the earliest date first; on the same date, the earliest first, an expense by when it was recorded, a settlement by when the balances started to count it. The statement's balance, the last entry's, is then the member's balance in the group (request 5), but for what passed to the owner when someone left with a balance (request 20).
- **As CSV.** A member reads the same statement as a CSV file (`Content-Type: text/csv`), in UTF-8: a header line, then one line for each entry, in the same order. The header is

  `date,kind,id,description,paid,share,balance`

  and each line gives those fields of its entry in that order, `id` being the expense's or the settlement's. Amounts are integers in hundredths, as everywhere. Lines end with CRLF. A field holding a comma, a double quote or a line break is written between double quotes, each double quote in it doubled; no other field is quoted.
- **Who reads it.** As request 8 says: the members of the group, any member's statement, a former member's included.

The API works as request 1 says.

## The API

| Request                                                    | Answer                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/members/{memberId}/statement`         | each entry gains `kind`; a settlement's entry has `settlementId` in place of `expenseId`                |
| `GET /v1/groups/{id}/members/{memberId}/statement.csv`     | `200`, `Content-Type: text/csv`, the statement as CSV, its columns in the order above                    |
