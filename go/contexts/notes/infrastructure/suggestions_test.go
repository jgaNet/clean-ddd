package infrastructure

import (
	"testing"
	"time"
)

func TestTheFirstLineIsProposedAsItIsForTheAggregateToJudge(t *testing.T) {
	source := FirstLineTitleSuggestions{}
	before := time.Now().UTC()

	suggestion, err := source.Suggest("  Groceries  \nMilk\nBread")
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if suggestion.Title != "Groceries" {
		t.Errorf("title: got %q", suggestion.Title)
	}
	if suggestion.Provenance.Source != "heuristic" || suggestion.Provenance.Version != FirstLineVersion {
		t.Errorf("provenance: got %+v", suggestion.Provenance)
	}
	if suggestion.Provenance.At.Before(before) || suggestion.Provenance.At.Location() != time.UTC {
		t.Errorf("at: got %v", suggestion.Provenance.At)
	}

	blank, _ := source.Suggest("\nMilk")
	if blank.Title != "" {
		t.Errorf("a blank first line is proposed as such: got %q", blank.Title)
	}
	single, _ := source.Suggest("Only line")
	if single.Title != "Only line" {
		t.Errorf("a single line is the title: got %q", single.Title)
	}
}
