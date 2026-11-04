# 78. Trader information

A traveller booking from a business has rights a traveller booking from a private person does not, and must be able to see who the business is.

- **Professional.** A host declares themselves professional by giving their trader information: a legal name (1 to 200 characters), a registration number (1 to 50 characters) and an address (1 to 500 characters), none of them only spaces. Giving it again replaces it.
- **Private again.** The host clears it, and is a private host again. A host who never gave it is private.
- **On their listings.** Every listing the host hosts shows the host's trader information, as it is now, to anyone who can see the listing (request 2), organisation listings included (request 23: the organisation's owner is the listing's host). A private host's listings show `trader: null`. A change shows on every listing at once.
- **Who.** A host, for themselves: an account that is not a host is refused. The host reads their own trader information.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/hosts/me/trader` `{ legalName, registrationNumber, address }` | |
| `POST /v1/hosts/me/trader/clear` | |
| `GET /v1/hosts/me/trader` | `200 { legalName, registrationNumber, address }`; `404` while the host is private |
| `GET /v1/listings/{id}` | gains `trader: { legalName, registrationNumber, address }`, or `null` |
