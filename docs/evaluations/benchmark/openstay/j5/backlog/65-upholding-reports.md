# 65. Upholding a report

A report that an administrator upholds must change something: the listing stops being offered, the review stops being read, the message stops being seen.

- **The decision.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) upholds a report through the moderation queue of request 64, `POST /v1/admin/reports/{id}/uphold` `{ note }`. Every other open report on the same subject is upheld with it. What follows happens once per subject, however many reports it closes. A dismissed report changes nothing.
- **A listing upheld is suspended by moderation.**
  - Its `status` becomes `suspended`, with `suspendedBy: "moderation"`. As with any suspension (request 2), nobody can book, quote or hold it, a search does not find it, and only its host and the members of its organisation see it; its bookings stay as they are.
  - Its host and its managers (request 24) cannot publish it again: that is refused.
  - An administrator reinstates it, with a note of 1 to 500 characters saying why: it is `published` again, found and booked as before. Reinstating a listing that is not suspended by moderation is refused.
  - A host's own suspension (request 2) reads `suspendedBy: "host"`, and the host publishes it again as before. A listing that is not suspended reads `suspendedBy: null`.
  - A listing suspended by its host and then upheld is suspended by moderation. An archived listing stays archived. The host may still archive a listing suspended by moderation.
- **A review upheld is removed.**
  - It is gone from every list of reviews (`GET /v1/listings/{id}/reviews`, `GET /v1/bookings/{id}/reviews`, `GET /v1/accounts/{id}/guest-reviews`, requests 57 and 58), for everyone, its author included, and its reply (request 60) goes with it.
  - The ratings follow at once: the listing's `rating`, in its page and in search, and the host's (request 59) are those of the reviews that remain, `null` when none remains. A search sorted by rating (request 62) follows too.
  - Its author cannot write it again: they wrote their one review of that stay.
- **A message upheld is hidden from both parties.** `GET /v1/conversations/{id}` leaves it out for everyone who reads the conversation (request 51), it no longer counts as unread (request 52), and its attachments are no longer served (request 54: `404`).
- **Two at once.** Two administrators upholding two reports of the same listing at the same moment, on one server or two: one of them closes both reports (request 64), the other is refused, and the listing is suspended once.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/admin/reports/{id}/uphold` `{ note }` | as request 64, with the consequences above |
| `POST /v1/admin/listings/{id}/reinstate` `{ note }` | the listing is `published` again; `403` for anyone but an administrator |
| `GET /v1/listings/{id}` | gains `suspendedBy`: `host`, `moderation`, or `null` |
