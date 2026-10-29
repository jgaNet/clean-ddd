package presentation

import (
	"net/http"
	"strings"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	kernel "clean-ddd/sharedkernel/domain"
)

// Authentication identifies the caller of every request. It never blocks: a missing or bad
// token simply makes the request anonymous (GUEST), and each handler's guard decides what a
// guest may do. A token is accepted only if its signature and expiry check out
// (SignedTokens.Verify), the account still exists and is active, and the role it claims is
// the account's current role.
//
// The composition root gives Authenticate to the transport, which asks it for every request,
// every route and the websocket upgrade alike, and puts the Auth it answers on the request's
// execution context.
type Authentication struct {
	accounts account.Queries
	tokens   auth.SignedTokens
}

func NewAuthentication(accounts account.Queries, tokens auth.SignedTokens) *Authentication {
	return &Authentication{accounts: accounts, tokens: tokens}
}

// Guest is who an unidentified caller is.
var Guest = application.Auth{Role: string(kernel.RoleGuest)}

// Identify answers who is behind a request, from its headers and its query string: the
// account its token names, or nobody. The cookie is read first, then the bearer, then the
// query token (a websocket client cannot send a header).
func (a *Authentication) Identify(headers http.Header, queryToken string) application.Auth {
	token := tokenFromCookie(headers)
	if token == "" {
		token = tokenFromHeader(headers)
	}
	if token == "" {
		token = queryToken
	}
	if token == "" {
		return Guest
	}
	claims, ok := a.tokens.Verify(token)
	if !ok {
		return Guest
	}
	role, known := kernel.ParseRole(claims.SubjectType)
	if !known { // a validation token does not sign anyone in
		return Guest
	}
	detail, err := a.accounts.FindByID(claims.SubjectID)
	if err != nil || detail == nil || detail.Status != account.StatusActive || detail.Role != role {
		return Guest
	}
	return application.Auth{SubjectID: detail.ID, Role: string(role)}
}

// Authenticate identifies the caller of a request, from its headers and its query token. The
// composition root gives it to the transport, which asks it once per request — the websocket
// upgrade included — before it builds the request's execution context.
func (a *Authentication) Authenticate(r *http.Request) application.Auth {
	return a.Identify(r.Header, r.URL.Query().Get("token"))
}

func tokenFromHeader(headers http.Header) string {
	header := headers.Get("Authorization")
	if token, ok := strings.CutPrefix(header, "Bearer "); ok {
		return token
	}
	return ""
}

func tokenFromCookie(headers http.Header) string {
	for _, part := range strings.Split(headers.Get("Cookie"), ";") {
		name, value, _ := strings.Cut(strings.TrimSpace(part), "=")
		if name == "token" && value != "" {
			return value
		}
	}
	return ""
}
