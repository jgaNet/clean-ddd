# 13. Favourites

Travellers keep a list of places they like, to come back to them.

- A signed-in account saves a published listing to its favourites, and removes it again. Saving one already saved, or removing one not saved, changes nothing.
- Only a published listing can be saved: a draft, a suspended or an archived one, or one that does not exist, cannot, whoever asks.
- The favourites list shows each saved listing, the most recently saved first. A listing suspended or archived since it was saved stays in the list, with its state, so the traveller knows why it cannot be booked.
- Each account sees its own favourites only.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings/{id}/favourite` | |
| `POST /v1/listings/{id}/unfavourite` | |
| `GET /v1/favourites` | `200 [ { id, title, city, nightlyPrice, status } ]`, the most recently saved first |
