// Package presentation holds the REST routes of the Tracker context, on net/http: read-only,
// the Tracker has no commands. A query answers synchronously, through a view of the record, or
// is refused with the status the refusal deserves (StatusOf).
package presentation
