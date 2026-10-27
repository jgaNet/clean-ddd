// Package commands holds the use cases of the Security context that change state: each file
// is one command (a struct embedding domain.CommandEvent, its fields the payload) and its
// handler (a struct taking its ports, with Execute).
package commands
