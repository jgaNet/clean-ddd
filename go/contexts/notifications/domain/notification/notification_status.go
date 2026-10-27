package notification

// Status is the lifecycle of a notification: PENDING until a channel accepts it, then SENT (and
// READ once the recipient opens it), or FAILED when every channel of the strategy was tried.
// The Notification aggregate owns the transitions, not this type.
type Status string

const (
	StatusPending Status = "PENDING"
	StatusSent    Status = "SENT"
	StatusRead    Status = "READ"
	StatusFailed  Status = "FAILED"
)

// ParseStatus is the type guard for a status read from storage.
func ParseStatus(value string) (Status, bool) {
	switch Status(value) {
	case StatusPending, StatusSent, StatusRead, StatusFailed:
		return Status(value), true
	}
	return "", false
}
