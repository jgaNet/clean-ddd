# 79. Registration numbers by city

Many cities require a short-term let to show the number the town hall gave it. Administrators should be able to say which cities require one and what it looks like, hosts should be able to give their listing's number, and OpenStay should not publish a place that lacks a valid one where its city asks for it.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/cities/{city}/registration` `{ required, pattern }` | |
| `GET /v1/cities/{city}/registration` | `200 { required, pattern }` |
| `PUT /v1/listings/{id}/registration-number` `{ number }` | |
| `GET /v1/listings/{id}` | gains `registrationNumber`, or `null` |
