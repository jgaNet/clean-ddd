//! `NoteSharing` is a domain service: "a note can only be shared with an account that exists"
//! is a business rule, but the aggregate cannot check it alone because accounts live in another
//! context. The service asks through a port Notes owns (`AccountDirectory`), then lets the
//! aggregate apply its own rules (owner only, not archived, not twice, not yourself).

use architecture_domain::{DomainResult, Entity, Id};

use super::Note;
use super::note_exceptions::recipient_not_found;
use super::ports::account_directory::AccountDirectory;

pub struct NoteSharing<D: AccountDirectory> {
    accounts: D,
}

impl<D: AccountDirectory> NoteSharing<D> {
    pub fn new(accounts: D) -> Self {
        Self { accounts }
    }

    pub async fn share(&self, note: &mut Note, actor: &Id, recipient: &Id) -> DomainResult {
        if !self.accounts.exists(recipient.value()).await {
            return Err(recipient_not_found(note.id().value(), recipient.value()));
        }
        note.share_with(actor, recipient)
    }
}

#[cfg(test)]
mod tests {
    use super::super::NewNote;
    use super::super::note_exceptions::{NOT_NOTE_OWNER, RECIPIENT_NOT_FOUND};
    use super::*;

    /// A domain test needs only the port: a list of known ids is a directory.
    struct Directory(Vec<&'static str>);
    impl AccountDirectory for Directory {
        async fn exists(&self, account_id: &str) -> bool {
            self.0.contains(&account_id)
        }
    }

    fn a_note_of(owner: &Id) -> Note {
        Note::create(NewNote { owner_id: owner.value().into(), title: "Groceries".into(), content: "Milk".into() })
            .expect("a valid note")
    }

    #[test]
    fn shares_with_an_account_the_directory_knows() {
        let (alice, bob) = (Id::new("alice"), Id::new("bob"));
        let mut note = a_note_of(&alice);

        let result =
            pollster::block_on(NoteSharing::new(Directory(vec!["alice", "bob"])).share(&mut note, &alice, &bob));

        assert!(result.is_ok());
        assert_eq!(note.shared_with(), ["bob"]);
    }

    #[test]
    fn refuses_an_account_the_directory_does_not_know_before_the_aggregate_is_touched() {
        let (alice, bob) = (Id::new("alice"), Id::new("bob"));
        let mut note = a_note_of(&alice);

        let result = pollster::block_on(NoteSharing::new(Directory(vec!["alice"])).share(&mut note, &alice, &bob));

        assert!(result.expect_err("unknown recipient").is(RECIPIENT_NOT_FOUND));
        assert!(note.shared_with().is_empty());
    }

    #[test]
    fn still_leaves_the_notes_own_rules_to_the_aggregate() {
        let (alice, bob) = (Id::new("alice"), Id::new("bob"));
        let mut note = a_note_of(&alice);

        let result =
            pollster::block_on(NoteSharing::new(Directory(vec!["alice", "bob"])).share(&mut note, &bob, &alice));

        assert!(result.expect_err("not the owner").is(NOT_NOTE_OWNER));
    }
}
