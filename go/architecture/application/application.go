package application

import "fmt"

// Application registers modules and starts them against one event bus. The composition root
// builds one, registers the modules, starts them, seeds, and only then listens; the transport
// (net/http) is the composition root's, not this type's.
type Application struct {
	eventBus EventBus
	modules  []*Module
}

func NewApplication(eventBus EventBus) *Application {
	return &Application{eventBus: eventBus}
}

func (a *Application) EventBus() EventBus { return a.eventBus }

func (a *Application) RegisterModule(module *Module) *Application {
	a.modules = append(a.modules, module)
	return a
}

func (a *Application) Module(name string) (*Module, error) {
	for _, module := range a.modules {
		if module.Name == name {
			return module, nil
		}
	}
	return nil, fmt.Errorf("module %s not found", name)
}

// StartModules subscribes every module's handlers to the bus; nothing is served before they listen.
func (a *Application) StartModules() error {
	for _, module := range a.modules {
		if err := module.Start(a.eventBus); err != nil {
			return err
		}
	}
	return nil
}
