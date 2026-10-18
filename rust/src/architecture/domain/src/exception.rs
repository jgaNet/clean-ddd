//! `Exception` describes a broken rule: which context refused (`service`), which rule (`kind`,
//! a stable identifier a client can switch on — `type` in TypeScript, a keyword here), in words
//! (`message`), with what details (`context`). It is a plain value carried by a failed
//! [`DomainResult`], never thrown or panicked: a refusal is an expected outcome, and an expected
//! outcome has no stack to capture (ADR 1).
//!
//! Each context declares its own next to its aggregate (`note_exceptions.rs` in Notes), as
//! functions that build one — a `kind` constant per rule, so a test can ask `error.is(KIND)`.
//! The generic ones (not found, not allowed, a concurrency conflict, unknown) are in
//! [`crate::common_exceptions`].
//!
//! [`DomainResult`]: crate::result::DomainResult

use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Exception {
    service: String,
    kind: String,
    message: String,
    context: BTreeMap<String, String>,
}

impl Exception {
    pub fn new(service: impl Into<String>, kind: impl Into<String>, message: impl Into<String>) -> Self {
        Self { service: service.into(), kind: kind.into(), message: message.into(), context: BTreeMap::new() }
    }

    /// Adds a detail a client or a log can show (`.with("noteId", id)`).
    pub fn with(mut self, key: impl Into<String>, value: impl ToString) -> Self {
        self.context.insert(key.into(), value.to_string());
        self
    }

    /// The context that refused.
    pub fn service(&self) -> &str {
        &self.service
    }

    /// The rule, as a stable identifier (`"NotNoteOwner"`).
    pub fn kind(&self) -> &str {
        &self.kind
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn context(&self) -> &BTreeMap<String, String> {
        &self.context
    }

    /// Is this the refusal of that rule? What a test or a controller asks.
    pub fn is(&self, kind: &str) -> bool {
        self.kind == kind
    }
}

impl fmt::Display for Exception {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({}/{})", self.message, self.service, self.kind)
    }
}

impl std::error::Error for Exception {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn says_who_refused_which_rule_and_why_and_compares_as_a_value() {
        let refusal = Exception::new("Notes", "NotNoteOwner", "Only the owner of a note can change it")
            .with("noteId", "n1")
            .with("actorId", "bob");

        assert_eq!(refusal.service(), "Notes");
        assert!(refusal.is("NotNoteOwner"));
        assert_eq!(refusal.context().get("actorId").map(String::as_str), Some("bob"));
        assert_eq!(refusal, refusal.clone());
        assert_eq!(refusal.to_string(), "Only the owner of a note can change it (Notes/NotNoteOwner)");
    }
}
