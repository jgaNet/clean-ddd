package infrastructure

import "time"

// SystemClock is the machine's time, in UTC, read here and nowhere else (DOMAIN-ONE-CLOCK,
// ADR 42): it is an application.Clock, and the wiring passes it to what needs a now. An
// application that moves time (a demo, a test server, an offset) builds another clock in its
// wiring and passes that one instead. `go run ./tools/conventions` refuses a read of the
// machine's time in any other file of the tree but the tests.
func SystemClock() time.Time { return time.Now().UTC() }
