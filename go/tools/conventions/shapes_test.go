// The readers, challenged with unusual shapes: recognised, or caught, never silent.
//
// The readers recognise the canonical shapes the guides teach, and no other — by design: a
// reading that guessed at every way a command could be built would be a second guide, drifting
// from the first. What that stance costs is a shape a reader does not see, and the question that
// matters is whether such a shape can stay silent. These probes write unusual but valid shapes
// (the copy still builds) into a copy of the tree and run the whole check on it: the command is
// still read as the committed inventory expects (recognised), or the copy is refused — by the
// inventory held to what the tree says (ARCH-ONE-APPLICATION), or by the one-handler rule
// (ARCH-ONE-HANDLER). A probe that is neither is a false negative, and fails here; a reader that
// starts recognising a shape moves its probe to "recognised", which is a change to the guides as
// much as to the tool. The TypeScript tool asks the same questions (tools/src/shapes.spec.ts).
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const (
	notesRoutes    = "go/contexts/notes/presentation/routes.go"
	shareNoteFile  = "go/contexts/notes/application/commands/share_note.go"
	shareBuilt     = `commands.ShareNoteCommandEvent{NoteID: r.PathValue("id"), RecipientID: body.RecipientID}`
	shareListed    = "application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts))),"
	beforeRoutes   = "// Routes registers the context's routes"
	beforeModule   = "// LocalModule is the Notes module"
	moduleReturned = "\treturn &application.Module{"
)

// edit is one replacement written into the copy: in a file, a text that occurs exactly once.
type edit struct{ file, from, to string }

// shapeVerdict is what the whole check says of a copy: its ARCH-ONE-APPLICATION and
// ARCH-ONE-HANDLER lines, and — since the check's inventory line names the file, not the command —
// what the copy's inventory says differently from the committed one, command by command.
type shapeVerdict struct {
	oneApplication []string
	oneHandler     []string
	differences    []string
}

func (v shapeVerdict) recognised() bool {
	return len(v.oneApplication) == 0 && len(v.oneHandler) == 0
}

// probe writes the edits into a copy of the tree, proves the copy still builds, and runs the
// whole check on it.
func probe(t *testing.T, edits ...edit) shapeVerdict {
	t.Helper()
	root := copyOfTheTree(t)
	for _, each := range edits {
		rewriteOnce(t, root, each)
	}
	buildsAsGo(t, root)

	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	var found shapeVerdict
	for _, problem := range check(root, contract) {
		switch {
		case strings.HasPrefix(problem, inventoryRule+":"):
			found.oneApplication = append(found.oneApplication, problem)
		case strings.HasPrefix(problem, oneHandlerRule+":"):
			found.oneHandler = append(found.oneHandler, problem)
		default:
			// The probe is about how a command is read; a shape another rule refuses is a broken probe.
			t.Fatalf("the probe breaks another rule: %s", problem)
		}
	}
	found.differences = inventoryDifferences(t, root, contract)
	if found.recognised() != (len(found.differences) == 0) {
		t.Fatalf("the check and the inventory disagree: %+v", found)
	}
	return found
}

// rewriteOnce replaces a text that must occur exactly once in the file: a probe that no longer
// matches the tree fails, rather than probing nothing.
func rewriteOnce(t *testing.T, root string, change edit) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(change.file))
	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if count := strings.Count(string(data), change.from); count != 1 {
		t.Fatalf("%s contains %d times, not exactly once: %q", change.file, count, change.from)
	}
	writeFile(t, root, change.file, strings.Replace(string(data), change.from, change.to, 1))
}

// buildsAsGo proves the shape is valid Go: the copy's module builds.
func buildsAsGo(t *testing.T, root string) {
	t.Helper()
	build := exec.Command("go", "build", "./...")
	build.Dir = filepath.Join(root, "go")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("the probed shape is not valid Go: %v\n%s", err, output)
	}
}

// inventoryDifferences is what the copy's inventory says differently from the committed one: a
// line per field of a command, a line per other section of a context, a line for the links.
func inventoryDifferences(t *testing.T, root string, contract *Contract) []string {
	t.Helper()
	rendered, err := inspectInventory(root, contract)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(inventoryFile)))
	if err != nil {
		t.Fatal(err)
	}
	var committed Inventory
	if err := json.Unmarshal(data, &committed); err != nil {
		t.Fatal(err)
	}
	// Through JSON both ways, so an empty list and an absent one compare as the file spells them.
	data, err = json.Marshal(rendered)
	if err != nil {
		t.Fatal(err)
	}
	var now Inventory
	if err := json.Unmarshal(data, &now); err != nil {
		t.Fatal(err)
	}

	var found []string
	contexts := map[string]InventoryContext{}
	for _, each := range now.Contexts {
		contexts[each.ID] = each
	}
	for _, was := range committed.Contexts {
		is := contexts[was.ID]
		found = append(found, commandDifferences(was.ID, was.Commands, is.Commands)...)
		for _, section := range []struct {
			name    string
			was, is any
		}{{"queries", was.Queries, is.Queries}, {"events", was.Events, is.Events}, {"policies", was.Policies, is.Policies}} {
			if !reflect.DeepEqual(section.was, section.is) {
				found = append(found, fmt.Sprintf("%s: the %s differ", was.ID, section.name))
			}
		}
	}
	if !reflect.DeepEqual(committed.Links, now.Links) {
		found = append(found, "the links differ")
	}
	return found
}

func commandDifferences(context string, was, is []InventoryCommand) []string {
	byName := func(commands []InventoryCommand) map[string]InventoryCommand {
		found := map[string]InventoryCommand{}
		for _, each := range commands {
			found[each.Name] = each
		}
		return found
	}
	before, after := byName(was), byName(is)
	var found []string
	for _, command := range was {
		now, ok := after[command.Name]
		if !ok {
			found = append(found, fmt.Sprintf("%s: command %s is gone", context, command.Name))
			continue
		}
		field := func(name, from, to string) {
			if from != to {
				found = append(found, fmt.Sprintf("%s: command %s: %s %q became %q", context, command.Name, name, from, to))
			}
		}
		field("actor", command.Actor, now.Actor)
		field("route", command.Route, now.Route)
		field("aggregate", command.Aggregate, now.Aggregate)
		field("events", strings.Join(command.Events, ", "), strings.Join(now.Events, ", "))
	}
	for _, command := range is {
		if _, ok := before[command.Name]; !ok {
			found = append(found, fmt.Sprintf("%s: command %s appears", context, command.Name))
		}
	}
	return found
}

func assertRecognised(t *testing.T, verdict shapeVerdict) {
	t.Helper()
	if !verdict.recognised() || len(verdict.differences) != 0 {
		t.Fatalf("expected the shape to be recognised, got %+v", verdict)
	}
}

// assertCaught: the shape is refused, by exactly these ARCH-ONE-HANDLER lines, and by the
// inventory with exactly these differences (none: the inventory says what it said).
func assertCaught(t *testing.T, verdict shapeVerdict, oneHandler, differences []string) {
	t.Helper()
	if verdict.recognised() {
		t.Fatalf("expected the shape to be caught, but it is recognised: %+v", verdict)
	}
	if !reflect.DeepEqual(verdict.oneHandler, oneHandler) {
		t.Errorf("ARCH-ONE-HANDLER:\n  got  %q\n  want %q", verdict.oneHandler, oneHandler)
	}
	if !reflect.DeepEqual(verdict.differences, differences) {
		t.Errorf("the inventory's differences:\n  got  %q\n  want %q", verdict.differences, differences)
	}
	if want := min(len(differences), 1); len(verdict.oneApplication) != want {
		t.Errorf("expected %d ARCH-ONE-APPLICATION line(s), got %q", want, verdict.oneApplication)
	}
}

func TestTheTreeAsItIsIsRecognisedAndNothingIsCaught(t *testing.T) {
	assertRecognised(t, probe(t))
}

func TestAHandlerTypeNamedForItsUseCaseIsRecognisedTheCommandIsNamedByWhatExecuteTakes(t *testing.T) {
	assertRecognised(t, probe(t,
		edit{shareNoteFile, "type ShareNoteHandler struct", "type ShareNoteUseCase struct"},
		edit{shareNoteFile,
			"func NewShareNoteHandler(notes note.Repository, sharing *note.Sharing) *ShareNoteHandler {\n\treturn &ShareNoteHandler{",
			"func NewShareNoteUseCase(notes note.Repository, sharing *note.Sharing) *ShareNoteUseCase {\n\treturn &ShareNoteUseCase{"},
		edit{shareNoteFile, "func (h *ShareNoteHandler) Execute", "func (h *ShareNoteUseCase) Execute"},
		edit{notesModule, "commands.NewShareNoteHandler(", "commands.NewShareNoteUseCase("},
	))
}

func TestACommandBuiltThroughATypeAliasIsNotSeenByTheRouteReadingCaughtByTheInventory(t *testing.T) {
	verdict := probe(t,
		edit{notesRoutes, shareBuilt, `share{NoteID: r.PathValue("id"), RecipientID: body.RecipientID}`},
		edit{notesRoutes, beforeRoutes, "type share = commands.ShareNoteCommandEvent\n\n" + beforeRoutes},
	)
	assertCaught(t, verdict, nil, []string{
		`Notes: command ShareNote: route "POST /notes/{param}/share" became ""`,
	})
}

func TestACommandBuiltByAHelperTheRouteHandlerCallsIsNotSeenByTheRouteReadingCaughtByTheInventory(t *testing.T) {
	verdict := probe(t,
		edit{notesRoutes, shareBuilt, `shareCommand(r.PathValue("id"), body.RecipientID)`},
		edit{notesRoutes, beforeRoutes,
			"func shareCommand(noteID, recipientID string) commands.ShareNoteCommandEvent {\n" +
				"\treturn commands.ShareNoteCommandEvent{NoteID: noteID, RecipientID: recipientID}\n}\n\n" + beforeRoutes},
	)
	// The helper still builds the command in the Presentation layer, so ARCH-ONE-HANDLER sees it answered.
	assertCaught(t, verdict, nil, []string{
		`Notes: command ShareNote: route "POST /notes/{param}/share" became ""`,
	})
}

func TestACommandsEntryTakenFromAVariableIsReadAsTheSubscriptionTypeCaughtByTheInventoryAndByARCHONEHANDLER(t *testing.T) {
	verdict := probe(t,
		edit{notesModule, shareListed, "share,"},
		edit{notesModule, moduleReturned,
			"\tshare := application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts)))\n\n" + moduleReturned},
	)
	assertCaught(t, verdict, []string{
		"ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it",
	}, []string{
		"Notes: command ShareNote is gone",
		"Notes: command Subscription appears",
	})
}

func TestAHandlerBuiltByAFileLevelFactoryIsNamedButNotReadCaughtByTheInventory(t *testing.T) {
	verdict := probe(t,
		edit{notesModule, shareListed, "application.Command(shareHandler(repository, note.NewSharing(accounts))),"},
		edit{notesModule, beforeModule,
			"func shareHandler(repository note.Repository, sharing *note.Sharing) *commands.ShareNoteHandler {\n" +
				"\treturn commands.NewShareNoteHandler(repository, sharing)\n}\n\n" + beforeModule},
	)
	// The factory's result type names the handler, so the command keeps its name and its one
	// handler; but the handler is looked for in the wiring's package, so its file is not read.
	assertCaught(t, verdict, nil, []string{
		`Notes: command ShareNote: actor "a signed-in account" became "anyone"`,
		`Notes: command ShareNote: aggregate "Note" became ""`,
		`Notes: command ShareNote: events "NoteShared" became ""`,
	})
}

func TestAHandlerHeldInALocalVariableAssignedItsConstructorIsRecognised(t *testing.T) {
	assertRecognised(t, probe(t,
		edit{notesModule, shareListed, "application.Command(h),"},
		edit{notesModule, moduleReturned,
			"\th := commands.NewShareNoteHandler(repository, note.NewSharing(accounts))\n\n" + moduleReturned},
	))
}

func TestASubscriptionLiteralWhoseChannelGoesThroughAnAliasIsNotSeenCaughtByTheInventoryAndByARCHONEHANDLER(t *testing.T) {
	verdict := probe(t,
		// A command handler is not a Subscriber: a literal that compiles takes its Handlers from application.Command().
		edit{notesModule, shareListed,
			"application.Subscription{Channel: domain.NameOfType[share](), Handlers: application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts))).Handlers},"},
		edit{notesModule, "\t\"clean-ddd/architecture/application\"\n", "\t\"clean-ddd/architecture/application\"\n\t\"clean-ddd/architecture/domain\"\n"},
		edit{notesModule, beforeModule, "type share = commands.ShareNoteCommandEvent\n\n" + beforeModule},
	)
	assertCaught(t, verdict, []string{
		"ARCH-ONE-HANDLER: Notes: command share has 0 handlers (); a command has exactly one",
		"ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it",
	}, []string{
		"Notes: command ShareNote is gone",
	})
}
