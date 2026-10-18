//! `NoteTitle` is a value object: it has no identity, it is immutable, and it cannot exist in an
//! invalid state. Once you hold a `NoteTitle` you know it is non-blank and short enough.
//!
//! The validation lives here, in one place, instead of being repeated wherever a title enters
//! the system (creation, edition, import...). The field is private: the only way in is `create`.

use architecture_domain::{DomainResult, ValueObject};

use super::note_exceptions::{blank_note_title, note_title_too_long};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteTitle(String);

impl NoteTitle {
    pub const MAX_LENGTH: usize = 100;

    pub fn create(raw: &str) -> DomainResult<NoteTitle> {
        let title = raw.trim();
        if title.is_empty() {
            return Err(blank_note_title());
        }
        let length = title.chars().count();
        if length > Self::MAX_LENGTH {
            return Err(note_title_too_long(Self::MAX_LENGTH, length));
        }
        Ok(NoteTitle(title.to_string()))
    }

    pub fn value(&self) -> &str {
        &self.0
    }
}

impl ValueObject for NoteTitle {}

#[cfg(test)]
mod tests {
    use super::super::note_exceptions::{BLANK_NOTE_TITLE, NOTE_TITLE_TOO_LONG};
    use super::*;

    #[test]
    fn accepts_a_regular_title_and_trims_it() {
        assert_eq!(NoteTitle::create("  Groceries  ").expect("valid").value(), "Groceries");
    }

    #[test]
    fn refuses_a_blank_title() {
        assert!(NoteTitle::create("   ").expect_err("blank").is(BLANK_NOTE_TITLE));
    }

    #[test]
    fn refuses_a_title_longer_than_the_maximum() {
        let too_long = "x".repeat(NoteTitle::MAX_LENGTH + 1);
        assert!(NoteTitle::create(&too_long).expect_err("too long").is(NOTE_TITLE_TOO_LONG));
    }

    #[test]
    fn compares_by_value_not_by_reference() {
        assert_eq!(NoteTitle::create("Same"), NoteTitle::create("Same"));
    }
}
