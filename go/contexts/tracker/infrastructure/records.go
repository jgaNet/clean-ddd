package infrastructure

import (
	"clean-ddd/architecture/infrastructure"
	trackerapp "clean-ddd/contexts/tracker/application"
)

// InMemoryOperationRecords is the Records port over the in-memory store: a record in, a
// record out, keyed by the operation's id. The store keeps insertion order, which is the order
// the port promises.
type InMemoryOperationRecords struct {
	store *infrastructure.InMemoryDataSource[trackerapp.Record]
}

func NewInMemoryOperationRecords(store *infrastructure.InMemoryDataSource[trackerapp.Record]) *InMemoryOperationRecords {
	return &InMemoryOperationRecords{store: store}
}

func (r *InMemoryOperationRecords) Save(record trackerapp.Record) error {
	r.store.Set(record.ID, record)
	return nil
}

func (r *InMemoryOperationRecords) FindByID(id string) (*trackerapp.Record, error) {
	record, ok := r.store.Get(id)
	if !ok {
		return nil, nil
	}
	return &record, nil
}

func (r *InMemoryOperationRecords) FindAll() ([]trackerapp.Record, error) {
	return append([]trackerapp.Record{}, r.store.All()...), nil
}

func (r *InMemoryOperationRecords) FindByTrace(traceID string) ([]trackerapp.Record, error) {
	records := []trackerapp.Record{}
	for _, record := range r.store.All() {
		if record.TraceID == traceID {
			records = append(records, record)
		}
	}
	return records, nil
}
