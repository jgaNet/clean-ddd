//! Live delivery to a connected browser. The channel owns the sockets: a registry of the open
//! connections per account, fed by the `/ws` route it exposes (axum, a library this layer may
//! see; the bootstrap merges the route). What is written on the wire is decided by the `render`
//! function the wiring hands in, so this adapter knows nothing about the format.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use architecture_application::{Auth, Logger};
use axum::Router;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Extension, State};
use axum::response::Response;
use axum::routing::get;
use notifications_domain::notification::Channel;
use notifications_domain::notification::ports::notification_channel::{Delivery, NotificationChannel};
use tokio::sync::mpsc;

type Render = Box<dyn Fn(&Delivery) -> String + Send + Sync>;

pub struct WebSocketChannel {
    logger: Arc<dyn Logger>,
    render: Render,
    clients: Mutex<HashMap<String, Vec<mpsc::UnboundedSender<String>>>>,
}

impl WebSocketChannel {
    pub fn new(logger: Arc<dyn Logger>, render: impl Fn(&Delivery) -> String + Send + Sync + 'static) -> Self {
        Self { logger, render: Box::new(render), clients: Mutex::new(HashMap::new()) }
    }

    /// The `/ws` route: an authenticated caller keeps a socket open, an anonymous one is closed.
    pub fn routes(self: Arc<Self>) -> Router {
        Router::new().route("/ws", get(connect)).with_state(self)
    }

    /// Registers an outlet for an account; what is sent to it reaches the socket behind it.
    pub fn attach(&self, subject_id: &str) -> mpsc::UnboundedReceiver<String> {
        let (sender, receiver) = mpsc::unbounded_channel();
        self.clients().entry(subject_id.to_string()).or_default().push(sender);
        self.logger.info("websocket", &format!("User {subject_id} connected to WebSocket"));
        receiver
    }

    fn forget_closed(&self, subject_id: &str) {
        let mut clients = self.clients();
        if let Some(outlets) = clients.get_mut(subject_id) {
            outlets.retain(|outlet| !outlet.is_closed());
            if outlets.is_empty() {
                clients.remove(subject_id);
                self.logger.info("websocket", &format!("User {subject_id} disconnected from WebSocket"));
            }
        }
    }

    fn clients(&self) -> std::sync::MutexGuard<'_, HashMap<String, Vec<mpsc::UnboundedSender<String>>>> {
        self.clients.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl NotificationChannel for WebSocketChannel {
    fn channel(&self) -> Channel {
        Channel::WebSocket
    }

    async fn is_available_for(&self, recipient_id: &str) -> bool {
        self.forget_closed(recipient_id);
        self.clients().get(recipient_id).is_some_and(|outlets| !outlets.is_empty())
    }

    async fn deliver(&self, delivery: &Delivery) -> Result<(), String> {
        self.forget_closed(&delivery.recipient_id);
        let message = (self.render)(delivery);
        let outlets = self.clients().get(&delivery.recipient_id).cloned().unwrap_or_default();
        let reached = outlets.iter().filter(|outlet| outlet.send(message.clone()).is_ok()).count();
        if reached == 0 {
            return Err(format!("No open connection for {}", delivery.recipient_id));
        }
        Ok(())
    }
}

async fn connect(
    State(channel): State<Arc<WebSocketChannel>>,
    Extension(auth): Extension<Auth>,
    upgrade: WebSocketUpgrade,
) -> Response {
    upgrade.on_upgrade(move |socket| serve(channel, auth, socket))
}

async fn serve(channel: Arc<WebSocketChannel>, auth: Auth, mut socket: WebSocket) {
    let Some(subject_id) = auth.subject_id else {
        let _ = socket.send(Message::Close(None)).await;
        return;
    };
    let mut outlet = channel.attach(&subject_id);
    loop {
        tokio::select! {
            message = outlet.recv() => match message {
                Some(text) => if socket.send(Message::Text(text.into())).await.is_err() { break },
                None => break,
            },
            received = socket.recv() => match received {
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            },
        }
    }
    drop(outlet);
    channel.forget_closed(&subject_id);
}

#[cfg(test)]
mod tests {
    use notifications_domain::notification::Metadata;

    use super::*;

    struct Quiet;
    impl Logger for Quiet {
        fn info(&self, _: &str, _: &str) {}
        fn warn(&self, _: &str, _: &str) {}
        fn error(&self, _: &str, _: &str, _: &str) {}
        fn debug(&self, _: &str, _: &str) {}
    }

    fn a_delivery(recipient_id: &str) -> Delivery {
        Delivery {
            notification_id: "n1".into(),
            recipient_id: recipient_id.into(),
            title: "Hello".into(),
            content: "World".into(),
            metadata: Metadata::new(),
        }
    }

    #[test]
    fn is_available_for_a_connected_account_only_and_writes_what_the_wiring_renders() {
        let channel = WebSocketChannel::new(Arc::new(Quiet), |delivery| format!("<li>{}</li>", delivery.title));

        assert!(!pollster::block_on(channel.is_available_for("bob")));
        assert!(pollster::block_on(channel.deliver(&a_delivery("bob"))).is_err());

        let mut outlet = channel.attach("bob");
        assert!(pollster::block_on(channel.is_available_for("bob")));
        pollster::block_on(channel.deliver(&a_delivery("bob"))).expect("delivered");
        assert_eq!(outlet.try_recv().expect("a message"), "<li>Hello</li>");

        drop(outlet);
        assert!(!pollster::block_on(channel.is_available_for("bob")));
    }
}
