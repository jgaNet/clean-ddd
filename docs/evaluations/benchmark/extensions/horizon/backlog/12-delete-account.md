# 12. Deleting an account

A person can leave, and take their data with them.

- A signed-in person deletes their own account.
- Their notes go with it, with everything on them: comments, versions, shares and reminders.
- Their comments on other people's notes go too.
- They no longer appear in any note's `sharedWith` or `editors`.
- Their notifications go, and so does their plan.
- A token they hold stops working: a request that carries it is anonymous.
- Their email can sign up again, as a new account.

## The API

| Request | Answer |
| --- | --- |
| `DELETE /accounts/me` | 202; 403 anonymous |
| `GET /accounts/me` with a deleted account's token | 403, as for any anonymous caller |
| `POST /accounts/login` with a deleted account's email | 401 |
