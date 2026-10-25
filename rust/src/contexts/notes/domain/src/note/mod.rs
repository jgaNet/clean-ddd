//! `Note` is the aggregate root of the Notes context.
//!
//! Everything that can happen to a note goes through a method here, and every method enforces
//! the business rules before changing state:
//!
//! - a note always has a valid title (`NoteTitle` value object)
//! - only the owner can edit, archive, restore or share a note
//! - an archived note is read-only until it is restored: it can be neither edited nor shared
//!   (`ensure_active()`); archiving, restoring and reading it are not gated by that rule
//! - a note cannot be shared twice with the same account, nor with its owner
//!
//! The aggregate never touches persistence, logging or HTTP. It only knows business. It holds
//! its [`AggregateRoot`] in a private field, so its identity, its version and the facts it
//! records are reached through it and recorded by nobody else.

pub mod dtos;
pub mod events;
pub mod note_exceptions;
pub mod note_sharing;
pub mod note_status;
pub mod note_title;
pub mod ports;

use architecture_domain::{Aggregate, AggregateRoot, DomainResult, Entity, Id};

pub use dtos::{NewNote, NoteSnapshot};
pub use events::NoteEvent;
pub use note_sharing::NoteSharing;
pub use note_status::NoteStatus;
pub use note_title::NoteTitle;

use note_exceptions::{
    cannot_share_with_self, not_note_owner, note_already_archived, note_already_shared, note_archived,
    note_not_archived,
};

#[derive(Debug)]
pub struct Note {
    root: AggregateRoot<NoteEvent>,
    owner_id: Id,
    title: NoteTitle,
    content: String,
    status: NoteStatus,
    shared_with: Vec<String>, // raw ids, in the order they were added; the accessors speak Id
}

impl Entity for Note {
    fn id(&self) -> &Id {
        self.root.id()
    }
}

impl Aggregate for Note {
    type Event = NoteEvent;

    /// The facts recorded since the last pull; a command handler publishes them after saving.
    fn pull_domain_events(&mut self) -> Vec<NoteEvent> {
        self.root.pull_domain_events()
    }
}

impl Note {
    /// Writes a brand new note. This is the only way to bring a `Note` into existence. The
    /// aggregate picks its own identity, so no persistence round-trip is needed first.
    pub fn create(props: NewNote) -> DomainResult<Note> {
        let title = NoteTitle::create(&props.title)?;
        let id = Id::generate();
        let mut note = Note {
            root: AggregateRoot::new(id.clone(), 0),
            owner_id: Id::new(props.owner_id.clone()),
            title: title.clone(),
            content: props.content,
            status: NoteStatus::Active,
            shared_with: Vec::new(),
        };
        note.root.record(NoteEvent::Created {
            note_id: id.value().to_string(),
            owner_id: props.owner_id,
            title: title.value().to_string(),
        });
        Ok(note)
    }

    /// Rebuilds a `Note` from what was persisted. No event is recorded: nothing new happened.
    ///
    /// Persisted data has already been validated, so an invalid snapshot is a programming error
    /// and panics instead of returning a `DomainResult` (ADR 4). Trade-off to keep in mind: this
    /// re-runs today's `NoteTitle` rules on yesterday's data. If a rule gets stricter (say
    /// `MAX_LENGTH` shrinks), migrate existing notes before shipping it, or older notes will
    /// refuse to load.
    ///
    /// # Panics
    ///
    /// On a snapshot that breaks a rule of the aggregate: corrupted storage.
    pub fn from_snapshot(snapshot: NoteSnapshot) -> Note {
        let title = NoteTitle::create(&snapshot.title)
            .unwrap_or_else(|refusal| panic!("Corrupted note {}: {}", snapshot.id, refusal.message()));
        Note {
            root: AggregateRoot::new(Id::new(snapshot.id), snapshot.version),
            owner_id: Id::new(snapshot.owner_id),
            title,
            content: snapshot.content,
            status: snapshot.status,
            shared_with: snapshot.shared_with,
        }
    }

    pub fn edit(&mut self, editor_id: &Id, title: &str, content: &str) -> DomainResult {
        self.ensure_owner(editor_id)?;
        self.ensure_active()?;
        let title = NoteTitle::create(title)?;

        self.title = title;
        self.content = content.to_string();
        self.root.record(NoteEvent::Edited {
            note_id: self.id().value().to_string(),
            title: self.title.value().to_string(),
        });
        Ok(())
    }

    pub fn archive(&mut self, actor_id: &Id) -> DomainResult {
        self.ensure_owner(actor_id)?;
        if self.status == NoteStatus::Archived {
            return Err(note_already_archived(self.id().value()));
        }

        self.status = NoteStatus::Archived;
        self.root.record(NoteEvent::Archived {
            note_id: self.id().value().to_string(),
            title: self.title.value().to_string(),
            owner_id: self.owner_id.value().to_string(),
            recipient_ids: self.shared_with.clone(),
        });
        Ok(())
    }

    pub fn restore(&mut self, actor_id: &Id) -> DomainResult {
        self.ensure_owner(actor_id)?;
        if self.status != NoteStatus::Archived {
            return Err(note_not_archived(self.id().value()));
        }

        self.status = NoteStatus::Active;
        self.root.record(NoteEvent::Restored { note_id: self.id().value().to_string() });
        Ok(())
    }

    pub fn share_with(&mut self, actor_id: &Id, recipient_id: &Id) -> DomainResult {
        self.ensure_owner(actor_id)?;
        self.ensure_active()?;
        if recipient_id == &self.owner_id {
            return Err(cannot_share_with_self(self.id().value()));
        }
        if self.shared_with.iter().any(|id| id == recipient_id.value()) {
            return Err(note_already_shared(self.id().value(), recipient_id.value()));
        }

        self.shared_with.push(recipient_id.value().to_string());
        self.root.record(NoteEvent::Shared {
            note_id: self.id().value().to_string(),
            title: self.title.value().to_string(),
            owner_id: self.owner_id.value().to_string(),
            recipient_id: recipient_id.value().to_string(),
        });
        Ok(())
    }

    pub fn is_visible_to(&self, account_id: &Id) -> bool {
        &self.owner_id == account_id || self.shared_with.iter().any(|id| id == account_id.value())
    }

    /// The plain data to persist. `from_snapshot(note.to_snapshot())` gives back an equal note.
    pub fn to_snapshot(&self) -> NoteSnapshot {
        NoteSnapshot {
            id: self.id().value().to_string(),
            owner_id: self.owner_id.value().to_string(),
            title: self.title.value().to_string(),
            content: self.content.clone(),
            status: self.status,
            shared_with: self.shared_with.clone(),
            version: self.root.version(),
        }
    }

    /// The version this note was read at; the repository stores version + 1 (ADR 8).
    pub fn version(&self) -> u64 {
        self.root.version()
    }

    fn ensure_owner(&self, actor_id: &Id) -> DomainResult {
        if &self.owner_id != actor_id {
            return Err(not_note_owner(self.id().value(), actor_id.value()));
        }
        Ok(())
    }

    fn ensure_active(&self) -> DomainResult {
        if self.status == NoteStatus::Archived {
            return Err(note_archived(self.id().value()));
        }
        Ok(())
    }

    pub fn owner_id(&self) -> &Id {
        &self.owner_id
    }

    pub fn title(&self) -> &str {
        self.title.value()
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn status(&self) -> NoteStatus {
        self.status
    }

    pub fn shared_with(&self) -> &[String] {
        &self.shared_with
    }
}

#[cfg(test)]
mod tests {
    use super::note_exceptions::*;
    use super::*;

    fn owner() -> Id {
        Id::new("alice")
    }
    fn stranger() -> Id {
        Id::new("bob")
    }

    fn a_note() -> Note {
        let mut note =
            Note::create(NewNote { owner_id: "alice".into(), title: "Groceries".into(), content: "Milk, eggs".into() })
                .expect("a valid note");
        note.pull_domain_events();
        note
    }

    fn an_archived_note() -> Note {
        let mut note = a_note();
        note.archive(&owner()).expect("archivable");
        note.pull_domain_events();
        note
    }

    mod writing_a_note {
        use super::*;

        #[test]
        fn picks_its_own_identity_starts_active_unshared_and_records_note_created() {
            let mut note =
                Note::create(NewNote { owner_id: "alice".into(), title: "Groceries".into(), content: "Milk".into() })
                    .expect("a valid note");

            assert!(!note.id().value().is_empty());
            assert_eq!(note.status(), NoteStatus::Active);
            assert!(note.shared_with().is_empty());
            assert_eq!(
                note.pull_domain_events(),
                vec![NoteEvent::Created {
                    note_id: note.id().value().to_string(),
                    owner_id: "alice".into(),
                    title: "Groceries".into()
                }]
            );
        }

        #[test]
        fn gives_every_note_a_distinct_identity() {
            let first = Note::create(NewNote { owner_id: "alice".into(), title: "A".into(), content: "".into() });
            let second = Note::create(NewNote { owner_id: "alice".into(), title: "B".into(), content: "".into() });

            assert_ne!(first.expect("valid").id(), second.expect("valid").id());
        }

        #[test]
        fn refuses_a_blank_title() {
            let result = Note::create(NewNote { owner_id: "alice".into(), title: "".into(), content: "Milk".into() });

            assert!(result.expect_err("blank").is(BLANK_NOTE_TITLE));
        }
    }

    mod editing_a_note {
        use super::*;

        #[test]
        fn changes_title_and_content_and_records_note_edited() {
            let mut note = a_note();

            note.edit(&owner(), "Shopping", "Bread").expect("editable");

            assert_eq!(note.title(), "Shopping");
            assert_eq!(note.content(), "Bread");
            assert_eq!(
                note.pull_domain_events(),
                vec![NoteEvent::Edited { note_id: note.id().value().to_string(), title: "Shopping".into() }]
            );
        }

        #[test]
        fn is_reserved_to_the_owner() {
            let mut note = a_note();

            let result = note.edit(&stranger(), "Hacked", "");

            assert!(result.expect_err("not the owner").is(NOT_NOTE_OWNER));
            assert_eq!(note.title(), "Groceries");
        }

        #[test]
        fn is_refused_on_an_archived_note() {
            let mut note = an_archived_note();

            assert!(note.edit(&owner(), "Shopping", "Bread").expect_err("archived").is(NOTE_ARCHIVED));
        }

        #[test]
        fn keeps_the_previous_title_when_the_new_one_is_invalid() {
            let mut note = a_note();

            let result = note.edit(&owner(), "   ", "Bread");

            assert!(result.expect_err("blank").is(BLANK_NOTE_TITLE));
            assert_eq!(note.title(), "Groceries");
            assert_eq!(note.content(), "Milk, eggs");
        }
    }

    mod archiving_and_restoring {
        use super::*;

        #[test]
        fn archives_an_active_note_and_records_note_archived_with_who_had_access() {
            let mut note = a_note();
            note.share_with(&owner(), &stranger()).expect("shareable");
            note.pull_domain_events();

            note.archive(&owner()).expect("archivable");

            assert_eq!(note.status(), NoteStatus::Archived);
            assert_eq!(note.shared_with(), ["bob"]); // archiving changes nothing else: a restore gives the access back
            assert_eq!(
                note.pull_domain_events(),
                vec![NoteEvent::Archived {
                    note_id: note.id().value().to_string(),
                    title: "Groceries".into(),
                    owner_id: "alice".into(),
                    recipient_ids: vec!["bob".into()],
                }]
            );
        }

        #[test]
        fn cannot_archive_twice() {
            let mut note = an_archived_note();

            assert!(note.archive(&owner()).expect_err("twice").is(NOTE_ALREADY_ARCHIVED));
        }

        #[test]
        fn restores_an_archived_note_and_records_note_restored() {
            let mut note = an_archived_note();

            note.restore(&owner()).expect("restorable");

            assert_eq!(note.status(), NoteStatus::Active);
            assert_eq!(note.pull_domain_events(), vec![NoteEvent::Restored { note_id: note.id().value().to_string() }]);
        }

        #[test]
        fn cannot_restore_an_active_note() {
            let mut note = a_note();

            assert!(note.restore(&owner()).expect_err("active").is(NOTE_NOT_ARCHIVED));
        }

        #[test]
        fn is_reserved_to_the_owner() {
            let mut note = a_note();

            assert!(note.archive(&stranger()).expect_err("not the owner").is(NOT_NOTE_OWNER));
            assert_eq!(note.status(), NoteStatus::Active);
        }
    }

    mod sharing {
        use super::*;

        #[test]
        fn shares_with_another_account_and_records_note_shared() {
            let mut note = a_note();

            note.share_with(&owner(), &stranger()).expect("shareable");

            assert_eq!(note.shared_with(), ["bob"]);
            assert!(note.is_visible_to(&stranger()));
            assert_eq!(
                note.pull_domain_events(),
                vec![NoteEvent::Shared {
                    note_id: note.id().value().to_string(),
                    title: "Groceries".into(),
                    owner_id: "alice".into(),
                    recipient_id: "bob".into()
                }]
            );
        }

        #[test]
        fn cannot_share_with_yourself() {
            let mut note = a_note();

            assert!(note.share_with(&owner(), &owner()).expect_err("self").is(CANNOT_SHARE_WITH_SELF));
        }

        #[test]
        fn cannot_share_twice_with_the_same_account() {
            let mut note = a_note();
            note.share_with(&owner(), &stranger()).expect("once");

            assert!(note.share_with(&owner(), &stranger()).expect_err("twice").is(NOTE_ALREADY_SHARED));
            assert_eq!(note.shared_with(), ["bob"]);
        }

        #[test]
        fn cannot_share_an_archived_note() {
            let mut note = an_archived_note();

            assert!(note.share_with(&owner(), &stranger()).expect_err("archived").is(NOTE_ARCHIVED));
        }

        #[test]
        fn is_reserved_to_the_owner() {
            let mut note = a_note();

            assert!(note.share_with(&stranger(), &Id::new("carol")).expect_err("not the owner").is(NOT_NOTE_OWNER));
        }
    }

    mod persistence_round_trip {
        use super::*;

        #[test]
        fn rebuilds_the_full_state_from_a_snapshot_without_recording_any_event() {
            let mut note = Note::from_snapshot(NoteSnapshot {
                id: "note-9".into(),
                owner_id: "alice".into(),
                title: "Old".into(),
                content: "Text".into(),
                status: NoteStatus::Archived,
                shared_with: vec!["bob".into()],
                version: 7,
            });

            assert_eq!(note.id().value(), "note-9");
            assert_eq!(note.status(), NoteStatus::Archived);
            assert_eq!(note.shared_with(), ["bob"]);
            assert_eq!(note.version(), 7);
            assert_eq!(note.pull_domain_events(), vec![]);
        }

        #[test]
        fn gives_back_an_equal_note_after_to_snapshot_from_snapshot() {
            let mut note = a_note();
            note.share_with(&owner(), &stranger()).expect("shareable");

            let rebuilt = Note::from_snapshot(note.to_snapshot());

            assert!(rebuilt.equals(&note));
            assert_eq!(rebuilt.to_snapshot(), note.to_snapshot());
        }

        #[test]
        #[should_panic(expected = "Corrupted note n")]
        fn refuses_a_corrupted_snapshot() {
            Note::from_snapshot(NoteSnapshot {
                id: "n".into(),
                owner_id: "alice".into(),
                title: "".into(),
                content: "".into(),
                status: NoteStatus::Active,
                shared_with: vec![],
                version: 3,
            });
        }
    }
}
