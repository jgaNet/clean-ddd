//! What the environment decides: the port, the API prefix, the secret the tokens are signed
//! with, the administrator the application starts with. Read once, from the environment, with
//! the same defaults as the TypeScript settings; the tests build their own.

use std::env;
use std::time::Duration;

use notifications_wiring::NotificationsSettings;
use security_wiring::SecuritySettings;

pub struct AdminAccount {
    pub identifier: String,
    pub password: String,
}

pub struct Settings {
    pub port: u16,
    pub api_prefix: String,
    pub security: SecuritySettings,
    pub notifications: NotificationsSettings,
    /// The administrator account created before the first request; none when absent.
    pub admin_account: Option<AdminAccount>,
    pub debug: bool,
}

impl Settings {
    pub fn from_env() -> Self {
        let var = |name: &str| env::var(name).ok().filter(|value| !value.is_empty());
        let port = var("PORT").and_then(|port| port.parse().ok()).unwrap_or(10000);
        let api_prefix = var("API_PREFIX").unwrap_or_else(|| "v1".into());
        let base_url = var("BASE_URL").unwrap_or_else(|| "localhost".into());
        Self {
            port,
            notifications: NotificationsSettings {
                url: format!("{}://{base_url}:{port}/{api_prefix}", var("PROTOCOL").unwrap_or_else(|| "http".into())),
                from_email: var("FROM_EMAIL").unwrap_or_else(|| "noreply@example.com".into()),
            },
            api_prefix,
            security: SecuritySettings {
                jwt_secret: var("JWT_SECRET")
                    .unwrap_or_else(|| "default-development-secret-do-not-use-in-production".into()),
                jwt_expires_in: Duration::from_secs(
                    var("JWT_EXPIRES_IN_SECONDS").and_then(|seconds| seconds.parse().ok()).unwrap_or(24 * 3600),
                ),
                bcrypt_cost: var("BCRYPT_COST").and_then(|cost| cost.parse().ok()).unwrap_or(10),
            },
            admin_account: Some(AdminAccount {
                identifier: var("ADMIN_IDENTIFIER").unwrap_or_else(|| "admin@admin.fr".into()),
                password: var("ADMIN_PASSWORD").unwrap_or_else(|| "admin".into()),
            }),
            debug: var("DEBUG").is_some_and(|debug| debug == "true"),
        }
    }

    /// The settings of a test application: a free port, a cheap hash, the default administrator.
    pub fn for_tests() -> Self {
        Self {
            port: 0,
            api_prefix: "v1".into(),
            notifications: NotificationsSettings {
                url: "http://localhost/v1".into(),
                from_email: "noreply@example.com".into(),
            },
            security: SecuritySettings {
                jwt_secret: "test-secret".into(),
                jwt_expires_in: Duration::from_secs(3600),
                bcrypt_cost: 4,
            },
            admin_account: Some(AdminAccount { identifier: "admin@admin.fr".into(), password: "admin".into() }),
            debug: false,
        }
    }
}
