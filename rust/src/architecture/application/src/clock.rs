//! An application's now (DOMAIN-ONE-CLOCK, ADR 42): a function the wiring builds once and passes
//! to whatever decides or records a time — a handler, a job, an adapter, the bus — which hands
//! `clock()` to the domain as a parameter. A domain method's time parameter has no default, so a
//! forgotten time does not compile instead of deciding on another now than the code beside it.
//! The system clock, the one place that reads the machine, is in the building blocks'
//! Infrastructure (`system_clock()`); a test passes a fixed one.

use std::sync::Arc;
use std::time::SystemTime;

/// What answers the time: shared by everything the wiring hands it to.
pub type Clock = Arc<dyn Fn() -> SystemTime + Send + Sync>;

/// A clock that always answers `at`: what a test, or a demo that stops time, passes.
pub fn fixed_clock(at: SystemTime) -> Clock {
    Arc::new(move || at)
}
