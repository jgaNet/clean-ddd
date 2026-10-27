// Package application holds the Application layer's building blocks: what every use case is
// written with, whatever the context. The base handlers (a command, a query, a reaction) as
// generic functions over small interfaces, the execution context that travels with one
// request, the operation a published event becomes, the event bus port, the module that lists
// a context's handlers as data, and the one function that publishes an aggregate's events once
// the transaction is committed.
package application
