package account

import kernel "clean-ddd/sharedkernel/domain"

// Registration is a domain service: it holds a business rule that no single aggregate can
// enforce on its own. "An email identifies at most one account" is a statement about the whole
// collection of accounts, so it needs the repository. It is still domain code: it depends on
// the port, not on any implementation, and it carries no application concern (no logging, no
// transaction, no event publishing).
type Registration struct {
	accounts Repository
}

func NewRegistration(accounts Repository) *Registration {
	return &Registration{accounts: accounts}
}

func (r *Registration) Register(props NewAccount) (*Account, error) {
	email, err := kernel.NewEmail(props.Email)
	if err != nil {
		return nil, err
	}
	existing, err := r.accounts.FindByEmail(email.Value())
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, AccountAlreadyExists(email.Value())
	}
	return Register(props)
}
