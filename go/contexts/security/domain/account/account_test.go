package account_test

import (
	"reflect"
	"testing"
	"time"

	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/security/domain/account"
	kernel "clean-ddd/sharedkernel/domain"
)

func aPendingAccount(t *testing.T) *account.Account {
	t.Helper()
	a, err := account.Register(account.NewAccount{Email: "alice@example.com", Role: kernel.RoleUser, PasswordHash: "h4sh", Activated: false})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	a.PullDomainEvents()
	return a
}

func refusalType(t *testing.T, err error) string {
	t.Helper()
	exception, ok := domain.Refusal(err)
	if !ok {
		t.Fatalf("expected a refusal, got %v", err)
	}
	return exception.Type
}

func TestRegistering(t *testing.T) {
	t.Run("opens a pending user account and records AccountCreated", func(t *testing.T) {
		a, err := account.Register(account.NewAccount{Email: "Alice@Example.com", Role: kernel.RoleUser, PasswordHash: "h4sh", Activated: false})
		if err != nil {
			t.Fatalf("register: %v", err)
		}
		if a.Email().Value() != "alice@example.com" {
			t.Errorf("email = %q", a.Email().Value())
		}
		if a.Status() != account.StatusPending {
			t.Errorf("status = %q", a.Status())
		}
		want := []domain.Event{account.AccountCreatedEvent{AccountID: a.ID().Value(), Email: "alice@example.com", Role: kernel.RoleUser, Status: account.StatusPending}}
		if got := a.PullDomainEvents(); !reflect.DeepEqual(got, want) {
			t.Errorf("events = %#v, want %#v", got, want)
		}
	})

	t.Run("opens an administrator account that is active at once", func(t *testing.T) {
		a, err := account.Register(account.NewAccount{Email: "root@example.com", Role: kernel.RoleAdmin, PasswordHash: "h4sh", Activated: true})
		if err != nil {
			t.Fatalf("register: %v", err)
		}
		if a.Status() != account.StatusActive {
			t.Errorf("status = %q", a.Status())
		}
	})

	t.Run("refuses a malformed email and empty credentials", func(t *testing.T) {
		_, malformed := account.Register(account.NewAccount{Email: "not-an-email", Role: kernel.RoleUser, PasswordHash: "h", Activated: false})
		_, empty := account.Register(account.NewAccount{Email: "alice@example.com", Role: kernel.RoleUser, PasswordHash: "", Activated: false})
		if typ := refusalType(t, malformed); typ != "InvalidEmailFormat" {
			t.Errorf("malformed: type = %q", typ)
		}
		if typ := refusalType(t, empty); typ != "InvalidCredentials" {
			t.Errorf("empty: type = %q", typ)
		}
	})
}

func TestValidating(t *testing.T) {
	t.Run("activates a pending account and records AccountValidated", func(t *testing.T) {
		a := aPendingAccount(t)
		if err := a.Validate(); err != nil {
			t.Fatalf("validate: %v", err)
		}
		if a.Status() != account.StatusActive {
			t.Errorf("status = %q", a.Status())
		}
		want := []domain.Event{account.AccountValidatedEvent{AccountID: a.ID().Value(), Email: "alice@example.com"}}
		if got := a.PullDomainEvents(); !reflect.DeepEqual(got, want) {
			t.Errorf("events = %#v, want %#v", got, want)
		}
	})

	t.Run("cannot validate twice", func(t *testing.T) {
		a := aPendingAccount(t)
		_ = a.Validate()
		if typ := refusalType(t, a.Validate()); typ != "AccountAlreadyActive" {
			t.Errorf("type = %q", typ)
		}
	})
}

func TestAuthenticating(t *testing.T) {
	t.Run("records the sign-in of an active account", func(t *testing.T) {
		a := aPendingAccount(t)
		_ = a.Validate()
		a.PullDomainEvents()
		now := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)

		if err := a.Authenticate(now); err != nil {
			t.Fatalf("authenticate: %v", err)
		}
		if at := a.LastAuthenticatedAt(); at == nil || !at.Equal(now) {
			t.Errorf("lastAuthenticatedAt = %v", at)
		}
		want := []domain.Event{account.AccountAuthenticatedEvent{AccountID: a.ID().Value(), At: now}}
		if got := a.PullDomainEvents(); !reflect.DeepEqual(got, want) {
			t.Errorf("events = %#v, want %#v", got, want)
		}
	})

	t.Run("refuses a pending account", func(t *testing.T) {
		a := aPendingAccount(t)
		if typ := refusalType(t, a.Authenticate(time.Time{})); typ != "InactiveAccount" {
			t.Errorf("type = %q", typ)
		}
		if a.LastAuthenticatedAt() != nil {
			t.Errorf("lastAuthenticatedAt = %v, want nil", a.LastAuthenticatedAt())
		}
	})
}

func TestGivesBackAnEqualAccountAfterTheSnapshotRoundTripWithoutEvents(t *testing.T) {
	a := aPendingAccount(t)
	_ = a.Validate()
	_ = a.Authenticate(time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC))

	rebuilt := account.FromSnapshot(a.ToSnapshot())

	if !rebuilt.Equals(a.Entity) {
		t.Error("rebuilt account is not the same entity")
	}
	if !reflect.DeepEqual(rebuilt.ToSnapshot(), a.ToSnapshot()) {
		t.Errorf("snapshot = %#v, want %#v", rebuilt.ToSnapshot(), a.ToSnapshot())
	}
	if events := rebuilt.PullDomainEvents(); len(events) != 0 {
		t.Errorf("events = %#v, want none", events)
	}
}
