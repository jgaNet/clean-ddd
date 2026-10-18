//! The `SignedTokens` port as HS256 JSON Web Tokens signed with a shared secret. `verify`
//! rejects a bad signature, a tampered payload and an expired token alike, with nothing: the
//! caller only needs to know the token is not ours.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
}

impl JwtSignedTokens {
    pub fn new(secret: &str, expires_in: Duration) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
            expires_in,
        }
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

impl SignedTokens for JwtSignedTokens {
    async fn issue(&self, payload: TokenPayload) -> String {
        let iat = now();
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
        let mut validation = Validation::new(Algorithm::HS256);
        validation.leeway = 0;
        let claims = jsonwebtoken::decode::<Claims>(token, &self.decoding, &validation).ok()?.claims;
        if claims.subject_id.is_empty() || claims.subject_type.is_empty() {
            return None;
        }
        Some(TokenPayload { subject_id: claims.subject_id, subject_type: claims.subject_type })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload() -> TokenPayload {
        TokenPayload { subject_id: "account-1".into(), subject_type: "USER".into() }
    }

    #[test]
    fn issues_a_token_and_verifies_it_back() {
        let tokens = JwtSignedTokens::new("test-secret", Duration::from_secs(3600));

        let token = pollster::block_on(tokens.issue(payload()));

        assert_eq!(pollster::block_on(tokens.verify(&token)), Some(payload()));
    }

    #[test]
    fn rejects_a_token_signed_with_another_secret_a_tampered_one_and_an_expired_one() {
        let tokens = JwtSignedTokens::new("test-secret", Duration::from_secs(3600));
        let other = pollster::block_on(JwtSignedTokens::new("other", Duration::from_secs(3600)).issue(payload()));
        let expired = pollster::block_on(JwtSignedTokens::new("test-secret", Duration::ZERO).issue(payload()));
        let genuine = pollster::block_on(tokens.issue(payload()));
        let mut parts: Vec<&str> = genuine.split('.').collect();
        parts[1] = "eyJzdWJqZWN0SWQiOiJhY2NvdW50LTEiLCJzdWJqZWN0VHlwZSI6IkFETUlOIn0";
        let tampered = parts.join(".");

        assert_eq!(pollster::block_on(tokens.verify(&other)), None);
        assert_eq!(pollster::block_on(tokens.verify(&tampered)), None);
        std::thread::sleep(Duration::from_millis(1100));
        assert_eq!(pollster::block_on(tokens.verify(&expired)), None);
        assert_eq!(pollster::block_on(tokens.verify("not.a.token")), None);
    }
}
