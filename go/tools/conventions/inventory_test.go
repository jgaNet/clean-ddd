// The conventions check, tried against the tree as it is and against violations written into a
// copy of it: a refusal must name its rule, the context and the command, in the words every
// language's tool uses (ARCH-ONE-HANDLER); a copy is Go that builds, or it proves nothing. And
// the comparison a stale inventory is refused with, on small inventories built by hand: one line
// per difference, in the words and the order every language's tool prints (ARCH-ONE-APPLICATION).
package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
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

// oneHandlerProblems proves the copy is Go that builds, runs the whole check on it and keeps the
// ARCH-ONE-HANDLER refusals.
func oneHandlerProblems(t *testing.T, root string) []string {
	t.Helper()
	buildsAsGo(t, root)
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

func TestRefusesSubscriptionLiteralsListingTwoHandlersOrNoneForOneCommand(t *testing.T) {
	root := copyOfTheTree(t)
	// A command handler is not a Subscriber: a literal that compiles takes its Handlers from
	// application.Command(); two literals on one channel are two handlers for one command, and
	// an empty list of Subscribers is none.
	editFile(t, root, notesModule,
		"application.Command(commands.NewEditNoteHandler(repository)),",
		`application.Subscription{Channel: "EditNoteCommandEvent", Handlers: application.Command(commands.NewEditNoteHandler(repository)).Handlers},
			application.Subscription{Channel: "EditNoteCommandEvent", Handlers: application.Command(commands.NewRestoreNoteHandler(repository)).Handlers},
			application.Subscription{Channel: domain.NameOfType[commands.ArchiveNoteCommandEvent](), Handlers: []application.Subscriber{}},`)
	editFile(t, root, notesModule, "application.Command(commands.NewArchiveNoteHandler(repository)),\n", "")
	editFile(t, root, notesModule, "\t\"clean-ddd/architecture/application\"\n", "\t\"clean-ddd/architecture/application\"\n\t\"clean-ddd/architecture/domain\"\n")

	// Both literals answer the command their Channel spells; RestoreNote keeps its own one.
	assertProblems(t, oneHandlerProblems(t, root), []string{
		"ARCH-ONE-HANDLER: Notes: command ArchiveNote has 0 handlers (); a command has exactly one",
		"ARCH-ONE-HANDLER: Notes: command EditNote has 2 handlers (EditNoteHandler, RestoreNoteHandler); a command has exactly one",
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
	writeFile(t, root, "go/contexts/notes/application/commands/index_note.go", `package commands

import "clean-ddd/architecture/domain"

type IndexNoteCommandEvent struct {
	domain.CommandEvent
	NoteID string
}
`)
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

// The comparison a stale inventory is refused with, on inventories built by hand.

func TestTwoEqualInventoriesHaveNoDifference(t *testing.T) {
	if found := inventoryDifferences(committedInventory(), committedInventory()); len(found) != 0 {
		t.Fatalf("expected no difference, got %q", found)
	}
}

func TestAStaleInventoryNamesEachDifferenceInTheOrderEveryLanguagePrints(t *testing.T) {
	tree := committedInventory()
	notes := &tree.Contexts[0]
	notes.Commands = []InventoryCommand{
		{Name: "PinNote", Actor: actorSignedIn, Route: "POST /notes/{param}/pin", Aggregate: "Note", Events: []string{"NotePinned"}},
		{Name: "ShareNote", Actor: actorAnyone, Aggregate: "Note", Events: []string{"NoteShared"}},
	}
	notes.Events = []string{"NoteShared"}
	notes.Policies[0].Publishes = []string{}
	tree.Contexts = tree.Contexts[:1]
	tree.Links[0].Contracts = []string{"NoteArchived", "NoteShared"}

	assertDifferences(t, inventoryDifferences(committedInventory(), tree), []string{
		"ARCH-ONE-APPLICATION: Notes: the committed inventory has the command ArchiveNote, the tree no longer says it",
		`ARCH-ONE-APPLICATION: Notes: the command ShareNote differs: actor "a signed-in account" → "anyone"; route "POST /notes/{param}/share" → none`,
		"ARCH-ONE-APPLICATION: Notes: the tree says the command PinNote, the committed inventory does not",
		"ARCH-ONE-APPLICATION: Notes: the committed inventory has the domain event NoteArchived, the tree no longer says it",
		"ARCH-ONE-APPLICATION: Notes: the policy on NoteShared differs: publishes [NoteShared] → []",
		"ARCH-ONE-APPLICATION: Tracker: the committed inventory has the context, the tree no longer says it",
		"ARCH-ONE-APPLICATION: context map: the link Notes → Notifications (integration-event) differs: contracts [NoteShared] → [NoteArchived, NoteShared]",
	})
}

func TestAStaleInventoryNamesAQueryANewContextAndPoliciesSharingTheirFactByKind(t *testing.T) {
	tree := committedInventory()
	notes := &tree.Contexts[0]
	notes.Queries[0].Actor = actorAnyone
	notes.Policies = append(notes.Policies, InventoryPolicy{On: "NoteShared", Kind: "integration-event", Publishes: []string{}, Events: []string{}})
	tree.Contexts = append(tree.Contexts, InventoryContext{ID: "Billing", Commands: []InventoryCommand{}, Queries: []InventoryQuery{}, Events: []string{}, Policies: []InventoryPolicy{}})
	tree.Links = []InventoryLink{}

	assertDifferences(t, inventoryDifferences(committedInventory(), tree), []string{
		`ARCH-ONE-APPLICATION: Notes: the query GetNote differs: actor "a signed-in account" → "anyone"`,
		"ARCH-ONE-APPLICATION: Notes: the tree says the policy on NoteShared (integration-event), the committed inventory does not",
		"ARCH-ONE-APPLICATION: Billing: the tree says the context, the committed inventory does not",
		"ARCH-ONE-APPLICATION: context map: the committed inventory has the link Notes → Notifications (integration-event), the tree no longer says it",
	})
}

// committedInventory is a small inventory, as a committed file would say it.
func committedInventory() *Inventory {
	return &Inventory{
		SchemaVersion: inventorySchema,
		Language:      "go",
		Contexts: []InventoryContext{
			{
				ID: "Notes",
				Commands: []InventoryCommand{
					{Name: "ArchiveNote", Actor: actorSignedIn, Route: "POST /notes/{param}/archive", Aggregate: "Note", Events: []string{"NoteArchived"}},
					{Name: "ShareNote", Actor: actorSignedIn, Route: "POST /notes/{param}/share", Aggregate: "Note", Events: []string{"NoteShared"}},
				},
				Queries:  []InventoryQuery{{Name: "GetNote", Actor: actorSignedIn, Route: "GET /notes/{param}"}},
				Events:   []string{"NoteArchived", "NoteShared"},
				Policies: []InventoryPolicy{{On: "NoteShared", Kind: "domain-event", Publishes: []string{"NoteShared"}, Events: []string{}}},
			},
			{
				ID:       "Tracker",
				Commands: []InventoryCommand{},
				Queries:  []InventoryQuery{{Name: "GetOperation", Actor: actorAnyone, Route: "GET /operations/{param}"}},
				Events:   []string{},
				Policies: []InventoryPolicy{{On: "every operation", Kind: "every-operation", Publishes: []string{"OperationComplete"}, Events: []string{}}},
			},
		},
		Links: []InventoryLink{{Mechanism: "integration-event", Upstream: "Notes", Downstream: "Notifications", Contracts: []string{"NoteShared"}}},
	}
}

func assertDifferences(t *testing.T, found, expected []string) {
	t.Helper()
	if !reflect.DeepEqual(found, expected) {
		t.Fatalf("the differences:\n  got  %q\n  want %q", found, expected)
	}
}
