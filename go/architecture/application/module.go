package application

import (
	"fmt"

	"clean-ddd/architecture/domain"
)

// Subscription is an event's name and the handlers that answer it; Command and Reaction build one.
type Subscription struct {
	Channel  string
	Handlers []Subscriber
}

// Module wires one bounded context together: its commands, queries, domain events and
// integration events. It is plain data plus its lookups; the business lives in the handlers
// (ARCH-MODULES-DATA). Each context has one wiring file per environment,
// contexts/<context>/module.go:
//
//	&application.Module{
//	    Name:         "Notes",
//	    Commands:     []application.Subscription{application.Command(commands.NewCreateNoteHandler(repository))},
//	    Queries:      []any{queries.NewGetMyNotesHandler(noteQueries)},
//	    DomainEvents: []application.Subscription{application.Reaction(events.NoteCreatedHandler{})},
//	}
//
// Anything else a context exposes (a middleware, a service another context needs) is a named
// export of the same wiring file, not a slot in the module. From a route:
//
//	presentation.Accept(w, r, module, commands.CreateNoteCommandEvent{...})    // command, async (202, or 401)
//	application.Query(application.QueryOf[*queries.GetMyNotesHandler](module), params, ctx) // query, sync
type Module struct {
	Name              string
	Commands          []Subscription
	Queries           []any
	DomainEvents      []Subscription
	IntegrationEvents []Subscription
}

// Start connects the bus and subscribes every handler of the module on it.
func (m *Module) Start(bus EventBus) error {
	if err := bus.Connect(); err != nil {
		return err
	}
	for _, group := range [][]Subscription{m.DomainEvents, m.Commands, m.IntegrationEvents} {
		for _, subscription := range group {
			for _, handler := range subscription.Handlers {
				bus.Subscribe(subscription.Channel, handler)
			}
		}
	}
	return nil
}

// inner is what a subscriber built by Command or Reaction exposes: the handler it wraps.
type inner interface {
	Inner() any
}

// CommandOf finds a command handler by its type, for the rare command a caller runs
// synchronously instead of publishing (a login). A missing one is a wiring error: it panics.
func CommandOf[H any](m *Module) H {
	for _, subscription := range m.Commands {
		for _, handler := range subscription.Handlers {
			if wrapped, ok := handler.(inner); ok {
				if found, ok := wrapped.Inner().(H); ok {
					return found
				}
			}
		}
	}
	var zero H
	panic(fmt.Sprintf("missing command handler %T in module %s", zero, m.Name))
}

// opener is what a subscriber built by Command exposes: whether its handler lets anyone ask.
type opener interface {
	anyoneMayAsk(command domain.Event) bool
}

// AnyoneMayAsk is whether the handler this module lists for a command says anyone may ask for
// it (OpenToAnyone), asked by the transport before it publishes (API-CALLER-AT-TRANSPORT). A
// command no handler of the module answers is a wiring error: it panics.
func (m *Module) AnyoneMayAsk(command domain.Event) bool {
	name := domain.NameOf(command)
	for _, subscription := range m.Commands {
		if subscription.Channel != name || len(subscription.Handlers) == 0 {
			continue
		}
		for _, handler := range subscription.Handlers {
			if open, ok := handler.(opener); !ok || !open.anyoneMayAsk(command) {
				return false
			}
		}
		return true
	}
	panic(fmt.Sprintf("no handler for %s in module %s: list it in the context's wiring", name, m.Name))
}

// QueryOf finds a query handler by its type. A missing one is a wiring error: it panics.
func QueryOf[H any](m *Module) H {
	for _, candidate := range m.Queries {
		if found, ok := candidate.(H); ok {
			return found
		}
	}
	var zero H
	panic(fmt.Sprintf("missing query %T in module %s", zero, m.Name))
}
