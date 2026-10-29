// Package bootstrap is the composition root: the one place that knows every context and every
// route. It builds the bus (the in-memory one, tracked), the stores, the modules from each
// context's wiring, and mounts each context's routes on the transport (bootstrap/transport),
// which knows no context: it gives each request its identity — here Security's authentication —
// and its ExecutionContext, CORS for the origins the settings allow, the routes under the API
// prefix, and listening. Then it starts the modules, seeds the administrator through the same
// handler as any command, and only then listens. The websocket is served beside the API. The
// front end is not: it is a client like any other (web/, served by any static server), so the
// API answers it as it answers an API client.
//
// bootstrap/starter is the composition an application starts from: the Tracker alone, which
// `clean-ddd create` copies in place of this one (ADR 27); cmd/application is the entry point,
// the same file for both.
package bootstrap
