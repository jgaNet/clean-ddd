package application

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"clean-ddd/architecture/domain"
)

type WaveCommandEvent struct{ domain.CommandEvent }

type waveHandler struct{}

func (waveHandler) Execute(WaveCommandEvent, *ExecutionContext) (Nothing, error) {
	return Nothing{}, nil
}

type bowHandler struct{}

func (bowHandler) Execute(WaveCommandEvent, *ExecutionContext) (Nothing, error) {
	return Nothing{}, nil
}

type counter struct{}

func (counter) count() int { return 3 }

type countGreetings struct{ queries counter }

func (h *countGreetings) Execute(NoParams, *ExecutionContext) (int, error) {
	return h.queries.count(), nil
}

var (
	greet     = &greetHandler{}
	count     = &countGreetings{queries: counter{}}
	greetings = &Module{
		Name:     "Greetings",
		Commands: []Subscription{Command[GreetCommandEvent, string](greet), Command[WaveCommandEvent, Nothing](waveHandler{})},
		Queries:  []any{count},
	}
)

func TestFindsACommandHandlerByItsType(t *testing.T) {
	if found := CommandOf[*greetHandler](greetings); found != greet {
		t.Errorf("got %v, want the greet handler", found)
	}
}

func TestFindsAQueryHandlerByItsType(t *testing.T) {
	if found := QueryOf[*countGreetings](greetings); found != count {
		t.Errorf("got %v, want the count query", found)
	}
	if answer, err := Query[NoParams, int](count, NoParams{}, contextWithout()); err != nil || answer != 3 {
		t.Errorf("the query should answer 3, got (%d, %v)", answer, err)
	}
}

func panics(t *testing.T, fn func()) (message string) {
	t.Helper()
	defer func() {
		recovered := recover()
		if recovered == nil {
			t.Fatal("expected a panic")
		}
		message, _ = recovered.(string)
	}()
	fn()
	return ""
}

func TestNamesWhatIsMissing(t *testing.T) {
	message := panics(t, func() { CommandOf[bowHandler](greetings) })
	if !strings.Contains(message, "missing command handler") || !strings.Contains(message, "bowHandler") || !strings.Contains(message, "Greetings") {
		t.Errorf("message: got %q", message)
	}
	message = panics(t, func() { QueryOf[*greetHandler](greetings) })
	if !strings.Contains(message, "missing query") || !strings.Contains(message, "greetHandler") || !strings.Contains(message, "Greetings") {
		t.Errorf("message: got %q", message)
	}
}

// listingBus notes the channels subscribed, and fails to connect when told to.
type listingBus struct {
	subscribed []string
	connect    error
}

func (b *listingBus) Connect() error { return b.connect }
func (*listingBus) Publish(domain.Event, *ExecutionContext) *Operation {
	panic("not used")
}
func (*listingBus) Dispatch(*Operation) {}
func (b *listingBus) Subscribe(channel string, _ Subscriber) {
	b.subscribed = append(b.subscribed, channel)
}

func TestSubscribesEveryHandlerToItsEventName(t *testing.T) {
	bus := &listingBus{}
	if err := greetings.Start(bus); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if want := []string{"GreetCommandEvent", "WaveCommandEvent"}; !reflect.DeepEqual(bus.subscribed, want) {
		t.Errorf("subscribed: got %v, want %v", bus.subscribed, want)
	}
}

func TestSubscribesDomainEventsBeforeCommandsBeforeIntegrationEvents(t *testing.T) {
	module := &Module{
		Name:              "Ordered",
		Commands:          []Subscription{Command[WaveCommandEvent, Nothing](waveHandler{})},
		DomainEvents:      []Subscription{Reaction[WavedEvent](&onWaved{})},
		IntegrationEvents: []Subscription{{Channel: "SomethingIntegrationEvent", Handlers: []Subscriber{ignoring{}}}},
	}
	bus := &listingBus{}
	if err := module.Start(bus); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if want := []string{"WavedEvent", "WaveCommandEvent", "SomethingIntegrationEvent"}; !reflect.DeepEqual(bus.subscribed, want) {
		t.Errorf("subscribed: got %v, want %v", bus.subscribed, want)
	}
}

// ignoring is a subscriber that does nothing: a module lists it, the test counts it.
type ignoring struct{}

func (ignoring) Handle(*Operation) {}

func TestStartReportsABusThatCannotConnect(t *testing.T) {
	bus := &listingBus{connect: errors.New("no broker")}
	if err := greetings.Start(bus); err == nil || err.Error() != "no broker" {
		t.Errorf("Start: got %v, want the connection error", err)
	}
	if len(bus.subscribed) != 0 {
		t.Error("nothing should be subscribed on a bus that is not connected")
	}
}

func TestAnApplicationFindsItsModulesByName(t *testing.T) {
	bus := &listingBus{}
	app := NewApplication(bus).RegisterModule(greetings)
	if app.EventBus() != EventBus(bus) {
		t.Error("the application runs on the bus it was given")
	}
	if module, err := app.Module("Greetings"); err != nil || module != greetings {
		t.Errorf("Module: got (%v, %v)", module, err)
	}
	if _, err := app.Module("Nope"); err == nil {
		t.Error("an unknown module is an error")
	}
	if err := app.StartModules(); err != nil || len(bus.subscribed) != 2 {
		t.Errorf("StartModules should subscribe every module: %v, %v", err, bus.subscribed)
	}
}
