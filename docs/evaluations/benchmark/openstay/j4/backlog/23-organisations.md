# 23. Organisations

Professional hosts let places as a company, not as a person.

- **An organisation.** A host creates one, with a name of 1 to 100 characters, not only spaces. The host who creates it is its owner.
- **Its listings.** The owner moves a listing they host into the organisation. A listing belongs to one organisation at most: moving a listing already in one is refused. It stays its host's listing too.
- **Who acts on them.** Its host, who is the organisation's owner, does everything on it as before. Nobody else gains anything.
- **What it shows.** Anyone who can see an organisation's listing sees which organisation it belongs to. The owner reads the organisation and lists their organisations.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/organisations` `{ name }` | creates the organisation, `{ id }` |
| `POST /v1/listings/{id}/move-to-organisation` `{ organisationId }` | |
| `GET /v1/organisations/{id}` | `200 { id, name, ownerId, listingIds }`, for its owner |
| `GET /v1/organisations/mine` | `200 [ organisation ]`, the most recently created first |
| `GET /v1/listings/{id}` | gains `organisationId`, or `null` |
