package account_test

import (
	"strings"
	"testing"

	"clean-ddd/contexts/security/domain/account"
	kernel "clean-ddd/sharedkernel/domain"
)

// fakeAccountRepository: a domain test needs only the port; a map is enough of a repository.
type fakeAccountRepository struct {
	accounts map[string]*account.Account
}

func newFakeAccountRepository() *fakeAccountRepository {
	return &fakeAccountRepository{accounts: map[string]*account.Account{}}
}

func (r *fakeAccountRepository) FindByID(id string) (*account.Account, error) {
	return r.accounts[id], nil
}

func (r *fakeAccountRepository) FindByEmail(email string) (*account.Account, error) {
	for _, a := range r.accounts {
		if a.Email().Value() == strings.ToLower(email) {
			return a, nil
		}
	}
	return nil, nil
}

func (r *fakeAccountRepository) Save(a *account.Account) error {
	r.accounts[a.ID().Value()] = a
	return nil
}

var alice = account.NewAccount{Email: "alice@example.com", Role: kernel.RoleUser, PasswordHash: "h4sh", Activated: false}

func TestRegistersAnAccountForAFreeEmail(t *testing.T) {
	a, err := account.NewRegistration(newFakeAccountRepository()).Register(alice)
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if a.Email().Value() != "alice@example.com" {
		t.Errorf("email = %q", a.Email().Value())
	}
}

func TestRefusesAnEmailThatAlreadyIdentifiesAnAccountWhateverItsCase(t *testing.T) {
	repository := newFakeAccountRepository()
	registration := account.NewRegistration(repository)
	first, err := registration.Register(alice)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	_ = repository.Save(first)

	upper := alice
	upper.Email = "ALICE@example.com"
	_, second := registration.Register(upper)
	if typ := refusalType(t, second); typ != "AccountAlreadyExists" {
		t.Errorf("type = %q", typ)
	}
}
