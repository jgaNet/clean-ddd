# 25. Split templates

The flat splits nearly everything the same way: two shares each for Ann and Bob, who share the big room, one for Cy. Typing it every time is tedious.

- **A template.** A member of a group saves a split under a name: a name of 1 to 60 characters, not only spaces, and either `splitBetween` or `splitByShares` (request 7), its members members of the group, each listed once, each with at least 1 share. Exact amounts depend on an expense's amount, and make no template: a template with neither of the two, or both, is of the wrong shape. Two templates of a group never have the same name, whatever its case.
- **Splitting by a template.** An expense, when it is recorded or edited, may give `template`, the id of one of its group's templates, in place of a split: it is split as if the template's split had been given, under the same rules, by the rule in force (request 10). Its members must be members of the group at that moment, the payer among them; otherwise the expense is refused. An expense gives exactly one of the three splits and `template`.
- **What an expense keeps.** Its shares as they were decided, and how it was split (`equal` or `shares`, request 7). A template changed or removed later changes no expense.
- **Reading them.** A member lists the group's templates, the earliest saved first, each with its id, group, name, and its split as it was given.
- **Changing them.** The member who saved a template, or the group's owner, replaces it, under the same rules, or removes it. Any other member is refused.

The API works as request 1 says.

## The API

| Request                                                                       | Answer                                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/templates` `{ name, splitBetween }` or `{ name, splitByShares }` | saves the template, `{ id }`                                                                          |
| `GET /v1/groups/{id}/templates`                                               | `200 [ { id, groupId, name } ]` and each one's split as it was given, the earliest first                         |
| `PUT /v1/templates/{id}` `{ name, splitBetween }` or `{ name, splitByShares }` | replaces the template                                                                                          |
| `DELETE /v1/templates/{id}`                                                   | removes it                                                                                                     |
| `POST /v1/groups/{id}/expenses` `{ description, amount, date, template }`      | as in request 4, split by the template; so does an edit (`PUT /v1/expenses/{id}`)                             |
