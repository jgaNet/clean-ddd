// Package account is the Account aggregate of the Security context and everything around it:
// its lifecycle, its credentials, its events, its exceptions, its snapshot, its ports (the
// repository and the queries), and the registration service that holds the one rule the
// aggregate cannot check alone. Everything that can happen to an account goes through a
// method of Account, which enforces the business rules before changing state; the package
// never touches persistence, hashing, tokens or HTTP.
package account
