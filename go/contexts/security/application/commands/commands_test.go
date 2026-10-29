package commands_test

// The handlers of the Account aggregate, through Execute; RegisterAdmin's rule is in Guard,
// which only the template runs, so its cases go through a subscription and an operation, as
// the bus would. The password hasher is a reversible fake, so the tests can read what was
// "hashed".

import (
	"fmt"
	"reflect"
	"testing"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	archinfra "clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/security/application/commands"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	"clean-ddd/contexts/security/infrastructure"
	kernel "clean-ddd/sharedkernel/domain"
)

type fakeHasher struct{}

func (fakeHasher) Hash(plain string) (string, error) { return fmt.Sprintf("hashed(%s)", plain), nil }
func (fakeHasher) Compare(plain, hash string) (bool, error) {
	return hash == fmt.Sprintf("hashed(%s)", plain), nil
}

// recordingBus is an EventBus that keeps what was published and dispatches nothing.
type recordingBus struct {
	published []domain.Event
}

func (b *recordingBus) Connect() error { return nil }
func (b *recordingBus) Publish(event domain.Event, ctx *application.ExecutionContext) *application.Operation {
	b.published = append(b.published, event)
	return application.NewOperation(event, ctx)
}

func (b *recordingBus) PublishWithID(event domain.Event, ctx *application.ExecutionContext, _ string) *application.Operation {
	return b.Publish(event, ctx)
}
func (b *recordingBus) Dispatch(*application.Operation)          {}
func (b *recordingBus) Subscribe(string, application.Subscriber) {}

type fixture struct {
	store        *archinfra.InMemoryDataSource[account.Snapshot]
	repository   *infrastructure.InMemoryAccountRepository
	registration *account.Registration
	hasher       fakeHasher
	tokens       *infrastructure.JwtSignedTokens
	bus          *recordingBus
}

func newFixture() *fixture {
	store := archinfra.NewInMemoryDataSource[account.Snapshot]()
	repository := infrastructure.NewInMemoryAccountRepository(store)
	return &fixture{
		store:        store,
		repository:   repository,
		registration: account.NewRegistration(repository),
		tokens:       infrastructure.NewJwtSignedTokens("test-secret-of-at-least-thirty-two-bytes", time.Hour),
		bus:          &recordingBus{},
	}
}

func (f *fixture) contextFor(role kernel.Role, subjectID string) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{
		TraceID: "trace", EventBus: f.bus, Auth: application.Auth{SubjectID: subjectID, Role: string(role)},
	})
}

func (f *fixture) anAccount(t *testing.T, email string, activated bool) string {
	t.Helper()
	a, err := account.Register(account.NewAccount{Email: email, Role: kernel.RoleUser, PasswordHash: "hashed(secret)", Activated: activated})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if err := f.repository.Save(a); err != nil {
		t.Fatalf("save: %v", err)
	}
	return a.ID().Value()
}

func (f *fixture) stored(t *testing.T, id string) account.Snapshot {
	t.Helper()
	snapshot, ok := f.store.Get(id)
	if !ok {
		t.Fatalf("no account %s in the store", id)
	}
	return snapshot
}

func refusalType(t *testing.T, err error) string {
	t.Helper()
	exception, ok := domain.Refusal(err)
	if !ok {
		t.Fatalf("expected a refusal, got %v", err)
	}
	return exception.Type
}

func TestSignUp(t *testing.T) {
	t.Run("saves a pending user account with a hashed password and publishes AccountCreated", func(t *testing.T) {
		f := newFixture()
		handler := commands.NewSignUpHandler(f.repository, f.registration, f.hasher)
		accountID, err := handler.Execute(commands.SignUpCommandEvent{Email: "user@user.fr", Password: "secret"}, f.contextFor(kernel.RoleGuest, ""))
		if err != nil {
			t.Fatalf("sign up: %v", err)
		}
		want := account.Snapshot{
			ID:          accountID,
			Email:       "user@user.fr",
			Role:        kernel.RoleUser,
			Credentials: account.CredentialsSnapshot{Type: "password", Hash: "hashed(secret)"},
			Status:      account.StatusPending,
			Version:     1,
		}
		if got := f.stored(t, accountID); !reflect.DeepEqual(got, want) {
			t.Errorf("stored = %#v, want %#v", got, want)
		}
		wantEvents := []domain.Event{account.AccountCreatedEvent{AccountID: accountID, Email: "user@user.fr", Role: kernel.RoleUser, Status: account.StatusPending}}
		if !reflect.DeepEqual(f.bus.published, wantEvents) {
			t.Errorf("published = %#v, want %#v", f.bus.published, wantEvents)
		}
	})

	t.Run("refuses a malformed email and saves nothing", func(t *testing.T) {
		f := newFixture()
		handler := commands.NewSignUpHandler(f.repository, f.registration, f.hasher)
		_, err := handler.Execute(commands.SignUpCommandEvent{Email: "simple-nickname", Password: "secret"}, f.contextFor(kernel.RoleGuest, ""))
		if typ := refusalType(t, err); typ != "InvalidEmailFormat" {
			t.Errorf("type = %q", typ)
		}
		if len(f.store.All()) != 0 {
			t.Errorf("store = %#v, want empty", f.store.All())
		}
		if len(f.bus.published) != 0 {
			t.Errorf("published = %#v, want none", f.bus.published)
		}
	})

	t.Run("refuses an email that already has an account", func(t *testing.T) {
		f := newFixture()
		handler := commands.NewSignUpHandler(f.repository, f.registration, f.hasher)
		if _, err := handler.Execute(commands.SignUpCommandEvent{Email: "user@user.fr", Password: "secret"}, f.contextFor(kernel.RoleGuest, "")); err != nil {
			t.Fatalf("first sign up: %v", err)
		}
		_, err := handler.Execute(commands.SignUpCommandEvent{Email: "user@user.fr", Password: "other"}, f.contextFor(kernel.RoleGuest, ""))
		if typ := refusalType(t, err); typ != "AccountAlreadyExists" {
			t.Errorf("type = %q", typ)
		}
		if len(f.store.All()) != 1 {
			t.Errorf("store holds %d accounts, want 1", len(f.store.All()))
		}
	})
}

func TestLogin(t *testing.T) {
	t.Run("signs in an active account with the right password and publishes AccountAuthenticated", func(t *testing.T) {
		f := newFixture()
		aliceID := f.anAccount(t, "alice@example.com", true)
		handler := commands.NewLoginHandler(f.repository, f.hasher, f.tokens)

		result, err := handler.Execute(commands.LoginCommandEvent{Identifier: "alice@example.com", Password: "secret"}, f.contextFor(kernel.RoleGuest, ""))
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		claims, ok := f.tokens.Verify(result.Token)
		if want := (auth.Claims{SubjectID: aliceID, SubjectType: "USER"}); !ok || *claims != want {
			t.Errorf("claims = %v, %v; want %v", claims, ok, want)
		}
		if f.stored(t, aliceID).LastAuthenticatedAt == nil {
			t.Error("lastAuthenticatedAt was not stored")
		}
		if len(f.bus.published) != 1 {
			t.Fatalf("published = %#v, want one event", f.bus.published)
		}
		if _, ok := f.bus.published[0].(account.AccountAuthenticatedEvent); !ok {
			t.Errorf("published %T, want AccountAuthenticatedEvent", f.bus.published[0])
		}
	})

	t.Run("refuses an unknown email and a wrong password with the same vague answer", func(t *testing.T) {
		f := newFixture()
		f.anAccount(t, "alice@example.com", true)
		handler := commands.NewLoginHandler(f.repository, f.hasher, f.tokens)

		_, unknown := handler.Execute(commands.LoginCommandEvent{Identifier: "nobody@example.com", Password: "secret"}, f.contextFor(kernel.RoleGuest, ""))
		_, wrong := handler.Execute(commands.LoginCommandEvent{Identifier: "alice@example.com", Password: "nope"}, f.contextFor(kernel.RoleGuest, ""))

		if typ := refusalType(t, unknown); typ != "InvalidCredentials" {
			t.Errorf("unknown: type = %q", typ)
		}
		if !reflect.DeepEqual(unknown, wrong) {
			t.Errorf("unknown = %#v, wrong = %#v; want the same answer", unknown, wrong)
		}
		if len(f.bus.published) != 0 {
			t.Errorf("published = %#v, want none", f.bus.published)
		}
	})

	t.Run("refuses a pending account even with the right password", func(t *testing.T) {
		f := newFixture()
		f.anAccount(t, "pending@example.com", false)
		handler := commands.NewLoginHandler(f.repository, f.hasher, f.tokens)

		_, err := handler.Execute(commands.LoginCommandEvent{Identifier: "pending@example.com", Password: "secret"}, f.contextFor(kernel.RoleGuest, ""))
		if typ := refusalType(t, err); typ != "InactiveAccount" {
			t.Errorf("type = %q", typ)
		}
	})
}

func TestValidateAccount(t *testing.T) {
	t.Run("validates with the validation token emailed at sign-up, whoever presents it", func(t *testing.T) {
		f := newFixture()
		pendingID := f.anAccount(t, "eve@example.com", false)
		token, err := f.tokens.Sign(auth.Claims{SubjectID: pendingID, SubjectType: auth.TokenTypeValidation})
		if err != nil {
			t.Fatalf("sign: %v", err)
		}

		_, err = commands.NewValidateAccountHandler(f.repository, f.tokens).Execute(
			commands.ValidateAccountCommandEvent{ValidationToken: token}, f.contextFor(kernel.RoleGuest, ""))
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if status := f.stored(t, pendingID).Status; status != account.StatusActive {
			t.Errorf("status = %q", status)
		}
	})

	t.Run("validates by id for an administrator", func(t *testing.T) {
		f := newFixture()
		pendingID := f.anAccount(t, "eve@example.com", false)

		_, err := commands.NewValidateAccountHandler(f.repository, f.tokens).Execute(
			commands.ValidateAccountCommandEvent{AccountID: pendingID}, f.contextFor(kernel.RoleAdmin, "root"))
		if err != nil {
			t.Fatalf("validate: %v", err)
		}
		if status := f.stored(t, pendingID).Status; status != account.StatusActive {
			t.Errorf("status = %q", status)
		}
	})

	t.Run("refuses validation by id from anyone else, whatever the payload says", func(t *testing.T) {
		f := newFixture()
		pendingID := f.anAccount(t, "eve@example.com", false)
		handler := commands.NewValidateAccountHandler(f.repository, f.tokens)

		for _, ctx := range []*application.ExecutionContext{f.contextFor(kernel.RoleGuest, ""), f.contextFor(kernel.RoleUser, "someone")} {
			_, err := handler.Execute(commands.ValidateAccountCommandEvent{AccountID: pendingID}, ctx)
			if typ := refusalType(t, err); typ != "NotAllowed" {
				t.Errorf("type = %q", typ)
			}
		}
		if status := f.stored(t, pendingID).Status; status != account.StatusPending {
			t.Errorf("status = %q", status)
		}
	})

	t.Run("refuses a login token presented as a validation token", func(t *testing.T) {
		f := newFixture()
		pendingID := f.anAccount(t, "eve@example.com", false)
		loginToken, err := f.tokens.Sign(auth.Claims{SubjectID: pendingID, SubjectType: string(kernel.RoleUser)})
		if err != nil {
			t.Fatalf("sign: %v", err)
		}

		_, err = commands.NewValidateAccountHandler(f.repository, f.tokens).Execute(
			commands.ValidateAccountCommandEvent{ValidationToken: loginToken}, f.contextFor(kernel.RoleGuest, ""))
		if typ := refusalType(t, err); typ != "NotAllowed" {
			t.Errorf("type = %q", typ)
		}
		if status := f.stored(t, pendingID).Status; status != account.StatusPending {
			t.Errorf("status = %q", status)
		}
	})
}

// The rule of RegisterAdmin is in Guard, which only the template runs: through a subscription
// and an operation, as the bus would.
func registerAdmin(f *fixture, role kernel.Role) *application.Operation {
	handler := commands.NewRegisterAdminHandler(f.repository, f.registration, f.hasher)
	command := commands.RegisterAdminCommandEvent{Email: "root@example.com", Password: "secret"}
	operation := application.NewOperation(command, f.contextFor(role, "caller"))
	application.Command(handler).Handlers[0].Handle(operation)
	return operation
}

func TestRegisterAdmin(t *testing.T) {
	t.Run("lets an administrator open an account that is active at once", func(t *testing.T) {
		f := newFixture()
		operation := registerAdmin(f, kernel.RoleAdmin)

		if operation.Status != application.StatusSuccess {
			t.Fatalf("status = %q, error = %v", operation.Status, operation.Error)
		}
		accountID, ok := operation.Result.(string)
		if !ok {
			t.Fatalf("result = %#v, want an id", operation.Result)
		}
		stored := f.stored(t, accountID)
		if stored.Role != kernel.RoleAdmin || stored.Status != account.StatusActive {
			t.Errorf("stored role, status = %q, %q", stored.Role, stored.Status)
		}
	})

	t.Run("refuses anyone else before touching the store", func(t *testing.T) {
		f := newFixture()
		operation := registerAdmin(f, kernel.RoleUser)

		if operation.Status != application.StatusError {
			t.Fatalf("status = %q", operation.Status)
		}
		if operation.Error == nil || operation.Error.Type != "NotAllowed" {
			t.Errorf("error = %#v", operation.Error)
		}
		if len(f.store.All()) != 0 {
			t.Errorf("store = %#v, want empty", f.store.All())
		}
	})
}
