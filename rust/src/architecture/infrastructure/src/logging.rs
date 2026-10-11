//! The Logger port on the console. Each line starts with the trace id, so the lines of one
//! request can be grepped together. The only place in the project allowed to write to the
//! console: the workspace denies `print_stdout` and `print_stderr` everywhere else.

#![allow(clippy::print_stdout, clippy::print_stderr)]

use architecture_application::Logger;

pub struct ConsoleLogger {
    debug: bool,
}

impl ConsoleLogger {
    pub fn new(debug: bool) -> Self {
        Self { debug }
    }

    fn line(color: &str, level: &str, trace_id: &str, message: &str) -> String {
        format!("\x1b[{color};20m[{trace_id}] [{level}] {message}\x1b[0m")
    }
}

impl Logger for ConsoleLogger {
    fn info(&self, trace_id: &str, message: &str) {
        println!("{}", Self::line("36", "INFO ", trace_id, message));
    }

    fn warn(&self, trace_id: &str, message: &str) {
        eprintln!("{}", Self::line("33", "WARN ", trace_id, message));
    }

    fn error(&self, trace_id: &str, message: &str, error: &str) {
        eprintln!("{} {error}", Self::line("91", "ERROR", trace_id, message));
    }

    fn debug(&self, trace_id: &str, message: &str) {
        if self.debug {
            println!("{}", Self::line("35", "DEBUG", trace_id, message));
        }
    }
}
