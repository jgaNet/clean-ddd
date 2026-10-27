package auth

// TokenTypeValidation is what a token is for besides a session for a role: a validation link.
// A Claims.SubjectType is either a role name or this.
const TokenTypeValidation = "VALIDATION"
