package domain

// Role is one of the roles every context agrees on. A value the outside sends as a string
// reaches the domain as a string; ParseRole is the type guard that turns it into a Role, never
// a controller.
type Role string

const (
	RoleAdmin Role = "ADMIN"
	RoleUser  Role = "USER"
	RoleGuest Role = "GUEST"
)

// ParseRole is the type guard: a string that names a role, or false.
func ParseRole(value string) (Role, bool) {
	switch Role(value) {
	case RoleAdmin, RoleUser, RoleGuest:
		return Role(value), true
	}
	return "", false
}
