// Package infrastructure holds the adapters of the Notes context's ports: the repository and
// the queries twice (in memory, and over SQLite behind the same interfaces), the first-line
// title suggestions, and the directory that answers "does this account exist?" over
// Security's read model.
package infrastructure
