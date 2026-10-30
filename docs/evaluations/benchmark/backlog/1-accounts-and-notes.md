# 1. Accounts and notes

People need accounts, so that each person's notes are theirs; a signed-in person keeps notes.

**Accounts**

- Anyone signs up with an email address and a password. The password has at least 8 characters; the email address looks like one; an email address is used by one account only. Signing up is a command like any other: following the operation gives back the new account's id.
- A person logs in with their email and password and receives a token. A wrong email or password is refused without saying which one was wrong.
- A request that carries that token (`Authorization: Bearer <token>`) is that person's; every other request is anonymous.
- A signed-in person asks who they are: their account id and email. An anonymous caller is refused.
- A password is never stored or returned in clear.

**Notes**

- A signed-in person writes a note: a title and a text. The title is required and at most 100 characters; the text may be empty.
- They edit the title and the text of one of their notes.
- They archive one of their notes, and restore it. An archived note cannot be edited until it is restored.
- They list their own notes, most recent first, and read one of their notes by its id.
- Nobody else can read, edit, archive or restore a person's note; an anonymous caller can do none of it.

## The API

Every path is under the application's prefix (`/v1`). A command answers `202 { operationId }`; its outcome is read at `GET /tracker/operations/{operationId}`: `{ status: 'SUCCESS', result }` or `{ status: 'ERROR', … }`. A refusal is an `ERROR` outcome.

| Request | Answer |
| --- | --- |
| `POST /accounts` `{ email, password }` | 202; outcome's `result`: the account id |
| `POST /accounts/login` `{ email, password }` | 200 `{ token }`; 401 when refused |
| `GET /accounts/me` | 200 `{ id, email }`; 403 anonymous |
| `POST /notes` `{ title, text }` | 202; outcome's `result`: the note id; 403 anonymous |
| `PUT /notes/{id}` `{ title, text }` | 202 |
| `POST /notes/{id}/archive`, `POST /notes/{id}/restore` | 202 |
| `GET /notes` | 200 `[{ id, title, text, archived, createdAt }]`, most recent first; 403 anonymous |
| `GET /notes/{id}` | 200 `{ id, title, text, archived, createdAt }`; 404 when it is not the caller's or does not exist; 403 anonymous |

`createdAt` is an ISO 8601 string. Later features add fields to a note; a client ignores the ones it does not know.
