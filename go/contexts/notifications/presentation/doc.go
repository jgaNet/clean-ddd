// Package presentation holds the REST routes of the Notifications context, on net/http: an
// inbox (a query, answered synchronously), a notification marked read and a notification sent
// by hand (commands, accepted with 202 and processed through the event bus), and the HTMX
// presenter of a live notification, which the websocket channel writes on the wire.
package presentation
