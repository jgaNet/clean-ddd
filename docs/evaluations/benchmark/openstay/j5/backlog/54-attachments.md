# 54. Attachments

A traveller sends a scan of their ID, a host sends the access plan. A message may carry a file.

- **Uploading.** Anyone who writes in a conversation (request 51: its traveller, the listing's host, a manager of its organisation) uploads a file to it, with a file name of 1 to 200 characters. The upload answers its id, its type and its size in bytes.
- **What is accepted.** A PDF, a JPEG or a PNG, of 1 byte to 5 MB (5,242,880 bytes). The type is read from the file's first bytes, never from its name:
  - `application/pdf`: it starts with `%PDF-`;
  - `image/jpeg`: it starts with the bytes `FF D8 FF`;
  - `image/png`: it starts with the bytes `89 50 4E 47 0D 0A 1A 0A`.

  A PNG named `plan.pdf` is an `image/png`; anything else, whatever its name, is refused, and so is an empty or a larger file.
- **Attaching.** A message may carry uploads: the sender's own, to that conversation, not attached to a message yet. Each upload is attached once; anything else in `attachmentIds` is refused, and the message with it.
- **Downloading.** Once attached, a file is downloaded, byte for byte, with its type as `Content-Type`, by everyone who reads the conversation, and by nobody else. Until it is attached, only its uploader downloads it. To anyone else it does not exist (`404`).
- **As it is.** A file is passed on as uploaded: nothing in it is held back (request 53 reads a message's text only).
- **Kept.** A file uploaded through one server is downloaded through another on the same database, and after a restart.

The API works as request 1 says. The conversation is request 51's: a message is `{ id, senderId, text, sentAt }`, its text 1 to 2,000 characters, with a text even when it carries a file.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/conversations/{id}/attachments?name=<file name>`, the file as the body, `Content-Type: application/octet-stream` | `{ id, type, size }` |
| `POST /v1/conversations/{id}/messages` `{ text, attachmentIds? }` | `attachmentIds` a list of upload ids |
| `GET /v1/conversations/{id}` | each message gains `attachments: [ { id, name, type, size } ]`, empty when it carries none |
| `GET /v1/attachments/{id}` | `200`, the file's bytes, `Content-Type` its type |
