//! `Entity`: an object defined by its identity, not by its attributes.
//!
//! Two entities of the same kind with the same id are the same thing even if their fields
//! differ; two with different ids are different things even if every field matches. That is
//! what `equals()` expresses. The kind matters: an Account and a Note that happened to share
//! an id would not be the same thing — and in Rust that comparison does not compile, since
//! `equals` takes a `&Self`. The id is immutable for the whole life of the object.
//!
//! Most of the time you will hold an [`AggregateRoot`] rather than implement `Entity` alone:
//! the root is the entity through which the rest of its aggregate is reached.
//!
//! An entity keeps its state in private fields, and that is the encapsulation the whole design
//! rests on — so it does not derive `PartialEq`: compare two with `equals()` (are they the same
//! thing?) or through `to_snapshot()` (do they hold the same state?). The tests below show both.
//!
//! Example: the `Note` aggregate of the Notes context.
//!
//! [`AggregateRoot`]: crate::aggregate_root::AggregateRoot

use crate::id::Id;

pub trait Entity {
    fn id(&self) -> &Id;

    /// The same thing? Identity decides, whatever the attributes now say.
    fn equals(&self, other: &Self) -> bool {
        self.id() == other.id()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Order(Id);
    impl Entity for Order {
        fn id(&self) -> &Id {
            &self.0
        }
    }

    #[test]
    fn is_the_same_thing_as_another_of_its_kind_with_the_same_id() {
        assert!(Order(Id::new("a")).equals(&Order(Id::new("a"))));
    }

    #[test]
    fn is_a_different_thing_with_a_different_id() {
        assert!(!Order(Id::new("a")).equals(&Order(Id::new("b"))));
    }

    // An Order is never the same thing as an Invoice, whatever the id: `order.equals(&invoice)`
    // does not compile. In TypeScript that was a runtime check on the constructor.

    mod comparing_entities {
        use super::*;

        struct Note {
            id: Id,
            title: String,
        }
        impl Entity for Note {
            fn id(&self) -> &Id {
                &self.id
            }
        }
        impl Note {
            fn to_snapshot(&self) -> (String, String) {
                (self.id.value().to_string(), self.title.clone())
            }
        }

        #[test]
        fn is_done_with_equals_the_same_thing_or_through_the_snapshot_the_same_state() {
            let one = Note { id: Id::new("a"), title: "Groceries".into() };
            let same = Note { id: Id::new("a"), title: "Groceries".into() };
            let renamed = Note { id: Id::new("a"), title: "Errands".into() };

            assert!(one.equals(&same));
            assert!(one.equals(&renamed)); // the same note, whatever it now says
            assert_eq!(one.to_snapshot(), same.to_snapshot());
            assert_ne!(one.to_snapshot(), renamed.to_snapshot());
        }

        // There is no structural comparison to warn against: an entity does not derive
        // `PartialEq`, so `one == same` does not compile. That is the point.
    }
}
