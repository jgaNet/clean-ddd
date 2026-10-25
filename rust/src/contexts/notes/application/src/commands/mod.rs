//! The commands of the Notes context, one module per use case: the command (a named payload,
//! nothing more) and its handler. The handlers of one aggregate share the tests at the bottom,
//! since they share the fixtures.

pub mod archive_note;
pub mod create_note;
pub mod edit_note;
pub mod restore_note;
pub mod share_note;
pub mod suggest_note_title;

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_application::{
        Auth, CommandHandler, EventBus, EventHandler, EventSubscriber, ExecutionContext, ExecutionContextOptions,
    };
    use architecture_domain::{DomainResult, common_exceptions::NOT_ALLOWED};
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};
    use notes_domain::note::note_exceptions::{
        BLANK_NOTE_TITLE, NOT_NOTE_OWNER, NOTE_ARCHIVED, NOTE_NOT_ARCHIVED, NOTE_NOT_FOUND,
    };
    use notes_domain::note::ports::account_directory::AccountDirectory;
    use notes_domain::note::{NoteEvent, NoteSharing, NoteSnapshot, NoteStatus};
    use notes_infrastructure::repositories::InMemoryNoteRepository;

    use super::archive_note::{ArchiveNote, ArchiveNoteCommandHandler};
    use super::create_note::{CreateNote, CreateNoteCommandHandler};
    use super::edit_note::{EditNote, EditNoteCommandHandler};
    use super::restore_note::{RestoreNote, RestoreNoteCommandHandler};
    use super::share_note::{ShareNote, ShareNoteCommandHandler};

    /// Every account the tests talk about exists; the directory itself is covered by the domain service's tests.
    struct Everyone;
    impl AccountDirectory for Everyone {
        async fn exists(&self, account_id: &str) -> bool {
            ["alice", "bob", "carol"].contains(&account_id)
        }
    }

    /// The bus records the domain events the handlers publish, on the channels the tests watch.
    #[derive(Default)]
    struct Published(Mutex<Vec<NoteEvent>>);
    impl EventHandler for Published {
        type Event = NoteEvent;
        async fn execute(&self, event: NoteEvent, _: &ExecutionContext) -> DomainResult {
            self.0.lock().unwrap().push(event);
            Ok(())
        }
    }

    struct Fixture {
        store: Arc<InMemoryDataSource<NoteSnapshot>>,
        repository: Arc<InMemoryNoteRepository>,
        bus: Arc<InMemoryEventBus>,
        published: Arc<EventSubscriber<Published>>,
    }

    fn fixture() -> Fixture {
        let store = Arc::new(InMemoryDataSource::new());
        let bus = Arc::new(InMemoryEventBus::new());
        // Subscribed per channel: a new fact's name goes in this list, or `published()` stays
        // empty whatever the handler did, and an `is_empty()` assertion passes for nothing.
        let published = Arc::new(EventSubscriber(Published::default()));
        for channel in ["NoteCreated", "NoteShared", "NoteArchived"] {
            pollster::block_on(bus.subscribe(channel, published.clone()));
        }
        Fixture { repository: Arc::new(InMemoryNoteRepository::new(store.clone())), store, bus, published }
    }

    impl Fixture {
        fn context_for(&self, subject_id: Option<&str>, role: &str) -> ExecutionContext {
            ExecutionContext::new(ExecutionContextOptions {
                trace_id: "trace".into(),
                auth: Auth { subject_id: subject_id.map(str::to_string), role: Some(role.to_string()) },
                event_bus: self.bus.clone(),
                unit_of_work: None,
                logger: None,
            })
        }

        fn published(&self) -> Vec<NoteEvent> {
            self.published.0.0.lock().unwrap().clone()
        }

        fn a_note_owned_by(&self, owner_id: &str) -> String {
            let created = pollster::block_on(CreateNoteCommandHandler::new(self.repository.clone()).execute(
                CreateNote { title: "Groceries".into(), content: "Milk".into() },
                &self.context_for(Some(owner_id), "USER"),
            ))
            .expect("a valid note");
            self.published.0.0.lock().unwrap().clear();
            created
        }

        fn stored(&self, note_id: &str) -> NoteSnapshot {
            self.store.get(note_id).expect("stored")
        }
    }

    mod create_note {
        use super::*;

        #[test]
        fn saves_a_new_active_note_owned_by_the_caller_and_publishes_note_created() {
            let f = fixture();

            let note_id = pollster::block_on(CreateNoteCommandHandler::new(f.repository.clone()).execute(
                CreateNote { title: "Groceries".into(), content: "Milk".into() },
                &f.context_for(Some("alice"), "USER"),
            ))
            .expect("created");

            assert_eq!(
                f.stored(&note_id),
                NoteSnapshot {
                    id: note_id.clone(),
                    owner_id: "alice".into(),
                    title: "Groceries".into(),
                    content: "Milk".into(),
                    status: NoteStatus::Active,
                    shared_with: vec![],
                    version: 1,
                }
            );
            assert_eq!(
                f.published(),
                [NoteEvent::Created { note_id, owner_id: "alice".into(), title: "Groceries".into() }]
            );
        }

        #[test]
        fn refuses_a_blank_title_and_saves_nothing() {
            let f = fixture();

            let result = pollster::block_on(CreateNoteCommandHandler::new(f.repository.clone()).execute(
                CreateNote { title: "   ".into(), content: "Milk".into() },
                &f.context_for(Some("alice"), "USER"),
            ));

            assert!(result.expect_err("blank").is(BLANK_NOTE_TITLE));
            assert!(f.store.is_empty());
            assert!(f.published().is_empty());
        }

        #[test]
        fn refuses_an_anonymous_caller() {
            let f = fixture();

            let result = pollster::block_on(CreateNoteCommandHandler::new(f.repository.clone()).execute(
                CreateNote { title: "Groceries".into(), content: "Milk".into() },
                &f.context_for(None, "GUEST"),
            ));

            assert!(result.expect_err("anonymous").is(NOT_ALLOWED));
            assert!(f.store.is_empty());
        }
    }

    mod share_note {
        use super::*;

        fn handler(f: &Fixture) -> ShareNoteCommandHandler<InMemoryNoteRepository, Everyone> {
            ShareNoteCommandHandler::new(f.repository.clone(), NoteSharing::new(Everyone))
        }

        #[test]
        fn lets_the_owner_share_a_note_and_publishes_note_shared() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");

            pollster::block_on(handler(&f).execute(
                ShareNote { note_id: note_id.clone(), recipient_id: "bob".into() },
                &f.context_for(Some("alice"), "USER"),
            ))
            .expect("shared");

            assert_eq!(f.stored(&note_id).shared_with, ["bob"]);
            assert_eq!(
                f.published(),
                [NoteEvent::Shared {
                    note_id,
                    title: "Groceries".into(),
                    owner_id: "alice".into(),
                    recipient_id: "bob".into()
                }]
            );
        }

        #[test]
        fn refuses_a_caller_who_does_not_own_the_note() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");

            let result = pollster::block_on(handler(&f).execute(
                ShareNote { note_id: note_id.clone(), recipient_id: "carol".into() },
                &f.context_for(Some("bob"), "USER"),
            ));

            assert!(result.expect_err("not the owner").is(NOT_NOTE_OWNER));
            assert!(f.stored(&note_id).shared_with.is_empty());
            assert!(f.published().is_empty());
        }

        #[test]
        fn fails_on_an_unknown_note() {
            let f = fixture();

            let result = pollster::block_on(handler(&f).execute(
                ShareNote { note_id: "nope".into(), recipient_id: "bob".into() },
                &f.context_for(Some("alice"), "USER"),
            ));

            assert!(result.expect_err("unknown").is(NOTE_NOT_FOUND));
        }
    }

    mod archive_note {
        use super::*;

        #[test]
        fn archives_the_note_and_publishes_note_archived_with_who_had_access() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");
            pollster::block_on(ShareNoteCommandHandler::new(f.repository.clone(), NoteSharing::new(Everyone)).execute(
                ShareNote { note_id: note_id.clone(), recipient_id: "bob".into() },
                &f.context_for(Some("alice"), "USER"),
            ))
            .expect("shared");
            f.published.0.0.lock().unwrap().clear();

            pollster::block_on(
                ArchiveNoteCommandHandler::new(f.repository.clone())
                    .execute(ArchiveNote { note_id: note_id.clone() }, &f.context_for(Some("alice"), "USER")),
            )
            .expect("archived");

            assert_eq!(f.stored(&note_id).status, NoteStatus::Archived);
            assert_eq!(f.stored(&note_id).shared_with, ["bob"]);
            assert_eq!(
                f.published(),
                [NoteEvent::Archived {
                    note_id,
                    title: "Groceries".into(),
                    owner_id: "alice".into(),
                    recipient_ids: vec!["bob".into()],
                }]
            );
        }

        #[test]
        fn refuses_a_caller_who_does_not_own_the_note() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");

            let result = pollster::block_on(
                ArchiveNoteCommandHandler::new(f.repository.clone())
                    .execute(ArchiveNote { note_id: note_id.clone() }, &f.context_for(Some("bob"), "USER")),
            );

            assert!(result.expect_err("not the owner").is(NOT_NOTE_OWNER));
            assert_eq!(f.stored(&note_id).status, NoteStatus::Active);
            assert!(f.published().is_empty());
        }
    }

    mod edit_note {
        use super::*;

        #[test]
        fn lets_the_owner_change_title_and_content() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");

            pollster::block_on(EditNoteCommandHandler::new(f.repository.clone()).execute(
                EditNote { note_id: note_id.clone(), title: "Errands".into(), content: "Milk, bread".into() },
                &f.context_for(Some("alice"), "USER"),
            ))
            .expect("edited");

            let stored = f.stored(&note_id);
            assert_eq!((stored.title.as_str(), stored.content.as_str()), ("Errands", "Milk, bread"));
        }

        #[test]
        fn refuses_to_edit_an_archived_note() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");
            pollster::block_on(
                ArchiveNoteCommandHandler::new(f.repository.clone())
                    .execute(ArchiveNote { note_id: note_id.clone() }, &f.context_for(Some("alice"), "USER")),
            )
            .expect("archived");

            let result = pollster::block_on(EditNoteCommandHandler::new(f.repository.clone()).execute(
                EditNote { note_id: note_id.clone(), title: "Errands".into(), content: "Milk".into() },
                &f.context_for(Some("alice"), "USER"),
            ));

            assert!(result.expect_err("archived").is(NOTE_ARCHIVED));
            assert_eq!(f.stored(&note_id).title, "Groceries");
        }
    }

    mod restore_note {
        use super::*;

        #[test]
        fn restores_an_archived_note() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");
            pollster::block_on(
                ArchiveNoteCommandHandler::new(f.repository.clone())
                    .execute(ArchiveNote { note_id: note_id.clone() }, &f.context_for(Some("alice"), "USER")),
            )
            .expect("archived");

            pollster::block_on(
                RestoreNoteCommandHandler::new(f.repository.clone())
                    .execute(RestoreNote { note_id: note_id.clone() }, &f.context_for(Some("alice"), "USER")),
            )
            .expect("restored");

            assert_eq!(f.stored(&note_id).status, NoteStatus::Active);
        }

        #[test]
        fn refuses_to_restore_a_note_that_is_not_archived() {
            let f = fixture();
            let note_id = f.a_note_owned_by("alice");

            let result = pollster::block_on(
                RestoreNoteCommandHandler::new(f.repository.clone())
                    .execute(RestoreNote { note_id }, &f.context_for(Some("alice"), "USER")),
            );

            assert!(result.expect_err("active").is(NOTE_NOT_ARCHIVED));
        }
    }
}
