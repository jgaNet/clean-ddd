// Package presentation holds the REST routes of authentication and accounts, on net/http,
// their presenters in both formats, and the middleware that identifies the caller of every
// request of the application. Sign-up and validation are commands: accepted (202) and
// followed through the operation. Login answers synchronously, in JSON or HTMX depending on
// the request, and runs the handler through the module: the token is answered, and the
// Tracker never sees it.
package presentation
