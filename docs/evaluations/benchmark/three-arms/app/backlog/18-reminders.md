# 18. Reminders

Some debts linger. Tally reminds whoever has owed too much for too long.

- **Who is reminded.** A member of a group who still owes (request 13) more than 2000 in it (20.00 in its currency) is reminded once that has lasted a week, and again each week while it lasts. Only the group's current members are reminded.
- **Kept by the background job.** At each run of the background job (request 1), Tally looks at what every member of every group still owes:
  - a member it sees owing more than 2000, and had not seen so, is noted from that run;
  - a member it sees owing 2000 or less is no longer noted: a debt that comes back is noted again, from the run that sees it;
  - a member noted for a week or more, and not reminded during the last week, is reminded at that run.

  A week is `REMINDER_PERIOD_SECONDS` seconds, 604 800 when that is not set. Nothing is noted or reminded because someone read something: a read answers what is kept.
- **The reminder** is a notice (request 17): its `kind` is `reminder`, with the group, and what the member still owes, as a positive amount. It has no expense.
- **Once a week.** However many servers run on the same database, a member is reminded at most once a week for a group.

The API works as request 1 says.

## The API

| Request              | Answer                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /v1/notices`    | a notice's `kind` may now be `reminder`: `{ id, kind, groupId, amount, at }`, `amount` what is still owed, and no `expenseId` |
