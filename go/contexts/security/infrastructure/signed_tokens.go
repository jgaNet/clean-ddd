package infrastructure

import (
	"time"

	"github.com/golang-jwt/jwt/v5"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/security/domain/auth"
)

// JwtSignedTokens is the SignedTokens port as HS256 JSON Web Tokens signed with a shared
// secret. Verify answers false for a bad signature, a tampered payload or an expired token.
// The claim names (subjectId, subjectType, iat, exp) are the ones every server of the
// reference writes, so a token from one looks the same to the others (API-ONE-SURFACE). When a
// token is issued, when it expires and whether it has, is the application's clock
// (DOMAIN-ONE-CLOCK).
type JwtSignedTokens struct {
	secret    []byte
	expiresIn time.Duration
	clock     application.Clock
}

const Algorithm = "HS256"

func NewJwtSignedTokens(secret string, expiresIn time.Duration, clock application.Clock) *JwtSignedTokens {
	return &JwtSignedTokens{secret: []byte(secret), expiresIn: expiresIn, clock: clock}
}

func (t *JwtSignedTokens) Sign(claims auth.Claims) (string, error) {
	now := t.clock().UTC()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"subjectId":   claims.SubjectID,
		"subjectType": claims.SubjectType,
		"iat":         jwt.NewNumericDate(now),
		"exp":         jwt.NewNumericDate(now.Add(t.expiresIn)),
	})
	return token.SignedString(t.secret)
}

func (t *JwtSignedTokens) Verify(token string) (*auth.Claims, bool) {
	parsed, err := jwt.Parse(token, func(*jwt.Token) (any, error) { return t.secret, nil },
		jwt.WithValidMethods([]string{Algorithm}), jwt.WithExpirationRequired(), jwt.WithTimeFunc(t.clock))
	if err != nil || !parsed.Valid {
		return nil, false
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, false
	}
	subjectID, idOK := claims["subjectId"].(string)
	subjectType, typeOK := claims["subjectType"].(string)
	if !idOK || !typeOK {
		return nil, false
	}
	return &auth.Claims{SubjectID: subjectID, SubjectType: subjectType}, true
}
