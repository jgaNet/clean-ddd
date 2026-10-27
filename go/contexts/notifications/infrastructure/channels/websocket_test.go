package channels_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/contexts/notifications/infrastructure/channels"
)

// The channel against a real client: the caller is whoever the "subject" header names, the way
// the composition root's authentication would name them.

func serve(t *testing.T) (*channels.WebSocketChannel, string) {
	t.Helper()
	channel := channels.NewWebSocketChannel(nil, func(d notification.Delivery) string { return "<div>" + d.Content + "</div>" })
	server := httptest.NewServer(channel.Handler(func(r *http.Request) application.Auth {
		return application.Auth{SubjectID: r.Header.Get("subject"), Role: r.Header.Get("role")}
	}))
	t.Cleanup(server.Close)
	return channel, "ws" + strings.TrimPrefix(server.URL, "http")
}

func dial(t *testing.T, url string, headers http.Header) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return conn
}

func TestDeliversTheRenderedNotificationToTheConnectedRecipient(t *testing.T) {
	channel, url := serve(t)
	conn := dial(t, url, http.Header{"subject": {"bob"}, "role": {"USER"}})
	defer func() { _ = conn.CloseNow() }()

	deadline := time.Now().Add(5 * time.Second)
	for available, _ := channel.IsAvailableFor("bob"); !available; available, _ = channel.IsAvailableFor("bob") {
		if time.Now().After(deadline) {
			t.Fatalf("bob never got registered")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if available, _ := channel.IsAvailableFor("carol"); available {
		t.Fatalf("carol is not connected")
	}

	if err := channel.Deliver(notification.Delivery{NotificationID: "n", RecipientID: "bob", Content: "hi"}); err != nil {
		t.Fatalf("deliver: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	kind, frame, err := conn.Read(ctx)
	if err != nil || kind != websocket.MessageText || string(frame) != "<div>hi</div>" {
		t.Fatalf("frame = %q (%v, %v)", frame, kind, err)
	}

	if err := channel.Deliver(notification.Delivery{NotificationID: "n", RecipientID: "carol"}); err == nil {
		t.Fatalf("no open connection for carol is a refusal")
	}
}

func TestClosesAnAnonymousConnectionAtOnce(t *testing.T) {
	_, url := serve(t)
	conn := dial(t, url, nil)
	defer func() { _ = conn.CloseNow() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, _, err := conn.Read(ctx); websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
		t.Fatalf("expected a policy violation close, got %v", err)
	}
}
