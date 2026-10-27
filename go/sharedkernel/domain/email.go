package domain

import (
	"regexp"
	"strings"

	"clean-ddd/architecture/domain"
)

// Email is a value object: once you hold one you know it is well-formed. Like every value
// object in this project it is built through NewEmail, which returns an error instead of
// panicking, so an invalid input is an ordinary refusal the caller handles.
type Email struct {
	value string
}

const EmailMaxLength = 254

var wellFormed = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)

func InvalidEmailFormat(raw string) *domain.Exception {
	return domain.NewException("unknown", "InvalidEmailFormat", "Invalid email format", map[string]any{"email": raw})
}

// NewEmail trims, lower-cases, and refuses what is not local@domain.tld or is too long.
func NewEmail(raw string) (Email, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if len(email) > EmailMaxLength || !wellFormed.MatchString(email) {
		return Email{}, InvalidEmailFormat(raw)
	}
	return Email{value: email}, nil
}

func (e Email) Value() string { return e.value }

// Username is what is before the @.
func (e Email) Username() string {
	return strings.SplitN(e.value, "@", 2)[0]
}
