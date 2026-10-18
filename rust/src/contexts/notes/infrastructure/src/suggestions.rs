//! The local adapter of `NoteTitleSuggestions`: the first line of the content, as it is. It is a
//! heuristic standing where a model would stand; an LLM adapter implements the same port and
//! nothing else changes. On purpose it does not trim its proposal to `NoteTitle`'s rules: a blank
//! first line or a very long one is proposed as such, and the aggregate refuses it, which is the
//! point of ADR 7.

use std::time::SystemTime;

use notes_application::suggestions::{NoteTitleSuggestions, SuggestionProvenance, TitleSuggestion};

pub struct FirstLineTitleSuggestions;

impl FirstLineTitleSuggestions {
    pub const VERSION: &'static str = "first-line/1";
}

impl NoteTitleSuggestions for FirstLineTitleSuggestions {
    async fn suggest(&self, content: &str) -> TitleSuggestion {
        TitleSuggestion {
            title: content.lines().next().unwrap_or_default().trim().to_string(),
            provenance: SuggestionProvenance {
                source: "heuristic".into(),
                version: Self::VERSION.into(),
                at: SystemTime::now(),
            },
        }
    }
}
