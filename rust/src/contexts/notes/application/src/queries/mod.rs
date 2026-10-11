//! The queries of the Notes context, one module per use case. A query reads its port and
//! nothing else: no sorting, no second port, no aggregate (ADR 5).

pub mod get_my_notes;
pub mod get_note;
pub mod get_notes_shared_with_me;

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use architecture_application::{Auth, ExecutionContext, ExecutionContextOptions, QueryHandler};
    use architecture_domain::{Entity, Id};
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};
    use notes_domain::note::note_exceptions::NOTE_NOT_FOUND;
    use notes_domain::note::ports::note_repository::NoteRepository;
    use notes_domain::note::{NewNote, Note};
    use notes_infrastructure::queries::InMemoryNoteQueries;
    use notes_infrastructure::repositories::InMemoryNoteRepository;

    use super::get_note::GetNoteQueryHandler;

    fn context_for(subject_id: &str) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of(subject_id, "USER"),
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        })
    }

    /// A note alice owns and shared with bob; carol has nothing to do with it.
    fn a_shared_note() -> (String, GetNoteQueryHandler<InMemoryNoteQueries>) {
        let store = Arc::new(InMemoryDataSource::new());
        let repository = InMemoryNoteRepository::new(store.clone());
        let mut note =
            Note::create(NewNote { owner_id: "alice".into(), title: "Groceries".into(), content: "Milk".into() })
                .expect("valid");
        note.share_with(&Id::new("alice"), &Id::new("bob")).expect("shared");
        pollster::block_on(repository.save(&note)).expect("saved");
        (note.id().value().to_string(), GetNoteQueryHandler::new(Arc::new(InMemoryNoteQueries::new(store))))
    }

    #[test]
    fn shows_a_note_to_its_owner_and_to_whom_it_was_shared_with() {
        let (note_id, handler) = a_shared_note();

        for reader in ["alice", "bob"] {
            let detail = pollster::block_on(handler.handle(note_id.clone(), &context_for(reader))).expect(reader);
            assert_eq!(detail.title, "Groceries");
        }
    }

    #[test]
    fn a_note_someone_else_owns_and_did_not_share_does_not_exist_as_far_as_you_know() {
        let (note_id, handler) = a_shared_note();

        let result = pollster::block_on(handler.handle(note_id, &context_for("carol")));

        assert!(result.expect_err("invisible").is(NOTE_NOT_FOUND));
    }
}
