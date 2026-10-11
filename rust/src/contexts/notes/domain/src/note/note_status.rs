//! The lifecycle of a note. A note starts `Active`, can be `Archived`, and can come back. The
//! transitions themselves are enforced by the `Note` aggregate, not by this enum.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteStatus {
    Active,
    Archived,
}

impl NoteStatus {
    pub const ALL: [NoteStatus; 2] = [NoteStatus::Active, NoteStatus::Archived];

    /// The name the outside world uses: the variant, in uppercase.
    pub fn as_str(self) -> &'static str {
        match self {
            NoteStatus::Active => "ACTIVE",
            NoteStatus::Archived => "ARCHIVED",
        }
    }

    pub fn parse(value: &str) -> Option<NoteStatus> {
        Self::ALL.into_iter().find(|status| status.as_str() == value)
    }
}
