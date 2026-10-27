// Package security is the wiring of the Security context: the handlers bound to their
// adapters and listed in a Module (ARCH-MODULES-DATA), plus what the context exposes to the
// composition root and the other contexts: the account queries (Notes' directory is an
// adapter over them), the token service, the authentication middleware, and the seed of the
// administrator.
package security

import (
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/security/application/commands"
	"clean-ddd/contexts/security/application/events"
	"clean-ddd/contexts/security/application/queries"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	securityinfra "clean-ddd/contexts/security/infrastructure"
	"clean-ddd/contexts/security/presentation"
	kernel "clean-ddd/sharedkernel/domain"
)

// AccountStore is the context's store, which the composition root hands to the unit of work.
type AccountStore = infrastructure.InMemoryDataSource[account.Snapshot]

func NewAccountStore() *AccountStore {
	return infrastructure.NewInMemoryDataSource[account.Snapshot]()
}

// Settings is what the context needs from the configuration.
type Settings struct {
	JWTSecret    string
	JWTExpiresIn time.Duration
	BcryptCost   int
}

// Wiring is the module, and what the composition root needs beside it.
type Wiring struct {
	Module         *application.Module
	AccountQueries account.Queries
	SignedTokens   auth.SignedTokens
	Authentication *presentation.Authentication
	registerAdmin  *commands.RegisterAdminHandler
}

// LocalModule is the Security wiring for the local environment: write side and read side
// share the same store here; a real deployment may split them.
func LocalModule(store *AccountStore, settings Settings) *Wiring {
	repository := securityinfra.NewInMemoryAccountRepository(store)
	accountQueries := securityinfra.NewInMemoryAccountQueries(store)
	signedTokens := securityinfra.NewJwtSignedTokens(settings.JWTSecret, settings.JWTExpiresIn)
	registration := account.NewRegistration(repository)
	hasher := securityinfra.NewBcryptPasswordHasher(settings.BcryptCost)

	return &Wiring{
		Module: &application.Module{
			Name: "Security",
			Commands: []application.Subscription{
				application.Command(commands.NewSignUpHandler(repository, registration, hasher)),
				application.Command(commands.NewLoginHandler(repository, hasher, signedTokens)),
				application.Command(commands.NewValidateAccountHandler(repository, signedTokens)),
			},
			Queries: []any{
				queries.NewGetAccountHandler(accountQueries),
			},
			DomainEvents: []application.Subscription{
				application.Reaction(events.NewAccountCreatedHandler(signedTokens)),
				application.Reaction(events.AccountValidatedHandler{}),
			},
		},
		AccountQueries: accountQueries,
		SignedTokens:   signedTokens,
		Authentication: presentation.NewAuthentication(accountQueries, signedTokens),
		registerAdmin:  commands.NewRegisterAdminHandler(repository, registration, hasher),
	}
}

// RegisterAdmin seeds the administrator at startup. It runs the command on behalf of the
// system, on the application's bus: the seed is an operation like any other, recorded by the
// Tracker. The id of the account in return.
func (w *Wiring) RegisterAdmin(email, password string, bus application.EventBus) (string, error) {
	ctx := application.NewExecutionContext(application.Options{
		TraceID:  domain.GenerateID().Value(),
		EventBus: bus,
		Auth:     application.Auth{SubjectID: "system", Role: string(kernel.RoleAdmin)},
	})
	return application.Run(w.registerAdmin, commands.RegisterAdminCommandEvent{Email: email, Password: password}, ctx)
}
