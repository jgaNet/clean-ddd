//! `Email` is a value object: once you hold one you know it is well-formed. Like every value
//! object in this project it is built through `create()`, which returns a `DomainResult`
//! instead of panicking, so an invalid input is an ordinary failure the caller handles.

use architecture_domain::{DomainResult, Exception, ValueObject};

pub const INVALID_EMAIL_FORMAT: &str = "InvalidEmailFormat";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Email(String);

impl Email {
    pub const MAX_LENGTH: usize = 254;

    /// Trims, lower-cases, and refuses what is not `local@domain.tld` or is too long.
    pub fn create(raw: &str) -> DomainResult<Email> {
        let email = raw.trim().to_lowercase();
        if email.len() > Self::MAX_LENGTH || !well_formed(&email) {
            return Err(invalid_email_format(raw));
        }
        Ok(Email(email))
    }

    pub fn value(&self) -> &str {
        &self.0
    }

    /// What is before the `@`.
    pub fn username(&self) -> &str {
        &self.0[..self.0.find('@').unwrap_or(self.0.len())]
    }
}

impl ValueObject for Email {}

/// The same rule as the reference's `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, written out.
fn well_formed(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else { return false };
    let clean = |part: &str| !part.is_empty() && !part.chars().any(|c| c.is_whitespace() || c == '@');
    let Some(dot) = domain.find('.') else { return false };
    // at least one character before the dot, at least two after it
    clean(local) && clean(domain) && dot >= 1 && domain.len() - dot > 2
}

pub fn invalid_email_format(raw: &str) -> Exception {
    Exception::new("unknown", INVALID_EMAIL_FORMAT, "Invalid email format").with("email", raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_well_formed_address_and_normalises_it() {
        let email = Email::create("  Alice@Example.com ").expect("well-formed");

        assert_eq!(email.value(), "alice@example.com");
        assert_eq!(email.username(), "alice");
    }

    #[test]
    fn refuses_what_is_not_an_address() {
        for raw in ["", "alice", "alice@", "@example.com", "alice@example", "a b@example.com"] {
            let refusal = Email::create(raw).expect_err(raw);
            assert!(refusal.is(INVALID_EMAIL_FORMAT), "{raw}");
        }
    }

    #[test]
    fn compares_by_value() {
        assert_eq!(Email::create("a@b.io"), Email::create("A@B.IO"));
    }
}
