package bootstrap

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// The Notifications routes, end to end: an inbox, and the live channel over the websocket.

func TestAnInboxListsWhatWasDeliveredMarksReadOnceAndStaysPrivate(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()

	// Carol's sign-up and validation each produce one email notification for her.
	carolID := app.SignUpValidated("carol@notes.fr", "carol")
	carol := app.AgentAs("carol@notes.fr", "carol")

	inbox := carol.Get("/notifications/account/" + carolID)
	if inbox.Status != http.StatusOK {
		t.Fatalf("inbox: %d %s", inbox.Status, inbox.Text)
	}
	body := inbox.Object()
	if body["total"] != float64(2) || body["unread"] != float64(2) {
		t.Fatalf("counts: %v", body)
	}
	notifications := body["notifications"].([]any)
	for _, item := range notifications {
		notice := item.(map[string]any)
		if notice["status"] != "SENT" || notice["deliveredVia"] != "EMAIL" {
			t.Fatalf("delivered: %v", notice)
		}
		if _, has := notice["attempts"]; has {
			t.Fatal("no attempts on the read model")
		}
	}
	first := notifications[0].(map[string]any)

	// The recipient marks one read, once
	read := app.Accepted(carol, carol.Patch("/notifications/"+first["id"].(string)+"/read", nil))
	if read["status"] != "SUCCESS" || read["name"] != "MarkAsReadNotification" {
		t.Fatalf("read: %v", read)
	}
	after := carol.Get("/notifications/account/" + carolID).Object()
	if after["unread"] != float64(1) {
		t.Fatalf("unread: %v", after)
	}
	for _, item := range after["notifications"].([]any) {
		notice := item.(map[string]any)
		if notice["id"] == first["id"] {
			if notice["status"] != "READ" {
				t.Fatalf("READ: %v", notice)
			}
			if _, ok := notice["readAt"].(string); !ok {
				t.Fatalf("readAt: %v", notice)
			}
		}
	}
	again := app.Accepted(carol, carol.Patch("/notifications/"+first["id"].(string)+"/read", nil))
	if again["status"] != "ERROR" || again["error"].(map[string]any)["type"] != "NotificationAlreadyRead" {
		t.Fatalf("again: %v", again)
	}

	// An administrator may read any inbox; another user may not
	if admin.Get("/notifications/account/"+carolID).Status != http.StatusOK {
		t.Fatal("admin reads any inbox")
	}
	app.SignUpValidated("dave@notes.fr", "dave")
	dave := app.AgentAs("dave@notes.fr", "dave")
	if dave.Get("/notifications/account/"+carolID).Status != http.StatusForbidden {
		t.Fatal("another user may not")
	}

	// Sending by hand is an administrator's; the refusal is the guard's, on the operation
	body2 := map[string]any{"recipientId": carolID, "title": "Hi", "content": "there", "channels": []string{"EMAIL"}}
	sent := app.Accepted(dave, dave.Post("/notifications", body2))
	if sent["error"].(map[string]any)["type"] != "NotAllowed" || sent["name"] != "SendNotification" {
		t.Fatalf("by hand: %v", sent)
	}
}

func TestAConnectedBrowserIsToldLiveHowItsCommandsWent(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()
	token := app.Login("admin@admin.fr", "admin").Object()["token"].(string)
	wsURL := strings.Replace(app.Root, "http://", "ws://", 1) + "/ws?token=" + token

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	socket, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = socket.CloseNow() }()

	created := admin.Post("/notes", map[string]string{"title": "Live", "content": "wire"})
	if created.Status != http.StatusAccepted {
		t.Fatalf("created: %d", created.Status)
	}
	_, frame, err := socket.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(frame), `id="notifications"`) || !strings.Contains(string(frame), "succeeded") {
		t.Fatalf("frame: %s", frame)
	}

	// A notification sent by hand over the websocket reaches the connected recipient at once
	adminID := admin.Get("/auth/me").Object()["id"].(string)
	sent := admin.Post("/notifications", map[string]any{"recipientId": adminID, "title": "Hello", "content": "<b>live</b>", "channels": []string{"WEBSOCKET"}})
	live := false
	for i := 0; i < 2 && !live; i++ {
		_, frame, err := socket.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		live = strings.Contains(string(frame), "<b>live</b>")
	}
	if !live {
		t.Fatal("the hand-sent notification reached the socket")
	}
	if app.Accepted(admin, sent)["status"] != "SUCCESS" {
		t.Fatal("sent")
	}

	// An anonymous connection is closed at once
	anonymous, _, err := websocket.Dial(ctx, strings.Replace(app.Root, "http://", "ws://", 1)+"/ws", nil)
	if err == nil {
		if _, _, err := anonymous.Read(ctx); err == nil {
			t.Fatal("an anonymous connection must be closed")
		}
		_ = anonymous.CloseNow()
	}
}
