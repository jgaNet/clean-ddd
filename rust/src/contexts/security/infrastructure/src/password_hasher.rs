//! The `PasswordHasher` port as bcrypt. The cost is the composition root's choice: the default
//! for a deployment, a low one for the tests, which hash a few passwords per suite.

use security_domain::auth::ports::password_hasher::PasswordHasher;

pub struct BcryptPasswordHasher {
    cost: u32,
}

impl BcryptPasswordHasher {
    pub fn new(cost: u32) -> Self {
        Self { cost }
    }
}

impl Default for BcryptPasswordHasher {
    fn default() -> Self {
        Self::new(bcrypt::DEFAULT_COST)
    }
}

impl PasswordHasher for BcryptPasswordHasher {
    async fn hash(&self, plain: &str) -> String {
        bcrypt::hash(plain, self.cost).expect("bcrypt hashes any password of at most 72 bytes")
    }

    async fn compare(&self, plain: &str, hash: &str) -> bool {
        bcrypt::verify(plain, hash).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_the_password_it_hashed_and_no_other() {
        let hasher = BcryptPasswordHasher::new(4);

        let hash = pollster::block_on(hasher.hash("s3cret"));

        assert!(pollster::block_on(hasher.compare("s3cret", &hash)));
        assert!(!pollster::block_on(hasher.compare("other", &hash)));
        assert!(!pollster::block_on(hasher.compare("s3cret", "not a hash")));
    }
}
