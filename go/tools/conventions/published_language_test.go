// The published language as the Go tree carries it (ADR 44, CTX-PUBLISHED-LANGUAGE): a field's
// public name is its words in lowerCamel, a run of capitals being one word; its type is one of the
// six words the published language has, with `?` when Go lets it be absent; an integration event
// enters the inventory with the context that publishes it, and a changed payload is a difference,
// named.
package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestAFieldsPublicNameIsItsWordsInLowerCamelARunOfCapitalsBeingOneWord(t *testing.T) {
	for name, expected := range map[string]string{
		"OperationID":     "operationId",
		"ValidationToken": "validationToken",
		"UserID":          "userId",
		"ID":              "id",
		"Email":           "email",
		"HTTPStatus":      "httpStatus",
		"RecipientIDs":    "recipientIds",
		"V2Token":         "v2Token",
		"Type":            "type",
		"IDsByOwner":      "idsByOwner",
		"URLs":            "urls",
	} {
		if got := fieldPublicName(name); got != expected {
			t.Errorf("fieldPublicName(%q) = %q, want %q", name, got, expected)
		}
	}
}

func TestAnIntegrationEventsPayloadIsReadFromItsExportedFieldsInThePublishedLanguagesWords(t *testing.T) {
	root := copyOfTheTree(t)
	writeFile(t, root, "go/sharedkernel/application/integrationevents/probe_integration_events.go", `package integrationevents

import (
	"time"

	"clean-ddd/architecture/domain"
)

type Level string

type Inner struct{ A string }

type ProbeSentIntegrationEvent struct {
	domain.IntegrationEvent
	OperationID string
	HTTPStatus  int
	Ratio       float64
	Done        bool
	Tags        []string
	Meta        map[string]any
	Detail      struct{ A string }
	Value       any
	When        time.Time
	Reason      *string
	Count       *int
	Level       Level
	Inner       Inner
	hidden      string
}

type UnpublishedIntegrationEvent struct {
	domain.IntegrationEvent
	NoteID string
}
`)
	writeFile(t, root, "go/contexts/notes/application/events/probe_sent.go", `package events

import "clean-ddd/sharedkernel/application/integrationevents"

var probe = integrationevents.ProbeSentIntegrationEvent{OperationID: "op"}
`)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	inventory, err := inspectInventory(root, contract)
	if err != nil {
		t.Fatal(err)
	}

	var probe *InventoryIntegrationEvent
	names := []string{}
	for i, each := range inventory.IntegrationEvents {
		names = append(names, each.Name)
		if each.Name == "ProbeSent" {
			probe = &inventory.IntegrationEvents[i]
		}
	}
	if expected := []string{"AccountCreated", "AccountValidated", "NoteShared", "OperationComplete", "ProbeSent"}; !reflect.DeepEqual(names, expected) {
		t.Fatalf("the integration events: got %v, want %v (sorted, and none published by nobody)", names, expected)
	}
	if probe.Publisher != "Notes" {
		t.Fatalf("publisher: got %q, want the context that builds it", probe.Publisher)
	}
	expected := map[string]string{
		"operationId": "string", "httpStatus": "number", "ratio": "number", "done": "boolean",
		"tags": "array", "meta": "object", "detail": "object", "value": "any?", "when": "object",
		"reason": "string?", "count": "number?", "level": "string", "inner": "object",
	}
	if !reflect.DeepEqual(probe.Payload, expected) {
		t.Fatalf("payload:\n  got  %v\n  want %v", probe.Payload, expected)
	}
}

func TestTheTreesOwnIntegrationEventsAreTheOnesItsPoliciesPublish(t *testing.T) {
	root := repositoryRootForTest(t)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	inventory, err := inspectInventory(filepath.Clean(root), contract)
	if err != nil {
		t.Fatal(err)
	}
	for _, each := range inventory.IntegrationEvents {
		if each.Name == "OperationComplete" {
			if each.Publisher != "Tracker" || each.Payload["error"] != "string?" || each.Payload["result"] != "any?" {
				t.Fatalf("OperationComplete: %+v", each)
			}
			return
		}
	}
	t.Fatal("OperationComplete is not in the inventory")
}

func TestAChangedPayloadIsADifferenceNamed(t *testing.T) {
	before := committedInventory()
	before.IntegrationEvents = []InventoryIntegrationEvent{
		{Name: "NoteShared", Publisher: "Notes", Payload: map[string]string{"noteId": "string", "title": "string"}},
		{Name: "OperationComplete", Publisher: "Tracker", Payload: map[string]string{"error": "string"}},
	}
	after := committedInventory()
	after.IntegrationEvents = []InventoryIntegrationEvent{
		{Name: "AccountCreated", Publisher: "Security", Payload: map[string]string{"accountId": "string"}},
		{Name: "OperationComplete", Publisher: "Tracker", Payload: map[string]string{"error": "string?"}},
	}

	assertDifferences(t, inventoryDifferences(before, after), []string{
		"ARCH-ONE-APPLICATION: published language: the committed inventory has the integration event NoteShared, the tree no longer says it",
		"ARCH-ONE-APPLICATION: published language: the integration event OperationComplete differs: payload {error: string} → {error: string?}",
		"ARCH-ONE-APPLICATION: published language: the tree says the integration event AccountCreated, the committed inventory does not",
	})
}
