//! Hashing is a technical concern with a business meaning ("is this the right password?"). The
//! port keeps the algorithm out of the domain and the application layer; the infrastructure
//! provides it (`BcryptPasswordHasher`), tests provide a fake.

use std::future::Future;

pub trait PasswordHasher {
    fn hash(&self, plain: &str) -> impl Future<Output = String> + Send;
    fn compare(&self, plain: &str, hash: &str) -> impl Future<Output = bool> + Send;
}
