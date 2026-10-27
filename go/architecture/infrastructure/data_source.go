package infrastructure

import "sync"

// InMemoryDataSource is a map used as a database. Repositories and queries of a context share
// one instance, which is all the "persistence" this reference needs: the ports they implement
// are what a real database adapter would implement instead. It keeps insertion order, which is
// the order the queries promise, and registers itself so the in-memory unit of work can
// snapshot every store of the process when a transaction begins and put them back on a
// rollback. A database would keep that undo log itself; here the store does.
type InMemoryDataSource[M any] struct {
	mu    sync.RWMutex
	keys  []string
	items map[string]M
}

// Snapshotter is what the unit of work needs from a store: a copy, and the way to put it back.
type Snapshotter interface {
	Snapshot() (restore func())
}

var registry = struct {
	mu     sync.Mutex
	stores []Snapshotter
}{}

func NewInMemoryDataSource[M any]() *InMemoryDataSource[M] {
	store := &InMemoryDataSource[M]{items: map[string]M{}}
	registry.mu.Lock()
	registry.stores = append(registry.stores, store)
	registry.mu.Unlock()
	return store
}

// AllStores is every store of the process, for a unit of work given none.
func AllStores() []Snapshotter {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return append([]Snapshotter(nil), registry.stores...)
}

func (s *InMemoryDataSource[M]) Get(key string) (M, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	item, ok := s.items[key]
	return item, ok
}

// Set stores an item under its key; a new key goes last, an existing one keeps its place.
func (s *InMemoryDataSource[M]) Set(key string, item M) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.items[key]; !exists {
		s.keys = append(s.keys, key)
	}
	s.items[key] = item
}

// Modify reads the item under key and writes what change answers, under one lock: the
// check-then-write of an optimistic save, which two writers must not interleave. A change that
// returns an error writes nothing and passes the error on.
func (s *InMemoryDataSource[M]) Modify(key string, change func(current M, exists bool) (M, error)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, exists := s.items[key]
	item, err := change(current, exists)
	if err != nil {
		return err
	}
	if !exists {
		s.keys = append(s.keys, key)
	}
	s.items[key] = item
	return nil
}

func (s *InMemoryDataSource[M]) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.items[key]; !exists {
		return
	}
	delete(s.items, key)
	for i, k := range s.keys {
		if k == key {
			s.keys = append(s.keys[:i], s.keys[i+1:]...)
			break
		}
	}
}

// All is every item, in the order they were first stored.
func (s *InMemoryDataSource[M]) All() []M {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all := make([]M, 0, len(s.keys))
	for _, key := range s.keys {
		all = append(all, s.items[key])
	}
	return all
}

func (s *InMemoryDataSource[M]) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.keys, s.items = nil, map[string]M{}
}

// Snapshot is a copy of the store as it is now, and the way to put it back.
func (s *InMemoryDataSource[M]) Snapshot() func() {
	s.mu.RLock()
	keys := append([]string(nil), s.keys...)
	items := make(map[string]M, len(s.items))
	for key, item := range s.items {
		items[key] = item
	}
	s.mu.RUnlock()
	return func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.keys = append([]string(nil), keys...)
		s.items = make(map[string]M, len(items))
		for key, item := range items {
			s.items[key] = item
		}
	}
}
