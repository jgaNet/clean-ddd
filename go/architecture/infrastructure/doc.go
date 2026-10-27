// Package infrastructure holds the in-memory pieces every context runs on locally: a store, the
// process-local event bus, the unit of work over the stores, the console logger. Each is an
// adapter of a port the Application layer declares; a real deployment replaces them behind the
// same ports.
package infrastructure
