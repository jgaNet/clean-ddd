//! A contract test: the expectations belong to the ports, so every adapter of a port runs the
//! same ones. Add an adapter (a SQLite one, say) by adding an entry to `adapters()`; if it
//! passes here, the use cases will not notice the change. The repository and the queries are
//! tested together because they are two views of one store: what the repository saves is what
//! the queries must show.

use std::sync::Arc;

use architecture_domain::{Entity, Id, common_exceptions::CONCURRENCY_CONFLICT};
use architecture_infrastructure::InMemoryDataSource;
use notes_domain::note::ports::note_queries::{NoteDetail, NoteListItem, NoteQueries, SharedNoteListItem};
use notes_domain::note::ports::note_repository::NoteRepository;
use notes_domain::note::{NewNote, Note, NoteStatus};

use crate::queries::InMemoryNoteQueries;
use crate::repositories::InMemoryNoteRepository;

/// Opens one adapter of the two ports, fresh for each case.
type Open = Box<dyn Fn() -> (Box<dyn Persistence>, Box<dyn Reads>)>;

/// One adapter of the two ports.
struct Adapter {
    name: &'static str,
    repository: Open,
}

/// The ports, through `dyn`, so that every adapter is driven by the same code.
trait Persistence {
    fn find_by_id(&self, id: &str) -> Option<Note>;
    fn save(&self, note: &Note) -> architecture_domain::DomainResult;
}
trait Reads {
    fn find_by_id(&self, note_id: &str) -> Option<NoteDetail>;
    fn find_by_owner(&self, owner_id: &str) -> Vec<NoteListItem>;
    fn find_shared_with(&self, account_id: &str) -> Vec<SharedNoteListItem>;
}
impl<R: NoteRepository> Persistence for R {
    fn find_by_id(&self, id: &str) -> Option<Note> {
        pollster::block_on(NoteRepository::find_by_id(self, id))
    }
    fn save(&self, note: &Note) -> architecture_domain::DomainResult {
        pollster::block_on(NoteRepository::save(self, note))
    }
}
impl<Q: NoteQueries> Reads for Q {
    fn find_by_id(&self, note_id: &str) -> Option<NoteDetail> {
        pollster::block_on(NoteQueries::find_by_id(self, note_id))
    }
    fn find_by_owner(&self, owner_id: &str) -> Vec<NoteListItem> {
        pollster::block_on(NoteQueries::find_by_owner(self, owner_id))
    }
    fn find_shared_with(&self, account_id: &str) -> Vec<SharedNoteListItem> {
        pollster::block_on(NoteQueries::find_shared_with(self, account_id))
    }
}

fn adapters() -> Vec<Adapter> {
    vec![Adapter {
        name: "in memory",
        repository: Box::new(|| {
            let store = Arc::new(InMemoryDataSource::new());
            (Box::new(InMemoryNoteRepository::new(store.clone())), Box::new(InMemoryNoteQueries::new(store)))
        }),
    }]
}

fn a_note(owner_id: &str, title: &str, content: &str) -> Note {
    Note::create(NewNote { owner_id: owner_id.into(), title: title.into(), content: content.into() }).expect("valid")
}

/// Runs one case over every adapter; a failure names the adapter it failed on.
fn for_each_adapter(case: impl Fn(&dyn Persistence, &dyn Reads)) {
    for adapter in adapters() {
        let (repository, queries) = (adapter.repository)();
        let outcome =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| case(repository.as_ref(), queries.as_ref())));
        assert!(outcome.is_ok(), "the {} adapter breaks the persistence contract", adapter.name);
    }
}

#[test]
fn gives_back_an_equal_aggregate() {
    for_each_adapter(|repository, _| {
        let mut note = a_note("alice", "Groceries", "milk");
        note.share_with(&Id::new("alice"), &Id::new("bob")).expect("shared");
        repository.save(&note).expect("saved");

        let found = repository.find_by_id(note.id().value()).expect("found");
        let mut expected = note.to_snapshot();
        expected.version = note.version() + 1;
        assert_eq!(found.to_snapshot(), expected);
    });
}

#[test]
fn stores_version_plus_one_on_every_save_and_refuses_an_aggregate_no_longer_at_the_stored_version() {
    for_each_adapter(|repository, _| {
        let note = a_note("alice", "Shared draft", "");
        assert_eq!(note.version(), 0);
        repository.save(&note).expect("saved");

        // Two writers read the same version.
        let mut mine = repository.find_by_id(note.id().value()).expect("mine");
        let mut theirs = repository.find_by_id(note.id().value()).expect("theirs");
        assert_eq!(mine.version(), 1);

        mine.edit(&Id::new("alice"), "Mine", "first").expect("edited");
        repository.save(&mine).expect("first wins");

        theirs.edit(&Id::new("alice"), "Theirs", "second").expect("edited");
        let refused = repository.save(&theirs).expect_err("second loses");
        assert!(refused.is(CONCURRENCY_CONFLICT));

        let stored = repository.find_by_id(note.id().value()).expect("stored");
        assert_eq!(stored.title(), "Mine");
        assert_eq!(stored.version(), 2);
    });
}

#[test]
fn answers_nothing_for_an_unknown_id() {
    for_each_adapter(|repository, queries| {
        assert!(repository.find_by_id("nobody").is_none());
        assert!(queries.find_by_id("nobody").is_none());
    });
}

#[test]
fn saving_again_replaces_it_does_not_duplicate() {
    for_each_adapter(|repository, queries| {
        let note = a_note("alice", "Draft", "");
        repository.save(&note).expect("saved");
        // As a handler does: read it back, change it, save it; the instance saved before is stale.
        let mut reread = repository.find_by_id(note.id().value()).expect("reread");
        reread.edit(&Id::new("alice"), "Final", "done").expect("edited");
        reread.archive(&Id::new("alice")).expect("archived");
        repository.save(&reread).expect("saved again");

        let found = repository.find_by_id(note.id().value()).expect("found");
        assert_eq!(found.title(), "Final");
        assert_eq!(found.status(), NoteStatus::Archived);
        assert_eq!(queries.find_by_owner("alice").len(), 1);
    });
}

#[test]
fn rebuilds_without_recording_events() {
    for_each_adapter(|repository, _| {
        let note = a_note("alice", "Quiet", "");
        repository.save(&note).expect("saved");

        let mut found = repository.find_by_id(note.id().value()).expect("found");
        assert!(architecture_domain::Aggregate::pull_domain_events(&mut found).is_empty());
    });
}

#[test]
fn shows_the_detail_of_a_saved_note() {
    for_each_adapter(|repository, queries| {
        let mut note = a_note("alice", "Groceries", "milk");
        note.share_with(&Id::new("alice"), &Id::new("bob")).expect("shared");
        repository.save(&note).expect("saved");

        assert_eq!(
            queries.find_by_id(note.id().value()),
            Some(NoteDetail {
                id: note.id().value().to_string(),
                title: "Groceries".into(),
                status: NoteStatus::Active,
                owner_id: "alice".into(),
                content: "milk".into(),
                shared_with: vec!["bob".into()],
            })
        );
    });
}

#[test]
fn lists_an_owners_notes_and_only_theirs_in_the_order_they_were_saved() {
    for_each_adapter(|repository, queries| {
        let first = a_note("alice", "First", "");
        let second = a_note("alice", "Second", "");
        repository.save(&first).expect("saved");
        repository.save(&a_note("bob", "Not hers", "")).expect("saved");
        repository.save(&second).expect("saved");

        assert_eq!(
            queries.find_by_owner("alice"),
            [
                NoteListItem { id: first.id().value().to_string(), title: "First".into(), status: NoteStatus::Active },
                NoteListItem {
                    id: second.id().value().to_string(),
                    title: "Second".into(),
                    status: NoteStatus::Active
                },
            ]
        );
        assert!(queries.find_by_owner("nobody").is_empty());
    });
}

#[test]
fn lists_the_notes_shared_with_an_account_whoever_owns_them() {
    for_each_adapter(|repository, queries| {
        let mut shared = a_note("alice", "Shared", "for bob");
        shared.share_with(&Id::new("alice"), &Id::new("bob")).expect("shared");
        let kept = a_note("alice", "Kept", "");
        repository.save(&shared).expect("saved");
        repository.save(&kept).expect("saved");

        assert_eq!(
            queries.find_shared_with("bob"),
            [SharedNoteListItem {
                id: shared.id().value().to_string(),
                title: "Shared".into(),
                content: "for bob".into(),
                owner_id: "alice".into(),
            }]
        );
        assert!(queries.find_shared_with("alice").is_empty());
    });
}
