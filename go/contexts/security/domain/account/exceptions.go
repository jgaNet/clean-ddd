package account

import "clean-ddd/architecture/domain"

// Domain exceptions of the Account aggregate: a broken business rule, in business words. They
// are values returned as errors, never panicked. One file per aggregate; the Type is the
// PascalCase name of the rule, as a client reads it on the operation.

const Service = "Security"

func exception(typ, message string, context map[string]any) *domain.Exception {
	return domain.NewException(Service, typ, message, context)
}

func AccountAlreadyExists(email string) *domain.Exception {
	return exception("AccountAlreadyExists", "An account already exists for this email", map[string]any{"email": email})
}

func AccountNotFound(accountID string) *domain.Exception {
	return exception("AccountNotFound", "Account not found", map[string]any{"accountId": accountID})
}

func AccountAlreadyActive(accountID string) *domain.Exception {
	return exception("AccountAlreadyActive", "This account is already active", map[string]any{"accountId": accountID})
}

func InactiveAccount(accountID string) *domain.Exception {
	return exception("InactiveAccount", "This account is not active", map[string]any{"accountId": accountID})
}

// InvalidCredentials is deliberately vague: it does not say whether the email or the password was wrong.
func InvalidCredentials() *domain.Exception {
	return exception("InvalidCredentials", "Invalid credentials", nil)
}
