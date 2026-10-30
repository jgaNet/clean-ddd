package bootstrap

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strconv"
	"strings"
	"time"

	"clean-ddd/contexts/notifications"
	"clean-ddd/contexts/security"
)

// Settings is what the environment decides: the port, the API prefix, the secret the tokens
// are signed with, the administrator the application starts with, the origins a front end may
// call from. Read once, from the environment, with the same defaults as the other languages;
// the tests build their own.
type Settings struct {
	Name          string
	Version       string
	Port          int
	APIPrefix     string
	Security      security.Settings
	Notifications notifications.Settings
	// AdminAccount is the administrator account created before the first request; nil when absent.
	AdminAccount *AdminAccount
	// WebOrigins are the origins a front end may call the API from (CORS); none: same-origin clients only.
	WebOrigins []string
}

type AdminAccount struct {
	Identifier string
	Password   string
}

const (
	Name    = "clean-ddd"
	Version = "3.1.0"
)

func SettingsFromEnv() Settings {
	env := func(name, fallback string) string {
		if value := os.Getenv(name); value != "" {
			return value
		}
		return fallback
	}
	port, _ := strconv.Atoi(env("PORT", "10000"))
	prefix := env("API_PREFIX", "v1")
	expires, _ := strconv.Atoi(env("JWT_EXPIRES_IN_SECONDS", "86400"))
	cost, _ := strconv.Atoi(env("BCRYPT_COST", "10"))
	var origins []string
	for _, origin := range strings.Split(env("WEB_ORIGINS", ""), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}
	return Settings{
		Name:      Name,
		Version:   Version,
		Port:      port,
		APIPrefix: prefix,
		Security: security.Settings{
			JWTSecret:    env("JWT_SECRET", randomSecret()),
			JWTExpiresIn: time.Duration(expires) * time.Second,
			BcryptCost:   cost,
		},
		Notifications: notifications.Settings{
			URL:       env("PROTOCOL", "http") + "://" + env("BASE_URL", "localhost") + ":" + strconv.Itoa(port) + "/" + prefix,
			FromEmail: env("FROM_EMAIL", "noreply@example.com"),
		},
		AdminAccount: &AdminAccount{Identifier: env("ADMIN_IDENTIFIER", "admin@admin.fr"), Password: env("ADMIN_PASSWORD", "admin")},
		WebOrigins:   origins,
	}
}

// randomSecret is the secret the tokens are signed with when JWT_SECRET is unset: drawn for this
// process, never a fixed string anyone could sign with. Tokens then do not survive a restart.
func randomSecret() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		panic("no randomness for the token secret: " + err.Error())
	}
	return hex.EncodeToString(bytes)
}

// SettingsForTests are the settings of a test application: a free port, a cheap hash, the
// default administrator, one allowed web origin.
func SettingsForTests() Settings {
	return Settings{
		Name:          Name,
		Version:       Version,
		Port:          0,
		APIPrefix:     "v1",
		Security:      security.Settings{JWTSecret: "test-secret-of-at-least-thirty-two-bytes", JWTExpiresIn: time.Hour, BcryptCost: 4},
		Notifications: notifications.Settings{URL: "http://localhost/v1", FromEmail: "noreply@example.com"},
		AdminAccount:  &AdminAccount{Identifier: "admin@admin.fr", Password: "admin"},
		WebOrigins:    []string{"http://web.test"},
	}
}
