# 17. Notices

Bob paid for the pizzas and put Cy in the split. Cy should not learn it a month later.

- **A notice.** When an expense is recorded (request 4), each member of its split other than its payer receives a notice: which group, which expense, and their share of it. The payer receives none: they recorded it. Editing or deleting an expense makes no notice.
- **One per member.** An expense makes one notice for each member it concerns, never two, even when the server is stopped at any moment and started again.
- **Soon.** A notice appears within a few seconds of the expense being recorded, without anyone acting; it does not wait for the background job.
- **My notices.** A signed-in person lists their own notices, the most recent first. Nobody else reads them. A notice stays theirs after they leave the group.

The API works as request 1 says.

## The API

| Request               | Answer                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/notices`     | `200 [ { id, kind, groupId, expenseId, amount, at } ]`, the most recent first: `kind` is `expense`, `amount` the member's share, `at` when it was made |
