//! The in-memory store of the projection: one record per operation id, in the order they were
//! first recorded.

use std::sync::Arc;

use architecture_infrastructure::InMemoryDataSource;
use tracker_application::ports::OperationRecords;
use tracker_application::read_model::OperationRecord;

pub struct InMemoryOperationRecords {
    store: Arc<InMemoryDataSource<OperationRecord>>,
}

impl InMemoryOperationRecords {
    pub fn new(store: Arc<InMemoryDataSource<OperationRecord>>) -> Self {
        Self { store }
    }
}

impl OperationRecords for InMemoryOperationRecords {
    async fn save(&self, record: OperationRecord) {
        self.store.set(&record.id.clone(), record);
    }

    async fn find_by_id(&self, id: &str) -> Option<OperationRecord> {
        self.store.get(id)
    }

    async fn find_all(&self) -> Vec<OperationRecord> {
        self.store.all()
    }

    async fn find_by_trace_id(&self, trace_id: &str) -> Vec<OperationRecord> {
        self.store.all().into_iter().filter(|record| record.trace_id == trace_id).collect()
    }
}
