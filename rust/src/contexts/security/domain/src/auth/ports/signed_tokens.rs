//! Signed, expiring tokens that carry a subject and what the token is for. The domain says what
//! a token must carry and that it cannot be forged; how it is signed is the infrastructure's
//! choice (`JwtSignedTokens`).

use std::future::Future;

use super::super::TokenPayload;

pub trait SignedTokens {
    fn issue(&self, payload: TokenPayload) -> impl Future<Output = String> + Send;
    /// The payload of a token whose signature and expiry check out, nothing otherwise.
    fn verify(&self, token: &str) -> impl Future<Output = Option<TokenPayload>> + Send;
}
