//! DOMAIN-ONE-CLOCK, where Rust can see it (ADR 42): an application has one now, the clock the
//! wiring passes, and nothing but the building blocks' system clock reads the machine's time. The
//! compiler refuses a forgotten time, since a domain method's time parameter has no default; this
//! check refuses a read of the machine: every `.rs` file of the tree is read, its tests left out
//! (a file under a `tests/` directory, and everything from `#[cfg(test)]` on), and a line that
//! reads the machine's time outside the system clock is named.

use std::fs;
use std::path::{Path, PathBuf};

use serde_yaml::Value as Yaml;

use super::{BINDING, text};

/// The one file that may read the machine's time, under the building blocks' tree.
const SYSTEM_CLOCK: &str = "infrastructure/src/clock.rs";

/// What reads the machine's time, as a path names it: called (`Utc::now()`) or passed (`SystemTime::now`).
const MACHINE_TIME: [&str; 5] =
    ["Utc::now", "SystemTime::now", "OffsetDateTime::now_utc", "OffsetDateTime::now_local", "Local::now"];

/// Every source file of the tree but the system clock and the tests, read: one problem per line that reads the machine's time.
pub fn check(binding: &Yaml, language_root: &Path, problems: &mut Vec<String>) {
    let system_clock = format!("{}/{SYSTEM_CLOCK}", text(&binding["architecture"]["path"]));
    let mut files = Vec::new();
    rust_files(&language_root.join("src"), &mut files);
    for file in files {
        let shown = file.strip_prefix(language_root).unwrap_or(&file).to_string_lossy().replace('\\', "/");
        if shown == system_clock {
            continue;
        }
        let source = fs::read_to_string(&file).unwrap_or_default();
        for (line, read) in machine_time(&source) {
            problems.push(format!(
                "DOMAIN-ONE-CLOCK: {shown}:{line} reads the machine's time ({read}); an application has one now: take a `Clock` (architecture-application) in the constructor of the handler, job or adapter that needs the time, pass `system_clock()` (architecture-infrastructure, {system_clock}) from the wiring, and give `(self.clock)()` to the behaviour, whose time parameter has no default; a test passes `fixed_clock(at)`; see {BINDING} and `yarn --cwd .. architecture rule DOMAIN-ONE-CLOCK`"
            ));
        }
    }
}

/// The lines of a source, its tests and comments left out, that read the machine's time:
/// `(line number, what it reads)`.
fn machine_time(source: &str) -> Vec<(usize, &'static str)> {
    let code = source.split("#[cfg(test)]").next().unwrap_or_default();
    let mut found = Vec::new();
    for (index, line) in code.lines().enumerate() {
        let line = line.split("//").next().unwrap_or_default();
        if let Some(read) = MACHINE_TIME.iter().find(|read| line.contains(*read)) {
            found.push((index + 1, *read));
        }
    }
    found
}

/// The `.rs` files under `dir`, in order, a `tests/` directory (an end-to-end suite) left out.
fn rust_files(dir: &Path, into: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut paths: Vec<_> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            if path.file_name().is_some_and(|name| name != "tests") {
                rust_files(&path, into);
            }
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            into.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_handler_that_takes_its_time_from_its_clock_is_left_alone() {
        let source = "impl CommandHandler for LoginCommandHandler {
    async fn execute(&self, command: Login, context: &ExecutionContext) -> DomainResult<LoggedIn> {
        account.authenticate((self.clock)())?;
        let at = DateTime::<Utc>::from((self.clock)());
        Ok(())
    }
}
";
        assert_eq!(machine_time(source), []);
    }

    #[test]
    fn a_read_of_the_machine_time_called_or_passed_is_named_with_its_line() {
        let source = "fn issue(&self) -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}
fn stamp() -> DateTime<Utc> {
    chrono::Utc::now()
}
fn clock() -> Clock {
    Arc::new(SystemTime::now)
}
fn local() -> DateTime<Local> { Local::now() }
fn offset() -> OffsetDateTime { OffsetDateTime::now_utc() }
";
        assert_eq!(
            machine_time(source),
            [
                (2, "SystemTime::now"),
                (5, "Utc::now"),
                (8, "SystemTime::now"),
                (10, "Local::now"),
                (11, "OffsetDateTime::now_utc")
            ]
        );
    }

    #[test]
    fn a_comment_or_a_test_that_reads_it_is_not_a_read() {
        let source = "//! Nothing here calls `Utc::now()`: the clock is passed.
fn decide(now: SystemTime) {} // not SystemTime::now either

#[cfg(test)]
mod tests {
    fn a_record() { let _ = Utc::now(); }
}
";
        assert_eq!(machine_time(source), []);
    }
}
