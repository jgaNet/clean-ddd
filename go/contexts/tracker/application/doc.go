// Package application is the Tracker's whole model: the read model, its store port, the
// projection from an operation to a record, and (under queries) the two queries. The Tracker
// has no aggregate. It is a projection of every operation the bus carries, so that a client
// that received 202 { operationId } can come back and ask how it went.
package application
