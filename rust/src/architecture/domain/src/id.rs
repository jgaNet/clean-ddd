//! `Id` is the identity of an entity. The domain generates it itself (`Id::generate()`) when it
//! creates an aggregate, so a persistence round-trip is never needed to know who a new object
//! is, and the repository stays a plain load/save port (ADR 2).

use std::fmt;

use uuid::Uuid;

use crate::value_object::ValueObject;

/// The identity of an entity: a value object over a string, compared by value.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Id(String);

impl Id {
    /// An identity read back from storage, or known from the outside (a caller's id).
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// A fresh identity, made by the domain and by nobody else.
    pub fn generate() -> Self {
        Self(Uuid::new_v4().to_string())
    }

    pub fn value(&self) -> &str {
        &self.0
    }
}

impl ValueObject for Id {}

impl fmt::Display for Id {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_a_distinct_identity_every_time() {
        assert_ne!(Id::generate(), Id::generate());
        assert_eq!(Id::generate().value().len(), 36);
    }

    #[test]
    fn compares_by_value() {
        assert_eq!(Id::new("a"), Id::new("a"));
        assert_ne!(Id::new("a"), Id::new("b"));
    }
}
