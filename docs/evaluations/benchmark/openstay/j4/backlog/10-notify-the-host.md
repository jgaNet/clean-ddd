# 10. Notify the host

Hosts want to know at once when someone books, or asks to book. The notice goes through an outside notification service, which is not reliable, and the machine OpenStay runs on can lose power at any moment.

- **The notice.** When `NOTIFY_URL` is set, every new booking sends its host a notice:
  - a confirmed booking, from request 6;
  - and a request, from request 7.

  The notice is `POST {NOTIFY_URL}` with the JSON body `{ id, kind, hostId, bookingId }`:
  - `id` is the notice's own id;
  - `kind` is `booking-confirmed` or `booking-requested`.

- **Until it is accepted.** The service may refuse a notice with an error status, or not answer within two seconds. A notice it has not accepted with a `2xx` is sent again, with the same body, until it is accepted:
  - the first retry comes within a second of the failure;
  - each later one comes at most five seconds after the previous attempt ended.

  A notice the service accepted is not sent again. Accepting a request makes no new notice: the host already knows of it.

- **A crash loses nothing.** When the server is killed at any moment and started again on the same database, every booking that was recorded has its notice accepted in the end. A booking that was not recorded has none.
- **One notice per booking.** The service recognises a notice by its id, so the same notice sent twice after a crash does no harm. A second notice, under another id, for the same booking would.
- **Without `NOTIFY_URL`,** nothing is sent.

The API works as request 1 says.

## The API

No route changes. The server is started as before, with `NOTIFY_URL` in its environment when there is a service.
