# 26. Receipts

"Groceries, 87 euros": who could check? The ticket could.

- **The receipts store.** Tally keeps no files: it keeps receipts in an outside store, with an API of its own. The server is started with `RECEIPTS_URL`, the base of its API (without a trailing slash). Without it, a receipt is refused.

  | Tally asks the store                                                       | The store answers                                            |
  | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
  | `POST {RECEIPTS_URL}/files`, the file as the body, `Content-Type` its type | `201 { id, url }`: the file's id, and the link it is read at |

  When the store answers anything else, or does not answer within 5 seconds, the receipt is refused, and nothing changes.
- **Attaching a receipt.** Who may edit an expense (requests 6 and 9) attaches a receipt to it: the file as the body of the request, `Content-Type: application/octet-stream`. It is a JPEG or a PNG of 1 byte to 2 MB (2 097 152 bytes), and its type is read from its first bytes:
  - `image/jpeg`: it starts with the bytes `FF D8 FF`;
  - `image/png`: it starts with the bytes `89 50 4E 47 0D 0A 1A 0A`.

  Anything else, an empty file or a larger one, is refused, and nothing is sent to the store.
- **One per expense.** A receipt attached replaces the one the expense had. A receipt is not an edit: the expense keeps its version.
- **Reading it.** A member of the group reads an expense's receipt: its type, its size in bytes, and the store's link. An expense without a receipt has none to read (`404`).

The API works as request 1 says.

## The API

| Request                                                                                         | Answer                                                         |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `PUT /v1/expenses/{id}/receipt`, the file as the body, `Content-Type: application/octet-stream` | attaches the receipt                                           |
| `GET /v1/expenses/{id}/receipt`                                                                 | `200 { type, size, url }`; `404` when the expense has none     |
