//! The `SignedTokens` port as HS256 JSON Web Tokens signed with a shared secret. `verify`
//! rejects a bad signature, a tampered payload and an expired token alike, with nothing: the
//! caller only needs to know the token is not ours.
//!
//! When a token is issued and when it expires is our decision, on the application's clock
//! (DOMAIN-ONE-CLOCK): the expiry is computed and checked here, against that clock, and the
//! library's own check of `exp` against the machine is turned off.

use std::time::{Duration, UNIX_EPOCH};

use architecture_application::Clock;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use security_domain::auth::TokenPayload;
use security_domain::auth::ports::signed_tokens::SignedTokens;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Claims {
    subject_id: String,
    subject_type: String,
    iat: u64,
    exp: u64,
}

pub struct JwtSignedTokens {
    encoding: EncodingKey,
    decoding: DecodingKey,
    expires_in: Duration,
    clock: Clock,
}

impl JwtSignedTokens {
    pub fn new(secret: &str, expires_in: Duration, clock: Clock) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
            expires_in,
            clock,
        }
    }

    /// The clock's now, in the seconds a token's claims count in.
    fn now(&self) -> u64 {
        (self.clock)().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
    }
}

impl SignedTokens for JwtSignedTokens {
    async fn issue(&self, payload: TokenPayload) -> String {
        let iat = self.now();
        let claims = Claims {
            subject_id: payload.subject_id,
            subject_type: payload.subject_type,
            iat,
            exp: iat.saturating_add(self.expires_in.as_secs()),
        };
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &self.encoding)
            .expect("HS256 signs any serializable claims")
    }

    async fn verify(&self, token: &str) -> Option<TokenPayload> {
        // The signature and the presence of `exp` are the library's to check; whether the token has
        // expired is checked below, on the application's clock rather than the machine's.
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = false;
        let claims = jsonwebtoken::decode::<Claims>(token, &self.decoding, &validation).ok()?.claims;
        if claims.exp < self.now() {
            return None;
        }
        if claims.subject_id.is_empty() || claims.subject_type.is_empty() {
            return None;
        }
        Some(TokenPayload { subject_id: claims.subject_id, subject_type: claims.subject_type })
    }
}

#[cfg(test)]
mod tests {
    use std::time::SystemTime;

    use architecture_application::fixed_clock;

    use super::*;

    /// When the tests issue their tokens: any fixed time will do, the tokens are read on the same clock.
    const ISSUED: SystemTime = SystemTime::UNIX_EPOCH;

    fn payload() -> TokenPayload {
        TokenPayload { subject_id: "account-1".into(), subject_type: "USER".into() }
    }

    fn tokens_at(secret: &str, expires_in: Duration, at: SystemTime) -> JwtSignedTokens {
        JwtSignedTokens::new(secret, expires_in, fixed_clock(at))
    }

    #[test]
    fn issues_a_token_and_verifies_it_back() {
        let tokens = tokens_at("test-secret", Duration::from_secs(3600), ISSUED);

        let token = pollster::block_on(tokens.issue(payload()));

        assert_eq!(pollster::block_on(tokens.verify(&token)), Some(payload()));
    }

    #[test]
    fn rejects_a_token_signed_with_another_secret_a_tampered_one_and_an_expired_one() {
        let tokens = tokens_at("test-secret", Duration::from_secs(3600), ISSUED);
        let other = pollster::block_on(tokens_at("other", Duration::from_secs(3600), ISSUED).issue(payload()));
        let expired = pollster::block_on(tokens_at("test-secret", Duration::ZERO, ISSUED).issue(payload()));
        let genuine = pollster::block_on(tokens.issue(payload()));
        let mut parts: Vec<&str> = genuine.split('.').collect();
        parts[1] = "eyJzdWJqZWN0SWQiOiJhY2NvdW50LTEiLCJzdWJqZWN0VHlwZSI6IkFETUlOIn0";
        let tampered = parts.join(".");
        let a_second_later = tokens_at("test-secret", Duration::from_secs(3600), ISSUED + Duration::from_secs(1));

        assert_eq!(pollster::block_on(tokens.verify(&other)), None);
        assert_eq!(pollster::block_on(tokens.verify(&tampered)), None);
        assert_eq!(pollster::block_on(a_second_later.verify(&expired)), None);
        assert_eq!(pollster::block_on(tokens.verify("not.a.token")), None);
    }

    /// The expiry is the application's clock's: a token is valid until that clock passes it, whatever the machine says.
    #[test]
    fn a_token_expires_when_the_application_clock_passes_its_expiry() {
        let token = pollster::block_on(tokens_at("test-secret", Duration::from_secs(60), ISSUED).issue(payload()));
        let read_at = |seconds: u64| {
            pollster::block_on(
                tokens_at("test-secret", Duration::from_secs(60), ISSUED + Duration::from_secs(seconds)).verify(&token),
            )
        };

        assert_eq!(read_at(60), Some(payload()));
        assert_eq!(read_at(61), None);
    }
}
