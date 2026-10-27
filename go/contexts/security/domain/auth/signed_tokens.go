package auth

// Claims is what a signed token carries: a subject, and what the token is for.
type Claims struct {
	SubjectID string
	// SubjectType is a role (a session) or TokenTypeValidation (a validation link).
	SubjectType string
}

// SignedTokens are signed, expiring tokens that carry a subject and what the token is for. The
// domain says what a token must carry and that it cannot be forged; how it is signed (JWT,
// HS256) is the infrastructure's choice.
type SignedTokens interface {
	Sign(claims Claims) (string, error)
	// Verify answers the claims of a token whose signature and expiry check out, false otherwise.
	Verify(token string) (*Claims, bool)
}
