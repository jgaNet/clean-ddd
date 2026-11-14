# 22. Rates offered by a rates service

Nobody knows the franc's rate by heart. Tally offers the day's rate; the payer takes it, or corrects it a little.

- **The rates service.** An outside system, with an API of its own. The server is started with `RATES_URL`, the base of its API (without a trailing slash). Tally asks it the rate of a currency to another on a day:

  | Tally asks the rates service                     | The rates service answers                                                                 |
  | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
  | `GET {RATES_URL}/rates/{from}/{to}?date={date}`  | `200 { rate }`, what one `from` is worth in `to` on that day; `404` when it has no rate   |

  `rate` is written as request 21 writes one: a decimal number in a string, greater than 0, with at most 6 digits after the point. When the service answers anything else, or does not answer within 5 seconds, or the server was started without `RATES_URL`, there is no rate offered.
- **The rate offered.** A member of a group reads the rate Tally offers from a currency to the group's on a day (today when `date` is left out), as the service gives it. When there is none, or the currency is the group's or not one of Tally's, the answer is `404`.
- **Taking it.** An expense in another currency (request 21), recorded or edited, may leave out its `rate`: it is then recorded at the rate offered from its currency to the group's on its date. When there is no rate offered, it is refused.
- **Correcting it.** An expense that gives its `rate` is refused, by the name of that rule, when the rate differs from the one offered for its currency and date by more than 2 % of the one offered. When there is no rate offered to compare it with, it is refused too. A server started without `RATES_URL` offers no rate, and takes the payer's rate, whatever it is, as request 21 does.

  For instance, with `"0.95"` offered, `"0.931"` and `"0.969"` are taken, `"0.93"` and `"0.97"` refused.
- **Read back.** The expense reads the rate it was recorded at, the one offered when its rate was left out (request 21).

The API works as request 1 says.

## The API

| Request                                                       | Answer                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/rates/{currency}?date={date}`            | `200 { currency, date, rate }`, from `currency` to the group's; `404` when no rate is offered            |
| `POST /v1/groups/{id}/expenses` `{ …, original: { currency, amount } }` | `rate` may be left out: the expense is recorded at the rate offered on its date              |
| `PUT /v1/expenses/{id}` `{ …, original: { currency, amount } }` | the same, as in request 6                                                                              |
