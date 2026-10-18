//! The lifecycle of an account. A self-registered account starts `Pending` until its email is
//! validated; an account registered by an administrator starts `Active`. Only an `Active`
//! account can authenticate. The transitions are enforced by the `Account` aggregate.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountStatus {
    Pending,
    Active,
}

impl AccountStatus {
    pub const ALL: [AccountStatus; 2] = [AccountStatus::Pending, AccountStatus::Active];

    /// The name the outside world uses: the variant, in uppercase.
    pub fn as_str(self) -> &'static str {
        match self {
            AccountStatus::Pending => "PENDING",
            AccountStatus::Active => "ACTIVE",
        }
    }

    pub fn parse(value: &str) -> Option<AccountStatus> {
        Self::ALL.into_iter().find(|status| status.as_str() == value)
    }
}
