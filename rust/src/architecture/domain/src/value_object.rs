//! `ValueObject`: an object defined by its value, with no identity of its own.
//!
//! Two value objects are equal when they are of the same kind and their values are equal.
//! They are immutable: to "change" one you create another. Their job is to make an invalid
//! value impossible to represent, so validation lives in the value object instead of being
//! sprinkled across the code.
//!
//! In TypeScript this is a base class that compares `value` and refuses to equate two kinds.
//! In Rust the compiler gives all of that: a value object is a **newtype with a private field**
//! (`pub struct NoteTitle(String)`), built through `create()` which returns a [`DomainResult`]
//! instead of panicking, and deriving `PartialEq` — two kinds cannot even be compared, since
//! they are two types; a structured value says what "equal" means by deriving or writing
//! `PartialEq` on its fields. This trait is the name of that shape, so that the map can point
//! at the concept; it carries the bounds every value object must satisfy and nothing else.
//!
//! Examples: [`crate::Id`] (here), `Email` (the shared kernel), `NoteTitle` (the Notes context).
//!
//! [`DomainResult`]: crate::result::DomainResult

use std::fmt;

/// What every value object is: comparable by value, copyable, printable in a test.
pub trait ValueObject: PartialEq + Clone + fmt::Debug {}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, PartialEq)]
    struct Name(String);
    impl ValueObject for Name {}

    #[derive(Debug, Clone, PartialEq)]
    struct Money {
        amount: u32,
        currency: String,
    }
    impl ValueObject for Money {}

    #[test]
    fn compares_a_primitive_value_by_value() {
        assert_eq!(Name("alice".into()), Name("alice".into()));
        assert_ne!(Name("alice".into()), Name("bob".into()));
    }

    #[test]
    fn compares_a_structured_value_the_way_its_type_says() {
        let eur = Money { amount: 10, currency: "EUR".into() };
        assert_eq!(eur, Money { amount: 10, currency: "EUR".into() });
        assert_ne!(eur, Money { amount: 10, currency: "USD".into() });
    }

    // Two kinds that happen to hold the same value cannot be compared at all: `Name("a") ==
    // Nickname("a")` does not compile. In TypeScript that was a runtime rule of the base class.
}
