//! `Pending` until a channel accepts it, then `Sent` (and `Read` once the recipient opens it),
//! or `Failed` when every channel of the strategy was tried. The aggregate owns the transitions.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotificationStatus {
    Pending,
    Sent,
    Read,
    Failed,
}

impl NotificationStatus {
    pub const ALL: [NotificationStatus; 4] =
        [NotificationStatus::Pending, NotificationStatus::Sent, NotificationStatus::Read, NotificationStatus::Failed];

    /// The name the outside world uses: the variant, in uppercase.
    pub fn as_str(self) -> &'static str {
        match self {
            NotificationStatus::Pending => "PENDING",
            NotificationStatus::Sent => "SENT",
            NotificationStatus::Read => "READ",
            NotificationStatus::Failed => "FAILED",
        }
    }

    pub fn parse(value: &str) -> Option<NotificationStatus> {
        Self::ALL.into_iter().find(|status| status.as_str() == value)
    }
}
