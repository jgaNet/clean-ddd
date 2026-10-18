//! The building blocks' Infrastructure: the in-memory adapters of the Application's ports — a
//! store, a bus, a unit of work — and the console logger. They are what a real database, a real
//! broker and a real log sink would stand in for, behind the same ports.

pub mod data_sources;
pub mod event_bus;
pub mod logging;
pub mod unit_of_work;

pub use data_sources::InMemoryDataSource;
pub use event_bus::InMemoryEventBus;
pub use logging::ConsoleLogger;
pub use unit_of_work::InMemoryUnitOfWork;
