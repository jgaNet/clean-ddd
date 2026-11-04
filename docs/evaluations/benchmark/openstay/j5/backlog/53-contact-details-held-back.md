# 53. Contact details held back

A host and a traveller who swap phone numbers before paying can agree a stay outside OpenStay, and the traveller loses every protection it gives. Until a stay is paid, contact details in a message are held back.

- **Held back.** In a conversation (request 51), until a booking of its traveller for its listing has been paid, every email address, phone number and IBAN in a message is replaced by `[hidden]` for everyone who reads it but its sender, and the message shows `masked: true`. A message with nothing to hide, or read by its sender, shows `masked: false` and its text as written.
- **Paid.** A booking counts once its payment has been `paid` (request 27: the provider said `payment.succeeded`) or `declared` (request 36: its host declared it paid directly), whichever booking of that traveller for that listing it is, and even if it is cancelled or refunded afterwards. From then on every message of the conversation, the earlier ones too, shows in full to everyone who reads it.
- **What is held back.** Each match below is replaced whole by one `[hidden]`: first the IBANs, then the email addresses, then the phone numbers in what is left.
  - **An IBAN:** two capital letters, two digits, then 11 to 30 capital letters or digits, with single spaces allowed between them (`FR76 3000 6000 0112 3456 7890 189`).
  - **An email address:** letters, digits, `.`, `_`, `%`, `+` or `-`, then `@`, then letters, digits, `.` or `-`, a dot, and at least two letters (`anna.b@mail.example.com`).
  - **A phone number:** an optional `+`, then 8 digits or more, each one following the previous one directly or after a single space, dot or dash (`+33 6 12 34 56 78`, `06.12.34.56.78`).
- **Nothing is changed.** The message is kept as its sender wrote it: what is held back is only what others are shown.

The API works as request 1 says. The conversation is request 51's: `GET /v1/conversations/{id}` answers `{ id, listingId, travellerId, hostId, bookingId, messages: [ { id, senderId, text, sentAt } ] }`, read by the traveller, the listing's host and the managers and viewers of its organisation.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/conversations/{id}` | each message's `text` as the caller may see it; each message gains `masked` |
