package note

// Status is the lifecycle of a note. A note starts ACTIVE, can be ARCHIVED, and can come back.
// The transitions themselves are enforced by the Note aggregate, not by this type.
type Status string

const (
	StatusActive   Status = "ACTIVE"
	StatusArchived Status = "ARCHIVED"
)

// ParseStatus is the type guard for a status read from storage.
func ParseStatus(value string) (Status, bool) {
	switch Status(value) {
	case StatusActive, StatusArchived:
		return Status(value), true
	}
	return "", false
}
