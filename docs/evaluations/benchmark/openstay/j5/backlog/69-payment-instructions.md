# 69. Direct payment instructions

A traveller who pays a host by bank transfer needs the host's bank details, from OpenStay rather than from a message anyone could have written. The commonest fraud is a bank account swapped at the last minute: a recent change must show.

- **The host's bank details.** A host sets the IBAN they are paid on directly, and the name of its holder (1 to 100 characters, not only spaces). Setting them again replaces them. An account that is not a host is refused.
- **A valid IBAN.** Spaces are ignored and letters may be in either case: it is kept upper-case, without spaces. It is two letters, two digits, then 11 to 30 letters or digits, and its check digits are right: with its first four characters moved to the end and each letter replaced by two digits (`A` = 10 … `Z` = 35), the number leaves 1 when divided by 97. Anything else is refused, and the details already set stay.
- **Shown to the traveller who pays.** The traveller of a booking reads the payment instructions while the booking is `confirmed` and its payment is `due` (request 27: nothing under way with the provider, nothing paid, not declared paid by the host, request 36), and only when the listing's host has set bank details: the host's IBAN and holder, and the booking's id as the `reference` of the transfer. In every other case, and to anyone else, host included, they do not exist (`404`).
- **A recent change is flagged.** `changedRecently` is `true` when the IBAN shown took its current value less than 7 days (168 hours) ago, the first IBAN a host sets included; `false` after that. Setting the same IBAN again, with a new holder or not, changes nothing to when it took its value.
- **Always the current details.** The instructions show the host's details as they are when they are read, not as they were when the booking was made.
- **Time.** Now is as request 57 says: the machine's time plus `CLOCK_OFFSET_DAYS` days.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/hosts/me/bank-details` `{ iban, holder }` | |
| `GET /v1/hosts/me/bank-details` | `200 { iban, holder, changedAt }`, `changedAt` when the IBAN took its current value; `404` while the host has none |
| `GET /v1/bookings/{id}/payment-instructions` | `200 { iban, holder, reference, changedRecently }`, for the booking's traveller, as above |
