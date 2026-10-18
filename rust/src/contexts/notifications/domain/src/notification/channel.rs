//! The ways a notification can reach someone. One infrastructure adapter per value (the
//! `NotificationChannel` port).

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Channel {
    WebSocket,
    Email,
}

impl Channel {
    pub const ALL: [Channel; 2] = [Channel::WebSocket, Channel::Email];

    /// The name the outside world uses: the variant, in uppercase.
    pub fn as_str(self) -> &'static str {
        match self {
            Channel::WebSocket => "WEBSOCKET",
            Channel::Email => "EMAIL",
        }
    }

    pub fn parse(value: &str) -> Option<Channel> {
        Self::ALL.into_iter().find(|channel| channel.as_str() == value)
    }
}
