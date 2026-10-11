//! The refusals every context may have to say, with the kinds a controller maps to a status:
//! not found (404), not allowed (403), a concurrency conflict and anything unknown (400).

use crate::exception::Exception;

pub const UNKNOWN: &str = "Unknown";
pub const NOT_FOUND: &str = "NotFound";
pub const NOT_ALLOWED: &str = "NotAllowed";
pub const CONCURRENCY_CONFLICT: &str = "ConcurrencyConflict";

const UNKNOWN_SERVICE: &str = "unknown";

fn service_or_unknown(service: &str) -> &str {
    if service.is_empty() { UNKNOWN_SERVICE } else { service }
}

impl Exception {
    /// A failure nobody expected (a stray panic turned into a failed operation by the base handler).
    pub fn unknown(message: impl Into<String>) -> Self {
        Self::new(UNKNOWN_SERVICE, UNKNOWN, message)
    }

    pub fn not_found(service: &str, message: impl Into<String>) -> Self {
        Self::new(service_or_unknown(service), NOT_FOUND, message)
    }

    pub fn not_allowed(service: &str, message: impl Into<String>) -> Self {
        Self::new(service_or_unknown(service), NOT_ALLOWED, message)
    }

    /// The aggregate changed since it was read: the caller re-reads and decides again (ADR 8).
    pub fn concurrency_conflict(service: &str, message: impl Into<String>) -> Self {
        Self::new(service_or_unknown(service), CONCURRENCY_CONFLICT, message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_kind_a_controller_switches_on_and_never_leaves_the_service_blank() {
        assert!(Exception::not_found("Notes", "Note not found").is(NOT_FOUND));
        assert!(Exception::not_allowed("", "Sign in first").is(NOT_ALLOWED));
        assert_eq!(Exception::not_allowed("", "Sign in first").service(), "unknown");
        assert!(Exception::concurrency_conflict("Notes", "Changed since read").is(CONCURRENCY_CONFLICT));
        assert!(Exception::unknown("boom").is(UNKNOWN));
    }
}
