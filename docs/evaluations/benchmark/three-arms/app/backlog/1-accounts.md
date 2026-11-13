# 1. Accounts

Tally lets a group of people share expenses: housemates, a trip, a club. Someone pays, the expense is split between the people it concerns, and Tally keeps what each of them owes or is owed. Tally takes no commission. People come to it with one account.

- Someone signs up with an email, a password and their name. The email must look like one (something, `@`, something with a dot). The password has at least 8 characters. The name has 1 to 60 characters, and is not only spaces; it is how the other people of their groups will see them. An email already used by an account is refused, whatever its case.
- They sign in with their email and password and receive a token, which they send with every later request. A wrong password, or an email no account has, is refused with the same answer, so nobody learns which emails have accounts.
- A signed-in person reads their own account. Nobody else does.
- What the application knows is kept in a SQLite database, in the file `DATABASE_PATH` names. A server stopped, even abruptly, and started again on the same file finds every account, and everything later requests bring. Several servers may run on the same file at the same time.

## How the API works

These conventions hold for this request and every later one.

- **Every route is under `/v1`,** and the server listens on `PORT`.
- **A signed-in request** carries `Authorization: Bearer <token>`. A request that needs one and has none, or has one that proves nothing, is refused with `401`.
- **A request that changes something** answers in one of two ways. The application chooses, and may choose differently for different requests:
  - **At once:** `2xx` when it is done, or `4xx` when it is refused (`400` for a body missing a field, or with a field of the wrong type; `401`, `403`, `404`, `409` or `422` otherwise, as fits). A request that creates something answers `{ id }`.
  - **Later:** `202 { operationId }`, and the outcome is read at `GET /v1/operations/{operationId}`, with the same token, or with none when the request had none. It answers `{ status, result?, error? }`, where `status` is `PENDING` until it ends, then `SUCCESS` or `ERROR`. A request that creates something has the new thing's id as its `result`. When it ends in `ERROR`, it also has `error: { type, message }`: `type` is the name of the rule that refused it, in PascalCase, and `message` says the same in a sentence. Read without a token when the request had one, the operation is refused with `401`; read with another caller's token, it answers `404`.

  A body missing a field, or with a field of the wrong type, is always refused at once with `400`, even by a request the application otherwise answers later. Whether a value is allowed (a format, a length, a range, one of a list) is a refusal like any other: `4xx` at once, or `ERROR` later. A `5xx` is never an answer the application chooses: it says the server failed.

- **A request that reads** answers at once: `200` with what it reads, `404` for something that does not exist or that the caller may not see, signed in or not. One that needs a signed-in caller and has none is refused with `401`, as above.
- **Ids** are strings. **Dates** are `YYYY-MM-DD`, and **times** are ISO 8601, in UTC. **Amounts** are integers, in the minor unit of the group's currency (request 2). No field the requests name is `null` unless its request says when.
- **Time.** What changes with time changes at the next run of a background job, which the server runs every `JOBS_INTERVAL_SECONDS` seconds (60 when that is not set), never because someone read it: a read answers what is kept.

## The API

| Request                                               | Answer                              |
| ----------------------------------------------------- | ----------------------------------- |
| `POST /v1/accounts` `{ email, password, name }`       | creates the account, `{ id }`       |
| `POST /v1/accounts/login` `{ email, password }`       | `200 { token }`; `401` when refused |
| `GET /v1/accounts/me`                                 | `200 { id, email, name }`           |
