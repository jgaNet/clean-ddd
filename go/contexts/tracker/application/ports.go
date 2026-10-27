package application

// Records is the store of the projection. Unlike an aggregate repository it is written by the
// projection and read by the queries through the same interface: a read model has no
// invariants to protect, so there is nothing to gain from splitting it.
type Records interface {
	// Save stores the record under its id, replacing the one already there.
	Save(record Record) error
	// FindByID answers nil, nil for an unknown id.
	FindByID(id string) (*Record, error)
	// FindAll lists every record, in the order they were first saved.
	FindAll() ([]Record, error)
	// FindByTrace lists the records of one trace, in the order they were first saved.
	FindByTrace(traceID string) ([]Record, error)
}
