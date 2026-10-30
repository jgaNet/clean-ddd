"""What the environment decides: the port, the API prefix, the secret the tokens are signed
with, the administrator the application starts with. Read once, from the environment, with the
same defaults as the TypeScript settings; the tests build their own."""

import os
import secrets
from dataclasses import dataclass
from datetime import timedelta
from importlib.metadata import PackageNotFoundError, version

from contexts.notifications.module_local import NotificationsSettings
from contexts.security.module_local import SecuritySettings

NAME = "clean-ddd"


def package_version() -> str:
    try:
        return version(NAME)
    except PackageNotFoundError:
        return "0.0.0"


@dataclass(frozen=True)
class AdminAccount:
    identifier: str
    password: str


def admin_account_from(identifier: str | None, password: str | None) -> "AdminAccount | None":
    """The administrator the application is seeded with: only when both are set, never a default, since
    known credentials would open every deployment that forgot them."""
    return AdminAccount(identifier=identifier, password=password) if identifier and password else None


@dataclass(frozen=True)
class Settings:
    name: str
    version: str
    port: int
    api_prefix: str
    security: SecuritySettings
    notifications: NotificationsSettings
    #: The administrator account created before the first request; none when absent.
    admin_account: AdminAccount | None
    #: The origins a front end may call the API from (CORS); none: same-origin clients only.
    web_origins: tuple[str, ...]
    debug: bool

    @staticmethod
    def from_env() -> "Settings":
        var = os.environ.get
        port = int(var("PORT") or 10000)
        api_prefix = var("API_PREFIX") or "v1"
        return Settings(
            name=NAME,
            version=package_version(),
            port=port,
            api_prefix=api_prefix,
            notifications=NotificationsSettings(
                url=f"{var('PROTOCOL') or 'http'}://{var('BASE_URL') or 'localhost'}:{port}/{api_prefix}",
                from_email=var("FROM_EMAIL") or "noreply@example.com",
            ),
            security=SecuritySettings(
                # Without JWT_SECRET, a secret drawn for this process, never a fixed string anyone could sign with.
                jwt_secret=var("JWT_SECRET") or secrets.token_hex(32),
                jwt_expires_in=timedelta(seconds=int(var("JWT_EXPIRES_IN_SECONDS") or 24 * 3600)),
                bcrypt_cost=int(var("BCRYPT_COST") or 10),
            ),
            admin_account=admin_account_from(var("ADMIN_IDENTIFIER"), var("ADMIN_PASSWORD")),
            web_origins=tuple(origin for origin in (var("WEB_ORIGINS") or "").split(",") if origin),
            debug=var("DEBUG") == "true",
        )

    @staticmethod
    def for_tests() -> "Settings":
        """The settings of a test application: a free port, a cheap hash, an administrator to sign in as."""
        return Settings(
            name=NAME,
            version=package_version(),
            port=0,
            api_prefix="v1",
            security=SecuritySettings(
                jwt_secret="test-secret-of-at-least-thirty-two-bytes", jwt_expires_in=timedelta(hours=1), bcrypt_cost=4
            ),
            notifications=NotificationsSettings(url="http://localhost/v1", from_email="noreply@example.com"),
            admin_account=AdminAccount(identifier="admin@admin.fr", password="admin"),
            web_origins=("http://web.test",),
            debug=False,
        )
