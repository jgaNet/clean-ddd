//! The readers, challenged with unusual shapes: recognised, or caught, never silent.
//!
//! The readers recognise the canonical shapes the guides teach, and no other — by design: a
//! reading that guessed at every way a command could be built would be a second guide, drifting
//! from the first. What that stance costs is a shape a reader does not see, and the question that
//! matters is whether such a shape can stay silent. These probes write unusual but valid shapes
//! into a copy of the tree and ask what the checks say: the command is still read as the
//! committed inventory expects (recognised), or the copy is refused — by the inventory held equal
//! to the other languages (ARCH-ONE-APPLICATION), or by the one-handler rule (ARCH-ONE-HANDLER).
//! A probe that is neither is a false negative, and fails here; a reader that starts recognising
//! a shape moves its probe to "recognised", which is a change to the guides as much as to the
//! tool. The TypeScript tool holds the same probes (`tools/src/shapes.spec.ts`).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use super::{BINDING, inventory, repository_root, yaml};

const PRESENTATION: &str = "rust/src/contexts/notes/presentation/src/lib.rs";
const WIRING: &str = "rust/src/contexts/notes/wiring/src/lib.rs";
const HANDLER: &str = "rust/src/contexts/notes/application/src/commands/share_note.rs";
const COMMANDS: &str = "rust/src/contexts/notes/application/src/commands/mod.rs";

const SHARE_USED: &str = "use notes_application::commands::share_note::ShareNote;";
const SHARE_BUILT: &str = "accept(&context, ShareNote { note_id: id, recipient_id: body.recipient_id })";
const SHARE_LISTED: &str =
    "Subscription::command(ShareNoteCommandHandler::new(repository.clone(), NoteSharing::new(accounts))),";
const MODULE_BUILT: &str = "    Module::new(ModuleDefinition {";

#[derive(Debug, PartialEq)]
struct Verdict {
    /// The copy's inventory says what the committed one says, and every command has its one handler.
    recognised: bool,
    /// What refused the copy, when something did.
    caught: Vec<String>,
}

impl Verdict {
    fn about(&self, rule: &str) -> Vec<&str> {
        self.caught.iter().map(String::as_str).filter(|line| line.starts_with(&format!("{rule}:"))).collect()
    }
}

/// A copy of the repository's tree in a directory of its own, removed when dropped.
struct Copy(PathBuf);

impl Drop for Copy {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap_or_else(|error| panic!("cannot create {}: {error}", to.display()));
    for entry in fs::read_dir(from).unwrap_or_else(|error| panic!("cannot read {}: {error}", from.display())) {
        let entry = entry.expect("a directory entry");
        let (source, target) = (entry.path(), to.join(entry.file_name()));
        if source.is_dir() {
            if entry.file_name() != "target" {
                copy_dir(&source, &target);
            }
        } else {
            fs::copy(&source, &target).unwrap_or_else(|error| panic!("cannot copy {}: {error}", source.display()));
        }
    }
}

/// Where each copy goes: one directory per probe, so the probes run side by side.
fn new_copy() -> Copy {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "clean-ddd-shape-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&dir);
    Copy(dir)
}

/// `text` with `from` replaced by `to`; a `from` that does not occur exactly once is a probe that
/// no longer writes the shape it names, and stops it.
fn mutate(file: &str, text: &str, from: &str, to: &str) -> String {
    let found = text.matches(from).count();
    assert!(found == 1, "{file} does not contain exactly once ({found} times): {from}");
    text.replacen(from, to, 1)
}

/// A copy of the tree with one unusual shape written into it, and what the checks say of it. Each
/// edit is `(file, from, to)`, and `from` must occur in the file exactly once.
fn probe(edits: &[(&str, &str, &str)]) -> Verdict {
    let root = repository_root(Path::new(env!("CARGO_MANIFEST_DIR"))).expect("the repository root");
    let copy = new_copy();
    for dir in ["conventions", "docs/inventory", "rust/src"] {
        copy_dir(&root.join(dir), &copy.0.join(dir));
    }
    for (file, from, to) in edits {
        let path = copy.0.join(file);
        let text = fs::read_to_string(&path).unwrap_or_else(|error| panic!("cannot read {file}: {error}"));
        fs::write(&path, mutate(file, &text, from, to)).unwrap_or_else(|error| panic!("cannot write {file}: {error}"));
    }

    let binding = yaml(&copy.0.join(BINDING));
    let language_root = copy.0.join("rust");
    let mut caught = Vec::new();
    inventory::check(&copy.0, &inventory::inspect(&binding, &language_root), &mut caught);
    inventory::check_handlers(&binding, &language_root, &mut caught);
    Verdict { recognised: caught.is_empty(), caught }
}

/// The verdict of a shape a reader does not see: something refused it, never silence.
fn assert_caught(verdict: &Verdict) {
    assert!(!verdict.recognised && !verdict.caught.is_empty(), "neither recognised nor caught: {verdict:?}");
}

/// What the check says differs, after its own line that the inventory is no longer current.
fn inventory_differences(verdict: &Verdict) -> Vec<&str> {
    let lines = verdict.about("ARCH-ONE-APPLICATION");
    assert_eq!(lines.first().copied(), Some(STALE), "{verdict:?}");
    lines[1..].iter().map(|line| line.trim_start_matches("ARCH-ONE-APPLICATION: ")).collect()
}

const STALE: &str = "ARCH-ONE-APPLICATION: docs/inventory/rust.json differs from what the Rust tree says; run `cargo run -p conventions -- inventory --write`";
/// ShareNote read without the route that carries it: the route reading did not resolve the command built.
const ROUTE_LOST: &str = "Notes: the command ShareNote differs: route \"POST /notes/{param}/share\" → none";
/// ShareNote missing from the commands: the wiring reading did not see it listed, or did not resolve its handler.
const NOT_LISTED: &str = "Notes: the committed inventory has the command ShareNote, the tree no longer says it";
/// The one-handler rule, on ShareNote: built by the route, answered by no handler the Module lists.
const SHARE_UNANSWERED: &str =
    "ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it";

#[test]
fn the_tree_as_it_is_every_shape_recognised_nothing_caught() {
    assert_eq!(probe(&[]), Verdict { recognised: true, caught: vec![] });
}

#[test]
#[should_panic(expected = "does not contain exactly once (0 times)")]
fn a_replacement_that_matches_nothing_stops_the_probe() {
    mutate(WIRING, "Subscription::command(A)", "Subscription::command(B", "");
}

#[test]
#[should_panic(expected = "does not contain exactly once (2 times)")]
fn a_replacement_that_matches_twice_stops_the_probe() {
    mutate(WIRING, "Subscription::command(A), Subscription::command(B)", "Subscription::command(", "");
}

#[test]
fn a_handler_struct_named_for_its_use_case_is_recognised_the_command_is_its_type_command() {
    let verdict = probe(&[
        (HANDLER, "pub struct ShareNoteCommandHandler<", "pub struct ShareNoteUseCase<"),
        (
            HANDLER,
            "impl<R, D: AccountDirectory> ShareNoteCommandHandler<R, D> {",
            "impl<R, D: AccountDirectory> ShareNoteUseCase<R, D> {",
        ),
        (HANDLER, "CommandHandler for ShareNoteCommandHandler<R, D>", "CommandHandler for ShareNoteUseCase<R, D>"),
        (WIRING, "share_note::ShareNoteCommandHandler;", "share_note::ShareNoteUseCase;"),
        (WIRING, "Subscription::command(ShareNoteCommandHandler::new(", "Subscription::command(ShareNoteUseCase::new("),
        (COMMANDS, "{ShareNote, ShareNoteCommandHandler}", "{ShareNote, ShareNoteUseCase}"),
        (
            COMMANDS,
            "-> ShareNoteCommandHandler<InMemoryNoteRepository, Everyone>",
            "-> ShareNoteUseCase<InMemoryNoteRepository, Everyone>",
        ),
        (COMMANDS, "            ShareNoteCommandHandler::new(", "            ShareNoteUseCase::new("),
    ]);
    assert_eq!(verdict, Verdict { recognised: true, caught: vec![] });
}

#[test]
fn a_command_built_through_a_use_as_alias_is_recognised_the_alias_followed_in_its_file() {
    let verdict = probe(&[
        (PRESENTATION, SHARE_USED, "use notes_application::commands::share_note::ShareNote as Share;"),
        (PRESENTATION, SHARE_BUILT, "accept(&context, Share { note_id: id, recipient_id: body.recipient_id })"),
    ]);
    assert_eq!(verdict, Verdict { recognised: true, caught: vec![] });
}

#[test]
fn a_command_built_through_a_type_alias_loses_its_route_caught_by_the_inventory_never_named_share() {
    let verdict = probe(&[
        (PRESENTATION, SHARE_BUILT, "accept(&context, Share { note_id: id, recipient_id: body.recipient_id })"),
        (PRESENTATION, "async fn share_note(", "type Share = ShareNote;\n\nasync fn share_note("),
    ]);
    assert_caught(&verdict);
    assert_eq!(inventory_differences(&verdict), [ROUTE_LOST]);
    // `Share` resolves to no command type, so no route builds one: nothing for the one-handler rule to name.
    assert_eq!(verdict.about("ARCH-ONE-HANDLER"), Vec::<&str>::new());
}

#[test]
fn a_command_built_by_a_helper_the_route_calls_loses_its_route_caught_by_the_inventory_never_named_share() {
    let verdict = probe(&[
        (PRESENTATION, SHARE_BUILT, "accept(&context, share(id, body.recipient_id))"),
        (
            PRESENTATION,
            "async fn share_note(",
            "fn share(note_id: String, recipient_id: String) -> ShareNote {\n    ShareNote { note_id, recipient_id }\n}\n\nasync fn share_note(",
        ),
    ]);
    assert_caught(&verdict);
    assert_eq!(inventory_differences(&verdict), [ROUTE_LOST]);
    // `share` is a function, no command type: the route builds nothing the one-handler rule could name.
    assert_eq!(verdict.about("ARCH-ONE-HANDLER"), Vec::<&str>::new());
}

#[test]
fn a_subscription_taken_from_a_let_binding_is_not_listed_caught_by_the_inventory_and_arch_one_handler() {
    let verdict = probe(&[
        (WIRING, SHARE_LISTED, "share,"),
        (
            WIRING,
            MODULE_BUILT,
            "    let share =\n        Subscription::command(ShareNoteCommandHandler::new(repository.clone(), NoteSharing::new(accounts)));\n\n    Module::new(ModuleDefinition {",
        ),
    ]);
    assert_caught(&verdict);
    assert_eq!(inventory_differences(&verdict), [NOT_LISTED]);
    assert_eq!(verdict.about("ARCH-ONE-HANDLER"), [SHARE_UNANSWERED]);
}

#[test]
fn a_handler_built_by_a_factory_is_not_read_caught_by_the_inventory_and_arch_one_handler() {
    let verdict = probe(&[
        (WIRING, SHARE_LISTED, "Subscription::command(share_handler(repository.clone(), accounts)),"),
        (
            WIRING,
            "/// The Notes module for the local environment",
            "fn share_handler<D: AccountDirectory>(\n    repository: Arc<InMemoryNoteRepository>,\n    accounts: D,\n) -> ShareNoteCommandHandler<InMemoryNoteRepository, D> {\n    ShareNoteCommandHandler::new(repository, NoteSharing::new(accounts))\n}\n\n/// The Notes module for the local environment",
        ),
    ]);
    assert_caught(&verdict);
    // `share_handler` is a function, no type that `impl CommandHandler`: the entry is not read as a command.
    assert_eq!(inventory_differences(&verdict), [NOT_LISTED]);
    assert_eq!(verdict.about("ARCH-ONE-HANDLER"), [SHARE_UNANSWERED]);
}

#[test]
fn a_command_re_exported_under_another_name_is_recognised_the_re_export_followed() {
    let verdict = probe(&[
        (
            COMMANDS,
            "pub mod suggest_note_title;\n",
            "pub mod suggest_note_title;\n\npub use share_note::ShareNote as ShareRequest;\n",
        ),
        (PRESENTATION, SHARE_USED, "use notes_application::commands::ShareRequest;"),
        (PRESENTATION, SHARE_BUILT, "accept(&context, ShareRequest { note_id: id, recipient_id: body.recipient_id })"),
    ]);
    assert_eq!(verdict, Verdict { recognised: true, caught: vec![] });
}
