//! The machine's time, read here and nowhere else (DOMAIN-ONE-CLOCK, ADR 42): the wiring passes
//! it to what needs a now. An application that moves time (a demo, a test server, an offset)
//! builds another [`Clock`] in its wiring and passes that one instead; the conventions check
//! refuses a read of the machine's time in any other file.

use std::sync::Arc;
use std::time::SystemTime;

use architecture_application::Clock;

/// The clock of the machine the application runs on.
pub fn system_clock() -> Clock {
    Arc::new(SystemTime::now)
}
