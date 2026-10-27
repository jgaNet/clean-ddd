package domain

// Exception describes a broken rule: which context refused (Service), which rule (Type, a stable
// identifier a client can switch on), in words (Message), with what details (Context). It is a
// value returned as an error, never panicked: there is no stack to capture for an expected
// outcome (ADR 1). Each context declares its own constructors next to its aggregate
// (contexts/notes/domain/note/exceptions.go); the generic ones (NotFound, NotAllowed,
// ConcurrencyConflict, Unknown) are below.
type Exception struct {
	Service string
	Type    string
	Message string
	Context map[string]any
}

// NewException builds a refusal; a context's exceptions file wraps it per rule.
func NewException(service, typ, message string, context map[string]any) *Exception {
	if service == "" {
		service = "unknown"
	}
	if context == nil {
		context = map[string]any{}
	}
	return &Exception{Service: service, Type: typ, Message: message, Context: context}
}

// Error makes an Exception an error value: what a behaviour returns and a handler passes on.
func (e *Exception) Error() string { return e.Message }

// The refusals every context may have to say, with the types a controller maps to a status:
// not found (404), not allowed (403), a concurrency conflict and anything unknown (400).
const (
	TypeNotFound            = "NotFound"
	TypeNotAllowed          = "NotAllowed"
	TypeConcurrencyConflict = "ConcurrencyConflict"
	TypeUnknown             = "Unknown"
)

// Unknown is a failure nobody expected: a stray panic turned into a failed operation by the base handler.
func Unknown(message string, context map[string]any) *Exception {
	return NewException("unknown", TypeUnknown, message, context)
}

func NotFound(service, message string, context map[string]any) *Exception {
	return NewException(service, TypeNotFound, message, context)
}

func NotAllowed(service, message string, context map[string]any) *Exception {
	return NewException(service, TypeNotAllowed, message, context)
}

// ConcurrencyConflict: the aggregate changed since it was read; the caller re-reads and decides again (ADR 8).
func ConcurrencyConflict(service, message string, context map[string]any) *Exception {
	return NewException(service, TypeConcurrencyConflict, message, context)
}
