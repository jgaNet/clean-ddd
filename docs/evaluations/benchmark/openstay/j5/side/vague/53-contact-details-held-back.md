# 53. Contact details held back

A host and a traveller who swap phone numbers before paying can agree a stay outside OpenStay, and the traveller loses every protection it gives. Until a stay between them is paid, a message should not show anyone's email, phone number or bank account number to the other side. The person who wrote it still sees what they wrote. Once the stay is paid, everything shows.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/conversations/{id}` | each message's `text` as the caller may see it; each message gains `masked` |
