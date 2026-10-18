//! What an account authenticates with. The domain only ever sees a hash: hashing and comparing
//! are the job of the `PasswordHasher` port, implemented in the infrastructure. The `kind`
//! leaves room for other kinds of credentials without touching the aggregate.

use architecture_domain::{DomainResult, ValueObject};

use super::account_exceptions::invalid_credentials;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Credentials {
    hash: String,
}

impl Credentials {
    pub const KIND: &'static str = "password";

    pub fn create(hash: &str) -> DomainResult<Credentials> {
        if hash.is_empty() {
            return Err(invalid_credentials());
        }
        Ok(Credentials { hash: hash.to_string() })
    }

    pub fn kind(&self) -> &'static str {
        Self::KIND
    }

    pub fn hash(&self) -> &str {
        &self.hash
    }
}

impl ValueObject for Credentials {}

#[cfg(test)]
mod tests {
    use super::super::account_exceptions::INVALID_CREDENTIALS;
    use super::*;

    #[test]
    fn holds_a_hash_and_refuses_none() {
        assert_eq!(Credentials::create("$2b$hash").expect("credentials").hash(), "$2b$hash");
        assert!(Credentials::create("").expect_err("empty").is(INVALID_CREDENTIALS));
        assert_eq!(Credentials::create("a"), Credentials::create("a"));
    }
}
