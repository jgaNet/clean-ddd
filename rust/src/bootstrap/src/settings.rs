//! What the environment decides: the transport's (the port, the API prefix, the origins), the
//! secret the tokens are signed with, the administrator the application starts with. Read once,
//! from the environment, with the same defaults as the TypeScript settings; the tests build their own.

use std::env;
use std::time::Duration;

use bootstrap_transport::TransportSettings;
use notifications_wiring::NotificationsSettings;
use security_wiring::SecuritySettings;

const NAME: &str = "clean-ddd";
const VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct AdminAccount {
    pub identifier: String,
    pub password: String,
}

pub struct Settings {
    /// What the home of the API says it is: the workspace's name and version.
    pub name: String,
    pub version: String,
    /// Where and to whom the API is served: `PORT`, `API_PREFIX`, `WEB_ORIGINS`.
    pub transport: TransportSettings,
    pub security: SecuritySettings,
    pub notifications: NotificationsSettings,
    /// The administrator account created before the first request; none when absent.
    pub admin_account: Option<AdminAccount>,
    pub debug: bool,
}

impl Settings {
    pub fn from_env() -> Self {
        let var = |name: &str| env::var(name).ok().filter(|value| !value.is_empty());
        let transport = TransportSettings::from_env();
        let base_url = var("BASE_URL").unwrap_or_else(|| "localhost".into());
        Self {
            name: NAME.into(),
            version: VERSION.into(),
            notifications: NotificationsSettings {
                url: format!(
                    "{}://{base_url}:{}/{}",
                    var("PROTOCOL").unwrap_or_else(|| "http".into()),
                    transport.port,
                    transport.api_prefix
                ),
                from_email: var("FROM_EMAIL").unwrap_or_else(|| "noreply@example.com".into()),
            },
            transport,
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

    /// The settings of a test application: a free port, a front end on another origin, a cheap
    /// hash, the default administrator.
    pub fn for_tests() -> Self {
        Self {
            name: NAME.into(),
            version: VERSION.into(),
            transport: TransportSettings {
                web_origins: vec!["http://web.test".into()],
                ..TransportSettings::for_tests()
            },
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
