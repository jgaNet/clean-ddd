// The readers, challenged with unusual shapes: recognised, or caught, never silent.
//
// The readers recognise the canonical shapes the guides teach, and no other — by design: a
// reading that guessed at every way a command could be built would be a second guide, drifting
// from the first. What that stance costs is a shape a reader does not see, and the question that
// matters is whether such a shape can stay silent. These probes write unusual but valid shapes
// (the copy still builds) into a copy of the tree and run the whole check on it: the command is
// still read as the committed inventory expects (recognised), or the copy is refused — by the
// inventory held to what the tree says (ARCH-ONE-APPLICATION, a line per difference, named by
// the check itself), or by the one-handler rule (ARCH-ONE-HANDLER). A reader never names what it
// did not resolve, so no line may name as a command what is not one (a Subscription, an alias, a
// factory). A probe that is neither is a false negative, and fails here; a reader that
// starts recognising a shape moves its probe to "recognised", which is a change to the guides as
// much as to the tool. The TypeScript tool asks the same questions (tools/src/shapes.spec.ts).
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const (
	notesRoutes       = "go/contexts/notes/presentation/routes.go"
	shareNoteFile     = "go/contexts/notes/application/commands/share_note.go"
	shareBuilt        = `commands.ShareNoteCommandEvent{NoteID: r.PathValue("id"), RecipientID: body.RecipientID}`
	shareListed       = "application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts))),"
	beforeRoutes      = "// Routes registers the context's routes"
	beforeModule      = "// LocalModule is the Notes module"
	moduleReturned    = "\treturn &application.Module{"
	applicationImport = "\t\"clean-ddd/architecture/application\"\n"
	domainImport      = "\t\"clean-ddd/architecture/domain\"\n"
	// staleInventory is the line a stale inventory is refused with, before the line of each difference.
	staleInventory = "ARCH-ONE-APPLICATION: docs/inventory/go.json differs from what the Go tree says; run `go run ./tools/conventions inventory --write` and commit it (fix the tree that differs from the other languages, never the inventory)"
)

// edit is one replacement written into the copy: in a file, a text that occurs exactly once.
type edit struct{ file, from, to string }

// shapeVerdict is what the whole check says of a copy: its ARCH-ONE-APPLICATION lines (the
// stale inventory, then each difference, named by the check itself) and its ARCH-ONE-HANDLER lines.
type shapeVerdict struct {
	oneApplication []string
	oneHandler     []string
}

func (v shapeVerdict) recognised() bool {
	return len(v.oneApplication) == 0 && len(v.oneHandler) == 0
}

// unresolved is what a reader could take for a command without resolving it: none may be named one.
var unresolved = []string{"Subscription", "share", "shareHandler", "shareSubscription", "Command"}

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
		for _, name := range unresolved {
			if strings.Contains(problem, "command "+name+" ") || strings.Contains(problem, "command "+name+",") {
				t.Errorf("a line names %s as a command, which it did not resolve: %s", name, problem)
			}
		}
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
	if len(found.oneApplication) > 0 && found.oneApplication[0] != staleInventory {
		t.Fatalf("a stale inventory is refused first by the line saying so, got %q", found.oneApplication)
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

// buildsAsGo proves what a test wrote is valid Go: the copy's module builds.
func buildsAsGo(t *testing.T, root string) {
	t.Helper()
	build := exec.Command("go", "build", "./...")
	build.Dir = filepath.Join(root, "go")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("the written Go does not build: %v\n%s", err, output)
	}
}

func assertRecognised(t *testing.T, verdict shapeVerdict) {
	t.Helper()
	if !verdict.recognised() {
		t.Fatalf("expected the shape to be recognised, got %+v", verdict)
	}
}

// assertCaught: the shape is refused, by exactly these ARCH-ONE-HANDLER lines and exactly these
// ARCH-ONE-APPLICATION lines, as the check prints them.
func assertCaught(t *testing.T, verdict shapeVerdict, oneHandler, oneApplication []string) {
	t.Helper()
	if verdict.recognised() {
		t.Fatalf("expected the shape to be caught, but it is recognised: %+v", verdict)
	}
	if !reflect.DeepEqual(verdict.oneHandler, oneHandler) {
		t.Errorf("ARCH-ONE-HANDLER:\n  got  %q\n  want %q", verdict.oneHandler, oneHandler)
	}
	if !reflect.DeepEqual(verdict.oneApplication, oneApplication) {
		t.Errorf("ARCH-ONE-APPLICATION:\n  got  %q\n  want %q", verdict.oneApplication, oneApplication)
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
	// The alias is not a command type of the context: the route builds nothing the reader names.
	assertCaught(t, verdict, nil, []string{
		staleInventory,
		`ARCH-ONE-APPLICATION: Notes: the command ShareNote differs: route "POST /notes/{param}/share" → none`,
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
		staleInventory,
		`ARCH-ONE-APPLICATION: Notes: the command ShareNote differs: route "POST /notes/{param}/share" → none`,
	})
}

func TestACommandsEntryTakenFromAVariableHoldingApplicationCommandIsFollowedToItsHandlerAndRecognised(t *testing.T) {
	assertRecognised(t, probe(t,
		edit{notesModule, shareListed, "share,"},
		edit{notesModule, moduleReturned,
			"\tshare := application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts)))\n\n" + moduleReturned},
	))
}

func TestACommandsEntryBuiltByAFactoryReturningASubscriptionIsNotReadAsAHandlerCaughtByTheInventoryAndByARCHONEHANDLER(t *testing.T) {
	verdict := probe(t,
		edit{notesModule, shareListed, "shareSubscription(repository, note.NewSharing(accounts)),"},
		edit{notesModule, beforeModule,
			"func shareSubscription(repository note.Repository, sharing *note.Sharing) application.Subscription {\n" +
				"\treturn application.Command(commands.NewShareNoteHandler(repository, sharing))\n}\n\n" + beforeModule},
	)
	// The factory's declared result is a Subscription, not a handler type of the context: the
	// entry lists nothing the reader can name, and the holes it leaves are caught.
	assertCaught(t, verdict, []string{
		"ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it",
	}, []string{
		staleInventory,
		"ARCH-ONE-APPLICATION: Notes: the committed inventory has the command ShareNote, the tree no longer says it",
	})
}

func TestAHandlerBuiltByAFileLevelFactoryIsReadThroughTheFactorysDeclaredResultAndRecognised(t *testing.T) {
	// The factory's result type is looked up where the factory declares it (the commands package), not in the wiring's.
	assertRecognised(t, probe(t,
		edit{notesModule, shareListed, "application.Command(shareHandler(repository, note.NewSharing(accounts))),"},
		edit{notesModule, beforeModule,
			"func shareHandler(repository note.Repository, sharing *note.Sharing) *commands.ShareNoteHandler {\n" +
				"\treturn commands.NewShareNoteHandler(repository, sharing)\n}\n\n" + beforeModule},
	))
}

func TestAHandlerHeldInALocalVariableAssignedItsConstructorIsRecognised(t *testing.T) {
	assertRecognised(t, probe(t,
		edit{notesModule, shareListed, "application.Command(h),"},
		edit{notesModule, moduleReturned,
			"\th := commands.NewShareNoteHandler(repository, note.NewSharing(accounts))\n\n" + moduleReturned},
	))
}

func TestASubscriptionLiteralForShareNoteInTheFormThatCompilesIsRecognised(t *testing.T) {
	// A command handler is not a Subscriber: a literal that compiles takes its Handlers from application.Command().
	assertRecognised(t, probe(t,
		edit{notesModule, shareListed,
			"application.Subscription{Channel: domain.NameOfType[commands.ShareNoteCommandEvent](), Handlers: application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts))).Handlers},"},
		edit{notesModule, applicationImport, applicationImport + domainImport},
	))
}

func TestASubscriptionLiteralWhoseChannelGoesThroughAnAliasFallsBackToWhatExecuteTakesAndIsRecognised(t *testing.T) {
	// The alias is not a command type of the context, so the channel is not read as a command;
	// the handler's Execute says which command it answers, as when the entry spells no channel.
	assertRecognised(t, probe(t,
		edit{notesModule, shareListed,
			"application.Subscription{Channel: domain.NameOfType[share](), Handlers: application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts))).Handlers},"},
		edit{notesModule, applicationImport, applicationImport + domainImport},
		edit{notesModule, beforeModule, "type share = commands.ShareNoteCommandEvent\n\n" + beforeModule},
	))
}

// What a reaction publishes is read from the call that sends it through the outbox (ADR 30):
// the contract built inline or held in a variable is read; a contract built and sent nowhere is
// a policy that tells nobody, caught by the inventory.

const (
	noteSharedReaction = "go/contexts/notes/application/events/note_shared_handler.go"
	noteSharedSent     = "application.PublishIntegrationEvent(integrationevents.NoteSharedIntegrationEvent{"
	noteSharedClosed   = "\t}, ctx)\n\treturn nil"
)

func TestAReactionPublishingItsContractThroughAVariableIsRecognised(t *testing.T) {
	assertRecognised(t, probe(t,
		edit{noteSharedReaction, noteSharedSent, "contract := integrationevents.NoteSharedIntegrationEvent{"},
		edit{noteSharedReaction, noteSharedClosed, "\t}\n\tapplication.PublishIntegrationEvent(contract, ctx)\n\treturn nil"},
	))
}

func TestAReactionBuildingItsContractAndSendingItNowhereIsCaughtByTheInventory(t *testing.T) {
	verdict := probe(t,
		edit{noteSharedReaction, noteSharedSent, "_ = integrationevents.NoteSharedIntegrationEvent{"},
		edit{noteSharedReaction, noteSharedClosed, "\t}\n\treturn nil"},
	)
	assertCaught(t, verdict, nil, []string{
		staleInventory,
		"ARCH-ONE-APPLICATION: Notes: the policy on NoteShared differs: publishes [NoteShared] → []",
	})
}
