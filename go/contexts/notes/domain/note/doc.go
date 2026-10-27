// Package note is the Note aggregate of the Notes context: the aggregate itself, its value
// objects, its events, its exceptions, its snapshot, the domain service that holds the one rule
// the aggregate cannot check alone, and the ports it needs answered. Everything that can
// happen to a note goes through a method of Note, which enforces the business rules before
// changing state; the package never touches persistence, logging or HTTP.
package note
