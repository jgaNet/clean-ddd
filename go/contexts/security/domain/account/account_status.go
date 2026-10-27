package account

// Status is the lifecycle of an account. A self-registered account starts PENDING until its
// email is validated; an account registered by an administrator starts ACTIVE. Only an ACTIVE
// account can authenticate. The transitions are enforced by the Account aggregate.
type Status string

const (
	StatusPending Status = "PENDING"
	StatusActive  Status = "ACTIVE"
)

// ParseStatus is the type guard for a status read from storage.
func ParseStatus(value string) (Status, bool) {
	switch Status(value) {
	case StatusPending, StatusActive:
		return Status(value), true
	}
	return "", false
}
