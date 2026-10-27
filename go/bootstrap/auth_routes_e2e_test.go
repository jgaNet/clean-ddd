package bootstrap

import (
	"net/http"
	"strings"
	"testing"
)

// The auth routes, end to end: login, sign-up, validation, and what a reference must not do.

func TestLoginAnswersATokenForValidCredentialsAnd401Otherwise(t *testing.T) {
	app := StartTestApplication(t)

	accepted := app.Login("admin@admin.fr", "admin")
	if accepted.Status != http.StatusOK || !strings.HasPrefix(accepted.Header.Get("Set-Cookie"), "token=") {
		t.Fatalf("login: %d %s", accepted.Status, accepted.Text)
	}
	if _, ok := accepted.Object()["token"].(string); !ok {
		t.Fatalf("token: %s", accepted.Text)
	}
	if app.Login("error@admin.fr", "admin").Status != http.StatusUnauthorized || app.Login("admin@admin.fr", "nope").Status != http.StatusUnauthorized {
		t.Fatal("a wrong account or password is a 401")
	}

	// A forged token is ignored: the caller is anonymous, and /auth/me says so
	forged := "eyJhbGciOiJIUzI1NiJ9.eyJzdWJqZWN0SWQiOiJ4Iiwic3ViamVjdFR5cGUiOiJBRE1JTiJ9.bad"
	if app.Anonymous().Get("/auth/me", Header{"Authorization", "Bearer " + forged}).Status != http.StatusUnauthorized {
		t.Fatal("a forged token is anonymous")
	}

	// The genuine one is not
	me := app.Admin().Get("/auth/me").Object()
	if me["email"] != "admin@admin.fr" || me["role"] != "ADMIN" || me["status"] != "ACTIVE" {
		t.Fatalf("me: %v", me)
	}
}

func TestSignUpOpensAPendingAccountAnAdministratorValidates(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()
	signUp := func(identifier, password string) map[string]any {
		return app.Accepted(admin, app.Anonymous().Post("/auth/signup", map[string]string{"identifier": identifier, "password": password}))
	}

	// An existing email is refused, through the operation
	existing := signUp("admin@admin.fr", "admin")
	if existing["status"] != "ERROR" || existing["error"].(map[string]any)["type"] != "AccountAlreadyExists" {
		t.Fatalf("existing: %v", existing)
	}
	if existing["name"] != "SignUp" {
		t.Fatalf("public name: %v", existing["name"])
	}

	// A new one is pending until validated
	operation := signUp("user@user.fr", "user")
	if operation["status"] != "SUCCESS" {
		t.Fatalf("sign-up: %v", operation)
	}
	accountID := operation["result"].(string)
	pending := admin.Get("/auth/accounts/" + accountID).Object()
	if pending["id"] != accountID || pending["email"] != "user@user.fr" || pending["role"] != "USER" || pending["status"] != "PENDING" || len(pending) != 4 {
		t.Fatalf("pending: %v", pending)
	}
	if app.Login("user@user.fr", "user").Status != http.StatusUnauthorized {
		t.Fatal("a pending account cannot log in")
	}

	validated := app.Accepted(admin, admin.Get("/auth/accounts/"+accountID+"/validate"))
	if validated["status"] != "SUCCESS" || validated["name"] != "ValidateAccount" {
		t.Fatalf("validated: %v", validated)
	}
	if admin.Get("/auth/accounts/" + accountID).Object()["status"] != "ACTIVE" {
		t.Fatal("active")
	}
	if app.Login("user@user.fr", "user").Status != http.StatusOK {
		t.Fatal("an active account logs in")
	}

	// A user reads their own account, not another's
	user := app.AgentAs("user@user.fr", "user")
	if user.Get("/auth/accounts/"+accountID).Status != http.StatusOK {
		t.Fatal("own account")
	}
	if _, ok := user.Get("/auth/me").Object()["lastAuthenticatedAt"].(string); !ok {
		t.Fatal("lastAuthenticatedAt")
	}
	adminID := admin.Get("/auth/me").Object()["id"].(string)
	if user.Get("/auth/accounts/"+adminID).Status != http.StatusForbidden {
		t.Fatal("another's account is a 403")
	}
}

func TestWhatAReferenceMustNotDo(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()

	// Never store or serve the password of a sign-up
	signedUp := app.Anonymous().Post("/auth/signup", map[string]string{"identifier": "frank@user.fr", "password": "S3cret-Plaintext"})
	operation := app.Accepted(admin, signedUp)
	if _, has := operation["payload"]; has {
		t.Fatal("no payload on a record")
	}
	raw := admin.Get("/tracker/operations/" + operation["id"].(string)).Text
	if strings.Contains(raw, "S3cret-Plaintext") {
		t.Fatal("the password is nowhere on the record")
	}

	// Never let an anonymous caller validate an account
	signedUp = app.Anonymous().Post("/auth/signup", map[string]string{"identifier": "grace@user.fr", "password": "grace"})
	accountID := app.Accepted(admin, signedUp)["result"].(string)
	attempt := app.Anonymous().Get("/auth/accounts/" + accountID + "/validate")
	if attempt.Status != http.StatusAccepted {
		t.Fatalf("attempt: %d", attempt.Status)
	}
	refused := app.Accepted(admin, attempt)
	if refused["status"] != "ERROR" || refused["error"].(map[string]any)["type"] != "NotAllowed" {
		t.Fatalf("refused: %v", refused)
	}
	if admin.Get("/auth/accounts/" + accountID).Object()["status"] != "PENDING" {
		t.Fatal("still pending")
	}

	// Never record a login: the token is not an operation's result
	for _, record := range admin.Get("/tracker/operations").Array() {
		if record["name"] == "Login" {
			t.Fatal("a login is never an operation")
		}
	}
}
