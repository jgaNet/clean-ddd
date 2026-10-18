//! The wiring of the Tracker context. Besides its module, it exports what the composition root
//! needs to make the application's bus a tracked one: the records, and the decorator over any bus.

use std::sync::Arc;

use architecture_application::{EventBus, Module, ModuleDefinition, query};
use architecture_infrastructure::InMemoryDataSource;
use tracker_application::queries::get_operation::GetOperationQueryHandler;
use tracker_application::queries::get_operations::GetOperationsQueryHandler;
use tracker_application::read_model::OperationRecord;
use tracker_infrastructure::{InMemoryOperationRecords, TrackedEventBus};

/// The context's store, which the composition root hands to the unit of work.
pub type OperationStore = Arc<InMemoryDataSource<OperationRecord>>;

pub fn operation_store() -> OperationStore {
    Arc::new(InMemoryDataSource::new())
}

pub fn operation_records(store: &OperationStore) -> Arc<InMemoryOperationRecords> {
    Arc::new(InMemoryOperationRecords::new(store.clone()))
}

/// The application's event bus: any bus, decorated so that every operation is recorded.
pub fn tracked_event_bus(bus: Arc<dyn EventBus>, records: Arc<InMemoryOperationRecords>) -> Arc<dyn EventBus> {
    Arc::new(TrackedEventBus::new(bus, records))
}

pub fn local_tracker_module(records: Arc<InMemoryOperationRecords>) -> Module {
    Module::new(ModuleDefinition {
        name: "Tracker",
        commands: vec![],
        queries: vec![
            query(GetOperationsQueryHandler::new(records.clone())),
            query(GetOperationQueryHandler::new(records)),
        ],
        domain_events: vec![],
        integration_events: vec![],
    })
}
