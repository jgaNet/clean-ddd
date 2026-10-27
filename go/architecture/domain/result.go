package domain

import (
	"errors"
	"fmt"
)

// A result is how an operation says whether it worked. An expected failure (a refused command,
// an invalid value) is a value the caller must look at, not an exception it may forget to
// catch (ADR 1). In Go that value is the error of a (T, error) pair, and the refusal it carries
// is an *Exception:
//
//	func (n *Note) Edit(editor domain.ID, title, content string) error {
//	    if err := n.ensureOwner(editor); err != nil {
//	        return err                     // a refusal is returned as is
//	    }
//	    ...
//	    return nil                         // the behaviour's "ok"
//	}
//
// A constructor returns (Note, error); a handler returns (R, error) and passes a refusal on with
// `if err != nil { return zero, err }`. A panic is reserved for corrupted state and programming
// errors; the base handlers turn a stray one into a failed operation (see Refusal).

// Refusal reads the Exception an error carries, if it is one.
func Refusal(err error) (*Exception, bool) {
	var exception *Exception
	if errors.As(err, &exception) {
		return exception, true
	}
	return nil, false
}

// AsException is the error as an Exception: itself when it is one, an Unknown one otherwise,
// which is how the base handlers record a failure nobody declared.
func AsException(err error) *Exception {
	if exception, ok := Refusal(err); ok {
		return exception
	}
	return Unknown(err.Error(), nil)
}

// Recovered turns a recovered panic value into an error, for the base handlers' safety net.
func Recovered(value any) error {
	if err, ok := value.(error); ok {
		return err
	}
	return fmt.Errorf("%v", value)
}

// IsNotFound and the others say which kind of refusal an error is, for a controller's status.
func IsNotFound(err error) bool { return isType(err, TypeNotFound) }

func IsNotAllowed(err error) bool { return isType(err, TypeNotAllowed) }

func IsConcurrencyConflict(err error) bool { return isType(err, TypeConcurrencyConflict) }

func isType(err error, typ string) bool {
	exception, ok := Refusal(err)
	return ok && exception.Type == typ
}
