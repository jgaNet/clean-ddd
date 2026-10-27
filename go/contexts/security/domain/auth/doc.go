// Package auth is authentication as the domain sees it: a token carries a subject and what it
// is for; a password is only ever a hash. How tokens are signed and passwords hashed is the
// infrastructure's: this package holds the two ports, and the kind of token that is not a
// session.
package auth
