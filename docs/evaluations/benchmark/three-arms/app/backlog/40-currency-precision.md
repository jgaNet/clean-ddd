# 40. Currencies with no minor unit, or with three decimals

A group going to Tokyo wants to count in yen, and one in Kuwait in dinars. Neither counts in hundredths.

- **Four more currencies.** A group may now be in `JPY` or `KRW`, which have no minor unit, or in `KWD` or `BHD`, which count in thousandths, beside Tally's six (request 2). Each of the ten is a currency of Tally everywhere a request names one: a group's, an expense's original amount (request 21), a rate offered (request 22), a settlement's original amount (request 39).
- **Each amount in its currency's own minor unit,** from now on, and for every amount read: `1250` is 12.50 in `EUR`, `USD`, `GBP`, `CHF`, `CAD` and `AUD`, which count in hundredths; 1250 yen or won in `JPY` and `KRW`; 1.250 dinars in `KWD` and `BHD`. Every amount the requests name (an expense's, a share, a balance, a settlement's, a budget, a fee, a notice's, an audit entry's, a statement's, a line of insights) is a whole number of the minor unit of the currency it is in, and so is every limit stated as an amount: from 1 to 100 000 000 of it.
- **Every earlier amount reads as it did.** An amount Tally kept before this change, all of them in the six currencies that count in hundredths, reads the same after it: no expense, share, balance, settlement, budget, notice, audit entry or statement changes.
- **Between two currencies,** a rate is what one unit of a currency (one yen, one euro, one dinar) is worth in the other, as before (requests 21, 22 and 39). The amount in the group's currency is the original amount, read in its currency's units, times the rate, written in the group's minor unit, to the nearest whole number, a half up. Between two of the six, nothing changes.

  For instance, in a `JPY` group, 12.50 euros (`1250`) at `"161.5"` is 2018.75 yen, so `2019`; in a `KWD` group, 10 dollars (`1000`) at `"0.3075"` is 3.075 dinars, so `3075`; in a `EUR` group, 10 000 yen (`10000`) at `"0.0062"` is 62 euros, so `6200`.
- **Reminders** (request 18) are for a member who still owes more than 20 of the group's currency: more than 2000 in the six that count in hundredths, as before; more than 20 in `JPY` and `KRW`; more than 20 000 in `KWD` and `BHD`.
- **The provider's fee** (request 38) is in the minor unit of the payment's currency.

The API works as request 1 says.

## The API

| Request                               | Answer                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups` `{ name, currency }`| `currency` may now be `JPY`, `KRW`, `KWD` or `BHD`                                                               |
| `GET /v1/groups/{id}`                 | `currency` may now be `JPY`, `KRW`, `KWD` or `BHD`; so may an expense's or a settlement's `original.currency`, and a rate's `currency` |
