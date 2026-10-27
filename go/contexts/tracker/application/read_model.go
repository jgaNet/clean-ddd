package application

import (
	"time"

	"clean-ddd/architecture/application"
)

// Service names the context in every refusal it makes.
const Service = "Tracker"

// OperationError is a refusal in client words: the rule's type and its message, nothing of
// the context the exception carried.
type OperationError struct {
	Type    string
	Message string
}

// Record is one operation as a client may see it. A read model, shaped for the question "how
// did it go?" and nothing else.
//
// No payload: a command may carry a secret (the password at sign-up), and a client who holds
// the operation id already knows what it asked for. Status, result and error are what the
// record is for.
type Record struct {
	ID string
	// Name is the public name of the command or event, e.g. "CreateNote": its intent, without
	// the suffix of its kind.
	Name    string
	Status  application.Status
	TraceID string
	// SubjectID is the account that asked, empty when the request was anonymous.
	SubjectID string
	// Result is what the handler returned on success.
	Result     any
	Error      *OperationError
	CreatedAt  time.Time
	FinishedAt *time.Time
}
