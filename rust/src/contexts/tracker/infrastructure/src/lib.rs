//! The Infrastructure layer of the Tracker context: where the records live, and the decorator
//! that fills them from the bus.

pub mod records;
pub mod tracked_event_bus;

pub use records::InMemoryOperationRecords;
pub use tracked_event_bus::TrackedEventBus;
