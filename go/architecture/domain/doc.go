// Package domain holds the building blocks every domain is written with: identity, entities,
// aggregates, value objects, events and exceptions. They know nothing of any context, and
// nothing of the shared kernel either: the mechanics of the architecture, not its vocabulary.
//
// In Go a refusal is an error value (*Exception), never a panic: a behaviour returns it, a
// handler passes it on with `if err != nil { return err }`, and a panic is for corrupted state
// and programming errors only (DOMAIN-RESULT, ADR 1). See result.go.
package domain
