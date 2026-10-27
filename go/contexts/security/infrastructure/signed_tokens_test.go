package infrastructure_test

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"clean-ddd/contexts/security/domain/auth"
	"clean-ddd/contexts/security/infrastructure"
)

const secret = "test-secret-of-at-least-thirty-two-bytes"

var (
	service = infrastructure.NewJwtSignedTokens(secret, time.Hour)
	alice   = auth.Claims{SubjectID: "account-1", SubjectType: "USER"}
)

func sign(t *testing.T, tokens *infrastructure.JwtSignedTokens, claims auth.Claims) string {
	t.Helper()
	token, err := tokens.Sign(claims)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return token
}

func TestIssuesATokenAndVerifiesItBack(t *testing.T) {
	claims, ok := service.Verify(sign(t, service, alice))
	if !ok || *claims != alice {
		t.Errorf("verify = %v, %v; want %v", claims, ok, alice)
	}
}

func TestRejectsATokenSignedWithAnotherSecret(t *testing.T) {
	other := infrastructure.NewJwtSignedTokens("other-secret-of-at-least-thirty-two-bytes", time.Hour)
	if claims, ok := service.Verify(sign(t, other, alice)); ok {
		t.Errorf("verified a token of another secret: %v", claims)
	}
}

func TestRejectsATamperedToken(t *testing.T) {
	parts := strings.Split(sign(t, service, alice), ".")
	forged, _ := json.Marshal(map[string]string{"subjectId": "account-1", "subjectType": "ADMIN"})
	payload := base64.RawURLEncoding.EncodeToString(forged)
	if claims, ok := service.Verify(parts[0] + "." + payload + "." + parts[2]); ok {
		t.Errorf("verified a tampered token: %v", claims)
	}
}

func TestRejectsAnExpiredToken(t *testing.T) {
	expired := infrastructure.NewJwtSignedTokens(secret, -time.Second)
	if claims, ok := service.Verify(sign(t, expired, alice)); ok {
		t.Errorf("verified an expired token: %v", claims)
	}
}
