package channels

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notifications/domain/notification"
	kernel "clean-ddd/sharedkernel/domain"
)

// WebSocketChannel is live delivery to a connected browser. The channel owns the sockets; what
// is written on the wire is decided by the render function the wiring hands in (an HTMX
// presenter here), so this adapter knows nothing about markup. Handler is the /ws endpoint the
// composition root mounts at the root: a connection is accepted for a signed-in caller (the
// caller the composition root's authentication identified, as for any request) and kept until
// the browser leaves; an anonymous one is closed at once.
type WebSocketChannel struct {
	logger application.Logger
	render func(notification.Delivery) string

	mu      sync.Mutex
	clients map[string]map[*websocket.Conn]struct{}
}

// writeTimeout bounds one frame to one browser: a stalled socket must not hold a delivery.
const writeTimeout = 5 * time.Second

func NewWebSocketChannel(logger application.Logger, render func(notification.Delivery) string) *WebSocketChannel {
	return &WebSocketChannel{logger: logger, render: render, clients: map[string]map[*websocket.Conn]struct{}{}}
}

func (c *WebSocketChannel) Channel() notification.Channel { return notification.ChannelWebSocket }

func (c *WebSocketChannel) IsAvailableFor(recipientID string) (bool, error) {
	return len(c.openSockets(recipientID)) > 0, nil
}

// Deliver writes the rendered notification to every open socket of the recipient; a socket that
// refuses the frame is dropped, and no socket at all is the channel's refusal.
func (c *WebSocketChannel) Deliver(delivery notification.Delivery) error {
	sockets := c.openSockets(delivery.RecipientID)
	if len(sockets) == 0 {
		return domain.Unknown(fmt.Sprintf("No open connection for %s", delivery.RecipientID), nil)
	}
	message := []byte(c.render(delivery))
	written := 0
	for _, socket := range sockets {
		ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
		err := socket.Write(ctx, websocket.MessageText, message)
		cancel()
		if err != nil {
			c.unregister(delivery.RecipientID, socket)
			continue
		}
		written++
	}
	if written == 0 {
		return domain.Unknown(fmt.Sprintf("No open connection for %s", delivery.RecipientID), nil)
	}
	return nil
}

// Handler serves the websocket endpoint. The composition root passes the function that reads
// the caller of a request, since this adapter cannot import the presentation building block:
// an anonymous caller (no subject, a guest, an unknown role) is accepted and closed at once
// with a policy violation, so that the client sees a closed connection; a signed-in one is
// registered under its subject id until the connection ends.
func (c *WebSocketChannel) Handler(callerOf func(r *http.Request) application.Auth) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// The API already answers other origins through CORS; the socket follows the same policy.
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer func() { _ = conn.CloseNow() }()

		auth := callerOf(r)
		if !signedIn(auth) {
			_ = conn.Close(websocket.StatusPolicyViolation, "authentication required")
			return
		}

		c.register(auth.SubjectID, conn)
		c.log(fmt.Sprintf("User %s connected to WebSocket", auth.SubjectID))
		defer func() {
			c.unregister(auth.SubjectID, conn)
			c.log(fmt.Sprintf("User %s disconnected from WebSocket", auth.SubjectID))
		}()

		// The browser sends nothing; reading waits for it to leave, and answers its pings meanwhile.
		for {
			if _, _, err := conn.Read(r.Context()); err != nil {
				return
			}
		}
	})
}

func signedIn(auth application.Auth) bool {
	role, known := kernel.ParseRole(auth.Role)
	return auth.SubjectID != "" && known && role != kernel.RoleGuest
}

func (c *WebSocketChannel) openSockets(recipientID string) []*websocket.Conn {
	c.mu.Lock()
	defer c.mu.Unlock()
	sockets := make([]*websocket.Conn, 0, len(c.clients[recipientID]))
	for socket := range c.clients[recipientID] {
		sockets = append(sockets, socket)
	}
	return sockets
}

func (c *WebSocketChannel) register(subjectID string, conn *websocket.Conn) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.clients[subjectID] == nil {
		c.clients[subjectID] = map[*websocket.Conn]struct{}{}
	}
	c.clients[subjectID][conn] = struct{}{}
}

func (c *WebSocketChannel) unregister(subjectID string, conn *websocket.Conn) {
	c.mu.Lock()
	defer c.mu.Unlock()
	sockets := c.clients[subjectID]
	delete(sockets, conn)
	if len(sockets) == 0 {
		delete(c.clients, subjectID)
	}
}

func (c *WebSocketChannel) log(message string) {
	if c.logger != nil {
		c.logger.Info(message, nil)
	}
}
