//! Domain exceptions of the `Account` aggregate: a broken business rule, in business words. A
//! `kind` constant per rule, as a client reads it on the operation, and a function that builds it.

use architecture_domain::Exception;

/// The context that refuses.
pub const SERVICE: &str = "Security";

pub const ACCOUNT_ALREADY_EXISTS: &str = "AccountAlreadyExists";
pub const ACCOUNT_NOT_FOUND: &str = "AccountNotFound";
pub const ACCOUNT_ALREADY_ACTIVE: &str = "AccountAlreadyActive";
pub const INACTIVE_ACCOUNT: &str = "InactiveAccount";
pub const INVALID_CREDENTIALS: &str = "InvalidCredentials";

fn refusal(kind: &str, message: &str) -> Exception {
    Exception::new(SERVICE, kind, message)
}

pub fn account_already_exists(email: &str) -> Exception {
    refusal(ACCOUNT_ALREADY_EXISTS, "An account already exists for this email").with("email", email)
}

pub fn account_not_found(account_id: &str) -> Exception {
    refusal(ACCOUNT_NOT_FOUND, "Account not found").with("accountId", account_id)
}

pub fn account_already_active(account_id: &str) -> Exception {
    refusal(ACCOUNT_ALREADY_ACTIVE, "This account is already active").with("accountId", account_id)
}

pub fn inactive_account(account_id: &str) -> Exception {
    refusal(INACTIVE_ACCOUNT, "This account is not active").with("accountId", account_id)
}

/// Deliberately vague: it does not say whether the email or the password was wrong.
pub fn invalid_credentials() -> Exception {
    refusal(INVALID_CREDENTIALS, "Invalid credentials")
}
