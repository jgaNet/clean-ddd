# 21. An expense in another currency

The week in Zurich was paid in francs, and the group counts in euros. The payer says what they paid, in which currency, and at what rate.

- **In another currency.** An expense, when it is recorded or edited (requests 4, 6 and 7), gives either its `amount`, in the group's currency, as before, or `original`: what was paid in another currency, with
  - `currency`, one of Tally's currencies (request 2), other than the group's;
  - `amount`, in the hundredths of that currency, from 1 to 100 000 000;
  - `rate`, what one of that currency is worth in the group's currency: a decimal number written as a string, greater than 0, with at most 6 digits after the point, such as `"0.9542"`, `"1"` or `"12.5"`.

  A body with neither `amount` nor `original`, or with both, is of the wrong shape.
- **The amount in the group's currency** is the original amount times the rate, rounded to the nearest whole number, a half rounded up. It is the expense's `amount`: from 1 to 100 000 000 like any amount, otherwise the expense is refused; it is what is split (requests 4, 7 and 10), what exact amounts add up to, and what the balances, the lists and the statements count.

  For instance, 1234 at `"1.0625"` is 1311.125, so 1311; 1000 at `"0.9545"` is 954.5, so 955.
- **Kept as given.** The expense keeps its currency, its original amount and its rate, and reads them back as they were given, the rate the same string. An expense in the group's currency reads as before, without `original`; so do the expenses recorded before this request.
- **Edited.** An edit gives the expense whole again (request 6): edited with an `amount`, it is in the group's currency; edited with `original`, it is in that currency, at that rate.

The API works as request 1 says.

## The API

| Request                                                                                         | Answer                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/groups/{id}/expenses` `{ description, original: { currency, amount, rate }, date }` and one of the three splits | as in request 4, in another currency                                                    |
| `PUT /v1/expenses/{id}` `{ description, original: { currency, amount, rate }, date, version }` and one of the three splits | as in request 6                                                                          |
| `GET /v1/expenses/{id}`                                                                         | an expense in another currency also has `original: { currency, amount, rate }`; its `amount` is the group currency's |
