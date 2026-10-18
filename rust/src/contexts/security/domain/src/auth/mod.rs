//! Authentication's two technical concerns with a business meaning, as ports: is this the right
//! password, and is this token ours. The domain says what they must answer; the infrastructure
//! says how (bcrypt, JSON Web Tokens).

pub mod ports;

/// What a signed token carries: whose it is, and what for — a session for a role (`"USER"`,
/// `"ADMIN"`) or a validation link ([`VALIDATION_TOKEN`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenPayload {
    pub subject_id: String,
    pub subject_type: String,
}

/// The `subject_type` of a token that validates an account; it signs nobody in.
pub const VALIDATION_TOKEN: &str = "VALIDATION";
