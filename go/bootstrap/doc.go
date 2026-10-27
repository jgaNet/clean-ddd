// Package bootstrap is the composition root: the one place that knows every context, every
// route and the transport (net/http). It builds the bus (the in-memory one, tracked), the
// stores and the unit of work over them, the modules from each context's wiring, the routes
// under the API prefix, and the two middlewares that give each request its identity
// (Security's authentication) and its ExecutionContext. Then it starts the modules, seeds the
// administrator through the same handler as any command, and only then listens. The websocket
// is served beside the API. The front end is not: it is a client like any other (web/, served
// by any static server), so the API answers it as it answers an API client, with CORS for the
// origins the settings allow.
package bootstrap
