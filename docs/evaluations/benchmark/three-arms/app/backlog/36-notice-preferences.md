# 36. Notice preferences

Dan likes to know when he is put in a split, but not every budget the flat passes.

- **Each kind, on or off.** A signed-in person says, for each kind of notice (`expense`, request 17; `reminder`, request 18; `budget`, request 24), whether they receive it. Every kind is on until they turn it off; they may turn it on again.
- **From then on.** A notice of a kind someone has turned off is not made for them, from the moment they turn it off; one of a kind they turned on again is made from that moment. Nothing made earlier changes, and nothing missed while it was off is made later.
- **Reminders.** A reminder that is not made while reminders are off does not count as made: once they are on again, a member who still owes is reminded at the next run that would remind them (request 18).
- **For the others.** What one person turns off changes nothing for anyone else: the others of the group receive their notices as before, and a budget passed in a month is still told once (request 24).
- **Reading them.** A signed-in person reads their own preferences: each kind, in the order above, on or off. Nobody else reads them.

The API works as request 1 says.

## The API

| Request                                                              | Answer                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /v1/accounts/me/notice-preferences`                             | `200 [ { kind, enabled } ]`, the three kinds in the order above                    |
| `PUT /v1/accounts/me/notice-preferences/{kind}` `{ enabled }`        | turns the kind on or off for the caller, `enabled` a boolean                       |
