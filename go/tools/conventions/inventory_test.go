// The conventions check, tried against the tree as it is and against violations written into a
// copy of it: a refusal must name its rule, the context and the command, in the words every
// language's tool uses (ARCH-ONE-HANDLER).
package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repositoryRootForTest is the repository the test runs in: go test runs from the package directory.
func repositoryRootForTest(t *testing.T) string {
	t.Helper()
	root, err := repositoryRoot()
	if err != nil {
		t.Fatal(err)
	}
	return root
}

// copyOfTheTree is a copy of the Go directory beside a copy of the conventions and the
// inventories, so a violation can be written into it; it returns the copy's repository root.
func copyOfTheTree(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "repo")
	source := repositoryRootForTest(t)
	for _, dir := range []string{"conventions", "go", filepath.Join("docs", "inventory")} {
		from := filepath.Join(source, dir)
		err := filepath.WalkDir(from, func(p string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			relative, _ := filepath.Rel(source, p)
			target := filepath.Join(root, relative)
			if entry.IsDir() {
				return os.MkdirAll(target, 0o755)
			}
			data, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			return os.WriteFile(target, data, 0o644)
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// oneHandlerProblems runs the whole check on a repository and keeps the ARCH-ONE-HANDLER refusals.
func oneHandlerProblems(t *testing.T, root string) []string {
	t.Helper()
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, problem := range check(root, contract) {
		if strings.HasPrefix(problem, oneHandlerRule+":") {
			found = append(found, problem)
		}
	}
	return found
}

func writeFile(t *testing.T, root, relative, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(relative)), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func editFile(t *testing.T, root, relative, old, replacement string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(relative))
	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), old) {
		t.Fatalf("%s does not contain %q", relative, old)
	}
	writeFile(t, root, relative, strings.Replace(string(data), old, replacement, 1))
}

func assertProblems(t *testing.T, found, expected []string) {
	t.Helper()
	if len(found) != len(expected) {
		t.Fatalf("expected %d ARCH-ONE-HANDLER problem(s), got %d: %q", len(expected), len(found), found)
	}
	for i, problem := range expected {
		if found[i] != problem {
			t.Errorf("problem %d:\n  got  %q\n  want %q", i, found[i], problem)
		}
	}
}

const notesModule = "go/contexts/notes/module.go"

func TestTheTreeAsItIsHasExactlyOneHandlerPerCommand(t *testing.T) {
	root := repositoryRootForTest(t)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	if problems := checkOneHandler(root, contract); len(problems) != 0 {
		t.Fatalf("expected no ARCH-ONE-HANDLER problem, got %q", problems)
	}
}

func TestRefusesAModuleListingTwoHandlersForOneCommandNamingTheRuleAndTheCommand(t *testing.T) {
	root := copyOfTheTree(t)
	writeFile(t, root, "go/contexts/notes/application/commands/other.go", `package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/domain/note"
)

type OtherHandler struct{ repository note.Repository }

func NewOtherHandler(repository note.Repository) *OtherHandler { return &OtherHandler{repository: repository} }

func (h *OtherHandler) Execute(command CreateNoteCommandEvent, ctx *application.ExecutionContext) (string, error) {
	return "", nil
}
`)
	editFile(t, root, notesModule,
		"application.Command(commands.NewCreateNoteHandler(repository)),",
		"application.Command(commands.NewCreateNoteHandler(repository)),\n\t\t\tapplication.Command(commands.NewOtherHandler(repository)),")

	assertProblems(t, oneHandlerProblems(t, root), []string{
		"ARCH-ONE-HANDLER: Notes: command CreateNote has 2 handlers (CreateNoteHandler, OtherHandler); a command has exactly one",
	})
}

func TestRefusesASubscriptionLiteralListingTwoHandlersOrNoneForOneCommand(t *testing.T) {
	root := copyOfTheTree(t)
	editFile(t, root, notesModule,
		"application.Command(commands.NewEditNoteHandler(repository)),",
		`application.Subscription{Channel: "EditNoteCommandEvent", Handlers: []application.Subscriber{commands.NewEditNoteHandler(repository), commands.NewRestoreNoteHandler(repository)}},
			application.Subscription{Channel: domain.NameOfType[commands.ArchiveNoteCommandEvent](), Handlers: []application.Subscriber{}},`)
	editFile(t, root, notesModule, "application.Command(commands.NewArchiveNoteHandler(repository)),\n", "")

	// Both handlers of the literal answer the command its Channel spells; RestoreNote keeps its own one.
	assertProblems(t, oneHandlerProblems(t, root), []string{
		"ARCH-ONE-HANDLER: Notes: command EditNote has 2 handlers (EditNoteHandler, RestoreNoteHandler); a command has exactly one",
		"ARCH-ONE-HANDLER: Notes: command ArchiveNote has 0 handlers (); a command has exactly one",
	})
}

func TestRefusesACommandBuiltByARouteThatNoHandlerAnswers(t *testing.T) {
	root := copyOfTheTree(t)
	editFile(t, root, notesModule, "application.Command(commands.NewArchiveNoteHandler(repository)),\n", "")

	assertProblems(t, oneHandlerProblems(t, root), []string{
		"ARCH-ONE-HANDLER: Notes: command ArchiveNote is built by a route and no handler in the Module answers it",
	})
}

func TestRefusesACommandDispatchedByAPolicyThatNoHandlerAnswers(t *testing.T) {
	root := copyOfTheTree(t)
	writeFile(t, root, "go/contexts/notes/application/events/note_created_handler.go", `package events

import (
	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/application/commands"
	"clean-ddd/contexts/notes/domain/note"
)

type NoteCreatedHandler struct{}

func (h NoteCreatedHandler) Execute(event note.NoteCreatedEvent, ctx *application.ExecutionContext) error {
	ctx.Publish(commands.IndexNoteCommandEvent{NoteID: event.NoteID})
	return nil
}
`)

	assertProblems(t, oneHandlerProblems(t, root), []string{
		"ARCH-ONE-HANDLER: Notes: command IndexNote is dispatched by NoteCreatedHandler and no handler in the Module answers it",
	})
}
