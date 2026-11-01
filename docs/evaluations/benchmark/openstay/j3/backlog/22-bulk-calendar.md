# 22. Changing several calendars at once

A host with many places blocks the same week, or sets the same season, everywhere at once.

- **Bulk blocking.** A host blocks a range of nights in several of their listings in one request.
- **Bulk seasons.** A host sets a seasonal price (request 15) for a range of nights in several listings in one request.
- **All or nothing.** Either every listing named changes or none does. Nothing changes when any of them is not the caller's, does not exist, or cannot take the change (a night already booked, requested or held, for a block).
- **Under concurrency too.** A booking made at the same moment as a bulk block on the same nights ends with one of the two, never both.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/hosts/me/block` `{ listingIds, from, to }` | |
| `POST /v1/hosts/me/seasonal-prices` `{ listingIds, from, to, nightlyPrice }` | |
