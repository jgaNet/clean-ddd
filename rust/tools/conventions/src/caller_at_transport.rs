//! API-CALLER-AT-TRANSPORT, where Rust can see it (ADR 39, H4): a context's presentation crate
//! publishes a command and answers `202` through `accept(&context, &module, command)` and nothing
//! else, since `accept()` is where a caller who is not signed in is refused with `401` before
//! anything is published. A route that dispatches on the bus, builds an operation, or answers `202`
//! by itself would skip that refusal; this check reads each presentation crate of the contexts and
//! names the line. The building blocks' presentation crate, where `accept()` lives, is not a
//! context's, and is not read. The shared scenario holds the rule from outside, in every language.

use std::fs;
use std::path::Path;

use serde_yaml::Value as Yaml;

use super::{BINDING, strings, text};

/// What a route writes when it publishes or answers `202` by itself, and how the problem names it.
const BY_ITSELF: [(&str, &str); 8] = [
    (".dispatch(", "dispatches on the bus"),
    (".publish(", "publishes on the bus"),
    (".publish_with_id(", "publishes on the bus"),
    ("Operation::new(", "builds an operation"),
    ("Operation::with_id(", "builds an operation"),
    ("StatusCode::ACCEPTED", "answers 202"),
    ("from_u16(202)", "answers 202"),
    ("Accepted {", "answers 202"),
];

/// Every context's presentation crate, read: one problem per line that publishes or answers `202` by itself.
pub fn check(binding: &Yaml, language_root: &Path, problems: &mut Vec<String>) {
    let contexts_path = text(&binding["contexts_tree"]["path"]);
    for context in strings(&binding["contexts"]) {
        let crate_path = format!("{contexts_path}/{}/presentation/src", context.to_lowercase());
        let mut files = Vec::new();
        rust_files(&language_root.join(&crate_path), &mut files);
        for file in files {
            let source = fs::read_to_string(&file).unwrap_or_default();
            let shown = file.strip_prefix(language_root).unwrap_or(&file).to_string_lossy().replace('\\', "/");
            for (line, what) in by_itself(&source) {
                problems.push(format!(
                    "API-CALLER-AT-TRANSPORT: {shown}:{line} {what} by itself; a route publishes a command and answers 202 only through `accept(&context, &module, command)` (architecture-presentation), which refuses a caller who is not signed in with 401 first, and a command anyone may ask for says so on its handler (`anyone_may_ask()`); see {BINDING} and `yarn --cwd .. architecture rule API-CALLER-AT-TRANSPORT`"
                ));
            }
        }
    }
}

/// The lines of a source, its tests and comments left out, that publish or answer `202` by
/// themselves: `(line number, what it does)`.
fn by_itself(source: &str) -> Vec<(usize, &'static str)> {
    let code = source.split("#[cfg(test)]").next().unwrap_or_default();
    let mut found = Vec::new();
    for (index, line) in code.lines().enumerate() {
        let line = line.split("//").next().unwrap_or_default();
        if let Some((_, what)) = BY_ITSELF.iter().find(|(needle, _)| line.contains(needle)) {
            found.push((index + 1, *what));
        }
    }
    found
}

fn rust_files(dir: &Path, into: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut paths: Vec<_> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            rust_files(&path, into);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            into.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_route_that_goes_through_accept_is_left_alone() {
        let route = "async fn archive_note(State(module): State<Arc<Module>>, Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, &module, ArchiveNote { note_id: id }).into_response()
}
";
        assert_eq!(by_itself(route), []);
    }

    #[test]
    fn a_route_that_publishes_or_answers_202_by_itself_is_named_with_its_line() {
        let route = "async fn archive_note(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    let operation = context.publish(ArchiveNote { note_id: id }).await;
    (StatusCode::ACCEPTED, Json(Accepted { operation_id: operation.id().to_string() })).into_response()
}

async fn restore_note(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    let operation = Operation::new(Arc::new(RestoreNote { note_id: id }), context.clone());
    context.event_bus().dispatch(operation).await;
    StatusCode::from_u16(202).unwrap().into_response()
}
";
        assert_eq!(
            by_itself(route),
            [
                (2, "publishes on the bus"),
                (3, "answers 202"),
                (7, "builds an operation"),
                (8, "dispatches on the bus"),
                (9, "answers 202")
            ]
        );
    }

    #[test]
    fn a_comment_or_a_test_that_names_them_is_not_a_route() {
        let source = "//! A route never writes `StatusCode::ACCEPTED` itself: accept() does.
fn refuse() {} // not .publish( either

#[cfg(test)]
mod tests {
    fn forged() { let _ = StatusCode::ACCEPTED; }
}
";
        assert_eq!(by_itself(source), []);
    }
}
