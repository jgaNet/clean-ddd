package infrastructure

import (
	"clean-ddd/contexts/security/domain/account"
)

// SecurityAccountDirectory is Notes' view of Security's accounts: an adapter over Security's
// *read model*, never its aggregate or repository. Only the Notes infrastructure knows the two
// contexts are in the same process; the domain and application layers of Notes see
// AccountDirectory alone. In separate deployments this file would call Security's API and
// nothing above it would change.
type SecurityAccountDirectory struct {
	accounts account.Queries
}

func NewSecurityAccountDirectory(accounts account.Queries) *SecurityAccountDirectory {
	return &SecurityAccountDirectory{accounts: accounts}
}

func (d *SecurityAccountDirectory) Exists(accountID string) (bool, error) {
	detail, err := d.accounts.FindByID(accountID)
	if err != nil {
		return false, err
	}
	return detail != nil && detail.Status == account.StatusActive, nil
}
