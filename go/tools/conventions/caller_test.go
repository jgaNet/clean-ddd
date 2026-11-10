package main

import (
	"strings"
	"testing"
)

// API-CALLER-AT-TRANSPORT, held on a copy of the tree: a route that publishes, or answers 202,
// by itself is refused by file and line; the tree as it is has none.

const archiveRoute = `presentation.Accept(w, r, module, commands.ArchiveNoteCommandEvent{NoteID: r.PathValue("id")})`

func callerProblems(t *testing.T, root string) []string {
	t.Helper()
	buildsAsGo(t, root)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, problem := range check(root, contract) {
		if strings.HasPrefix(problem, callerRule+":") {
			found = append(found, problem)
		}
	}
	return found
}

func TestTheTreeAsItIsPublishesEveryCommandThroughAccept(t *testing.T) {
	root := repositoryRootForTest(t)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	if problems := checkCallerAtTransport(root, contract); len(problems) != 0 {
		t.Fatalf("expected no %s problem, got %q", callerRule, problems)
	}
}

func TestRefusesARouteThatPublishesOnTheBusAndAnswers202ByItself(t *testing.T) {
	root := copyOfTheTree(t)
	editFile(t, root, notesRoutes, archiveRoute,
		`operation := presentation.ContextOf(r).Publish(commands.ArchiveNoteCommandEvent{NoteID: r.PathValue("id")})
		presentation.WriteJSON(w, http.StatusAccepted, map[string]string{"operationId": operation.ID})`)

	found := callerProblems(t, root)
	if len(found) != 2 {
		t.Fatalf("expected 2 %s problems, got %q", callerRule, found)
	}
	for i, what := range []string{"publishes on the bus by itself", "answers 202 by itself"} {
		if !strings.HasPrefix(found[i], callerRule+": "+notesRoutes+":") || !strings.Contains(found[i], what) ||
			!strings.Contains(found[i], "presentation.Accept(w, r, module, command)") {
			t.Errorf("problem %d: got %q, want the file, the line, %q and the way out", i, found[i], what)
		}
	}
}

func TestRefusesARouteThatAnswers202WithALiteralThroughTheBusOfItsContext(t *testing.T) {
	root := copyOfTheTree(t)
	editFile(t, root, notesRoutes, archiveRoute,
		`ctx := presentation.ContextOf(r)
		ctx.EventBus().Publish(commands.ArchiveNoteCommandEvent{NoteID: r.PathValue("id")}, ctx)
		w.WriteHeader(202)`)

	found := callerProblems(t, root)
	if len(found) != 2 || !strings.Contains(found[0], "publishes on the bus") || !strings.Contains(found[1], "answers 202") {
		t.Fatalf("expected the publish and the 202, got %q", found)
	}
}
