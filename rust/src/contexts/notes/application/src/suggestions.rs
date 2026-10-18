//! The port for a decision the domain cannot make from its own state: what a note should be
//! called, given its content. Its answer is not reproducible from the business state alone (a
//! model, a heuristic, a person may all stand behind it), so it enters the domain as a value the
//! aggregate validates and may refuse. Named for what it decides, not for the technology (ADR 7).

use std::future::Future;

use chrono::{DateTime, Utc};
use serde::Serialize;

/// Where a title suggestion came from, kept with the suggestion so that an accepted one can be
/// traced back: which source, which version of it, when. An LLM adapter would put the model and
/// the prompt version here; the rule-based adapter puts its rule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SuggestionProvenance {
    pub source: String,
    pub version: String,
    pub at: DateTime<Utc>,
}

/// What the source proposes. Whether the note accepts it is the aggregate's decision (`NoteTitle`'s
/// rules). It is the operation's result, so a client reads it as JSON.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TitleSuggestion {
    pub title: String,
    pub provenance: SuggestionProvenance,
}

pub trait NoteTitleSuggestions {
    fn suggest(&self, content: &str) -> impl Future<Output = TitleSuggestion> + Send;
}
