package bootstrap

import (
	"net/http"
	"strings"
	"testing"
)

// The Notes routes, end to end, as a client sees them: a note written, listed, read, edited,
// archived and restored, titled by a suggestion, shared with another account (which Notifications
// hears about) and refused for an unknown one. Every 202 is followed through the Tracker.

func noteTitled(t *testing.T, client *Client, title string) string {
	t.Helper()
	for _, note := range client.Get("/notes").Array() {
		if note["title"] == title {
			return note["id"].(string)
		}
	}
	t.Fatalf("no note titled %s", title)
	return ""
}

func TestANoteIsWrittenListedReadEditedArchivedAndRestored(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()

	empty := admin.Get("/notes")
	if empty.Status != http.StatusOK || empty.Text != "[]\n" && len(empty.Array()) != 0 {
		t.Fatalf("empty list: %d %s", empty.Status, empty.Text)
	}
	if app.Anonymous().Get("/notes").Status != http.StatusForbidden {
		t.Fatal("anonymous is refused")
	}

	created := app.Accepted(admin, admin.Post("/notes", map[string]string{"title": "title", "content": "content"}))
	if created["status"] != "SUCCESS" || created["name"] != "CreateNote" {
		t.Fatalf("created: %v", created)
	}
	noteID := created["result"].(string)
	list := admin.Get("/notes").Array()
	if len(list) != 1 || list[0]["id"] != noteID || list[0]["title"] != "title" || list[0]["status"] != "ACTIVE" || len(list[0]) != 3 {
		t.Fatalf("list: %v", list)
	}
	detail := admin.Get("/notes/" + noteID).Object()
	if detail["title"] != "title" || detail["content"] != "content" || detail["status"] != "ACTIVE" || len(detail["sharedWith"].([]any)) != 0 {
		t.Fatalf("detail: %v", detail)
	}
	if _, ok := detail["ownerId"].(string); !ok {
		t.Fatalf("ownerId: %v", detail)
	}

	edited := app.Accepted(admin, admin.Put("/notes/"+noteID, map[string]string{"title": "edited", "content": "content 2"}))
	if edited["status"] != "SUCCESS" || admin.Get("/notes/" + noteID).Object()["title"] != "edited" {
		t.Fatalf("edited: %v", edited)
	}

	archived := app.Accepted(admin, admin.Post("/notes/"+noteID+"/archive", nil))
	if archived["status"] != "SUCCESS" || admin.Get("/notes/" + noteID).Object()["status"] != "ARCHIVED" {
		t.Fatalf("archived: %v", archived)
	}
	refused := app.Accepted(admin, admin.Put("/notes/"+noteID, map[string]string{"title": "x", "content": "y"}))
	if refused["error"].(map[string]any)["type"] != "NoteArchived" {
		t.Fatalf("an archived note refuses an edit: %v", refused)
	}
	restored := app.Accepted(admin, admin.Post("/notes/"+noteID+"/restore", nil))
	if restored["status"] != "SUCCESS" || admin.Get("/notes/" + noteID).Object()["status"] != "ACTIVE" {
		t.Fatalf("restored: %v", restored)
	}

	unknown := admin.Get("/notes/does-not-exist")
	if unknown.Status != http.StatusNotFound || unknown.Object()["message"] == "" {
		t.Fatalf("unknown: %d %s", unknown.Status, unknown.Text)
	}
}

func TestASuggestionEntersTheDomainAsAValue(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()

	app.Accepted(admin, admin.Post("/notes", map[string]string{"title": "Untitled", "content": "Groceries for Saturday\nmilk, eggs"}))
	noteID := noteTitled(t, admin, "Untitled")
	operation := app.Accepted(admin, admin.Post("/notes/"+noteID+"/suggest-title", nil))
	if operation["status"] != "SUCCESS" || operation["name"] != "SuggestNoteTitle" {
		t.Fatalf("suggestion: %v", operation)
	}
	result := operation["result"].(map[string]any)
	provenance := result["provenance"].(map[string]any)
	if result["title"] != "Groceries for Saturday" || provenance["source"] != "heuristic" || provenance["version"] != "first-line/1" {
		t.Fatalf("result: %v", result)
	}
	if _, ok := provenance["at"].(string); !ok {
		t.Fatalf("provenance.at: %v", provenance)
	}
	if admin.Get("/notes/" + noteID).Object()["title"] != "Groceries for Saturday" {
		t.Fatal("the title applied")
	}

	app.Accepted(admin, admin.Post("/notes", map[string]string{"title": "Long first line", "content": strings.Repeat("x", 120) + "\nsecond line"}))
	long := noteTitled(t, admin, "Long first line")
	refused := app.Accepted(admin, admin.Post("/notes/"+long+"/suggest-title", nil))
	if refused["status"] != "ERROR" || refused["error"].(map[string]any)["type"] != "NoteTitleTooLong" {
		t.Fatalf("refused: %v", refused)
	}
	if admin.Get("/notes/" + long).Object()["title"] != "Long first line" {
		t.Fatal("the title kept")
	}
}

func TestSharingANoteNotifiesTheRecipientAndLetsThemReadIt(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()
	bobID := app.SignUpValidated("bob@notes.fr", "bob")

	app.Accepted(admin, admin.Post("/notes", map[string]string{"title": "Roadmap", "content": "Q4 plans"}))
	noteID := noteTitled(t, admin, "Roadmap")

	// An unknown account, oneself: refused by the domain, through the port to Security
	unknown := app.Accepted(admin, admin.Post("/notes/"+noteID+"/share", map[string]string{"recipientId": "00000000-0000-4000-8000-000000000000"}))
	if unknown["status"] != "ERROR" || unknown["error"].(map[string]any)["type"] != "RecipientNotFound" || unknown["name"] != "ShareNote" {
		t.Fatalf("unknown recipient: %v", unknown)
	}
	adminID := admin.Get("/auth/me").Object()["id"].(string)
	self := app.Accepted(admin, admin.Post("/notes/"+noteID+"/share", map[string]string{"recipientId": adminID}))
	if self["error"].(map[string]any)["type"] != "CannotShareWithSelf" {
		t.Fatalf("oneself: %v", self)
	}

	shared := app.Accepted(admin, admin.Post("/notes/"+noteID+"/share", map[string]string{"recipientId": bobID}))
	if shared["status"] != "SUCCESS" {
		t.Fatalf("shared: %v", shared)
	}
	again := app.Accepted(admin, admin.Post("/notes/"+noteID+"/share", map[string]string{"recipientId": bobID}))
	if again["error"].(map[string]any)["type"] != "NoteAlreadyShared" {
		t.Fatalf("twice: %v", again)
	}

	// Bob sees it among the notes shared with him, reads it, and was notified
	bob := app.AgentAs("bob@notes.fr", "bob")
	list := bob.Get("/notes/shared").Array()
	if len(list) != 1 || list[0]["id"] != noteID || list[0]["title"] != "Roadmap" || list[0]["content"] != "Q4 plans" || list[0]["ownerId"] != adminID {
		t.Fatalf("shared list: %v", list)
	}
	if bob.Get("/notes/"+noteID).Status != http.StatusOK {
		t.Fatal("bob reads it")
	}
	if bob.Get("/notes").Status != http.StatusOK || len(bob.Get("/notes").Array()) != 0 {
		t.Fatal("bob owns no note")
	}
	inbox := bob.Get("/notifications/account/" + bobID).Object()
	found := false
	for _, item := range inbox["notifications"].([]any) {
		notice := item.(map[string]any)
		if notice["title"] == "A note was shared with you: Roadmap" {
			found = true
			metadata := notice["metadata"].(map[string]any)
			if notice["recipientId"] != bobID || metadata["noteId"] != noteID || metadata["source"] != "Notes.NoteShared" {
				t.Fatalf("notice: %v", notice)
			}
		}
	}
	if !found {
		t.Fatalf("no share notice in %v", inbox)
	}
}
