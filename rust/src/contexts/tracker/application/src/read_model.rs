//! A read model, shaped for one question — "how did my operation go?" — and nothing else. It is
//! what the API serves, so it serializes as the client reads it.

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationRecord {
    pub id: String,
    /// The public name of the command or event, e.g. `"CreateNote"`: its intent, without the suffix of its kind.
    pub name: String,
    /// `PENDING`, `SUCCESS`, `SENT` or `ERROR`.
    pub status: String,
    pub trace_id: String,
    /// The account that asked, when the request was authenticated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    // No payload: a command may carry a secret (the password at sign-up), and a client who
    // holds the operation id already knows what it asked for. Status, result and error are
    // what the record is for.
    /// What the handler answered on success, as JSON.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<OperationError>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<DateTime<Utc>>,
}

/// The refusal, in client words: the rule's kind (`type`, as TypeScript says it) and its message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OperationError {
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
}
