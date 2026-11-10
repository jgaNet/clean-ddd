// Package presentation holds the REST routes of the Tracker context, on net/http: read-only,
// the Tracker has no commands. A query answers synchronously, through a view of the record, or
// is refused with the status the refusal deserves for the caller (StatusOf: 401 to a caller who
// is not signed in, 403 to a signed-in one the rule refuses).
package presentation
