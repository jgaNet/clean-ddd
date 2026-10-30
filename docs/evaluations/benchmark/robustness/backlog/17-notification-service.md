# 17. An outside notification service

People also want their notifications outside the application. An outside service receives them, and it is not reliable.

- When the environment variable `NOTIFY_URL` is set, every notification a person receives is also sent to that service: `POST {NOTIFY_URL}` with the JSON body `{ id, recipientId, kind, noteId }`. `id` is the notification's id as `GET /notifications` lists it, and `recipientId` is the account it is for.
- The service may refuse a notification with an error status, or not answer within two seconds. A notification it has not accepted with a `2xx` is sent again, with the same body, until it is accepted. The first retry comes within a second, and later ones at most five seconds apart.
- A notification the service accepted is not sent again. The service recognises a notification by its id, so the same notification sent twice after a crash does no harm; the same notification under another id would.
- A notification the service has not accepted when the server stops, even abruptly, is sent after the server starts again.
- Without `NOTIFY_URL`, nothing is sent.

## The API

No route changes. The server is started the way it is started today, with `NOTIFY_URL` in its environment when there is a service.
