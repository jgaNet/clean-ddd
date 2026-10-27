package infrastructure

import (
	"reflect"
	"testing"
)

func TestAStoreKeepsTheOrderItemsWereFirstStoredIn(t *testing.T) {
	store := NewInMemoryDataSource[string]()
	store.Set("b", "second")
	store.Set("a", "first")
	store.Set("b", "second again") // an existing key keeps its place

	if all := store.All(); !reflect.DeepEqual(all, []string{"second again", "first"}) {
		t.Errorf("All: got %v", all)
	}
	if item, ok := store.Get("b"); !ok || item != "second again" {
		t.Errorf("Get: got (%q, %v)", item, ok)
	}
	if _, ok := store.Get("nope"); ok {
		t.Error("an unknown key is absent")
	}
}

func TestDeletingAndResettingAStore(t *testing.T) {
	store := NewInMemoryDataSource[string]()
	store.Set("a", "first")
	store.Set("b", "second")
	store.Delete("a")
	store.Delete("nope")

	if all := store.All(); !reflect.DeepEqual(all, []string{"second"}) {
		t.Errorf("after Delete: got %v", all)
	}
	store.Reset()
	if all := store.All(); len(all) != 0 {
		t.Errorf("after Reset: got %v", all)
	}
}

func TestASnapshotPutsTheStoreBackIncludingItsOrder(t *testing.T) {
	store := NewInMemoryDataSource[string]()
	store.Set("a", "first")
	restore := store.Snapshot()
	store.Delete("a")
	store.Set("b", "second")
	store.Set("a", "first again")

	restore()

	if all := store.All(); !reflect.DeepEqual(all, []string{"first"}) {
		t.Errorf("after restore: got %v", all)
	}
}

func TestEveryStoreIsRegisteredForTheUnitOfWork(t *testing.T) {
	before := len(AllStores())
	store := NewInMemoryDataSource[int]()
	stores := AllStores()
	if len(stores) != before+1 || stores[len(stores)-1] != Snapshotter(store) {
		t.Error("a new store should be the last one registered")
	}
}
