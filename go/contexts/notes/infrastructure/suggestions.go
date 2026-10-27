package infrastructure

import (
	"strings"
	"time"

	"clean-ddd/contexts/notes/application/suggestions"
)

// FirstLineTitleSuggestions is the local adapter of TitleSuggestions: the first line of the
// content, as it is. It is a heuristic standing where a model would stand; an LLM adapter
// implements the same port and nothing else changes. On purpose it does not trim its proposal
// to Title's rules: a blank first line or a very long one is proposed as such, and the
// aggregate refuses it, which is the point of ADR 7.
type FirstLineTitleSuggestions struct{}

const FirstLineVersion = "first-line/1"

func (FirstLineTitleSuggestions) Suggest(content string) (suggestions.TitleSuggestion, error) {
	firstLine, _, _ := strings.Cut(content, "\n")
	return suggestions.TitleSuggestion{
		Title:      strings.TrimSpace(firstLine),
		Provenance: suggestions.Provenance{Source: "heuristic", Version: FirstLineVersion, At: time.Now().UTC()},
	}, nil
}
