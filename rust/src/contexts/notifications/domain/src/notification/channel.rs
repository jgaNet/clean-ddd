//! The ways a notification can reach someone. One infrastructure adapter per value (the
//! `NotificationChannel` port).

use architecture_domain::DomainResult;

use super::notification_exceptions::unknown_channel;

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

    /// The names a client sent, as channels, or the first one the domain does not know refused
    /// (`UnknownChannel`): whether a name is a channel is the domain's to say, not the request's
    /// (API-BODY-SHAPE). An empty list is the delivery strategy's refusal.
    pub fn parse_all(names: &[String]) -> DomainResult<Vec<Channel>> {
        names.iter().map(|name| Channel::parse(name).ok_or_else(|| unknown_channel(name))).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notification::notification_exceptions::UNKNOWN_CHANNEL;

    #[test]
    fn refuses_a_channel_it_does_not_know_by_name() {
        let refused = Channel::parse_all(&["EMAIL".into(), "FAX".into()]).expect_err("unknown");
        assert!(refused.is(UNKNOWN_CHANNEL));
        let known = Channel::parse_all(&["WEBSOCKET".into(), "EMAIL".into()]).expect("known");
        assert_eq!(known, vec![Channel::WebSocket, Channel::Email]);
    }
}
