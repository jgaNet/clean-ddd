//! The one table behind the SQLite adapters, and the two conversions between a row and the
//! snapshot the aggregate is rebuilt from. The repository and the queries share it, the way
//! their in-memory counterparts share one `InMemoryDataSource`: same store, two ports — a
//! `Connection` behind a mutex, since SQLite serialises its writers anyway.
//!
//! `shared_with` is a JSON array; SQLite's `json_each()` lets the queries filter on it without
//! a second table, which is all this reference needs. A real schema would normalise it.
//!
//! `CREATE TABLE IF NOT EXISTS` is enough because the store is created per process (an
//! in-memory database in tests). A file database that outlives the code would need a migration
//! for every new column; this reference has no migration mechanism, on purpose.

use std::sync::{Arc, Mutex, MutexGuard};

use notes_domain::note::{NoteSnapshot, NoteStatus};
use rusqlite::{Connection, Row};

/// The connection the two adapters share.
pub type Database = Arc<Mutex<Connection>>;

/// Opens an in-memory database with the notes table: what a test, or the local wiring, starts from.
pub fn in_memory_database() -> Database {
    let connection = Connection::open_in_memory().expect("an in-memory SQLite database");
    create_notes_table(&connection);
    Arc::new(Mutex::new(connection))
}

pub fn create_notes_table(connection: &Connection) {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id          TEXT PRIMARY KEY,
                owner_id    TEXT NOT NULL,
                title       TEXT NOT NULL,
                content     TEXT NOT NULL,
                status      TEXT NOT NULL,
                pinned      INTEGER NOT NULL,
                shared_with TEXT NOT NULL,
                version     INTEGER NOT NULL
            )",
        )
        .expect("the notes table");
}

pub fn lock(database: &Database) -> MutexGuard<'_, Connection> {
    database.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// `shared_with`, as the column stores it: a JSON array of ids.
pub fn shared_with_column(shared_with: &[String]) -> String {
    let quoted: Vec<String> = shared_with.iter().map(|id| format!("\"{}\"", id.replace('"', "\\\""))).collect();
    format!("[{}]", quoted.join(","))
}

fn shared_with_from_column(column: &str) -> Vec<String> {
    column
        .trim_matches(|c| c == '[' || c == ']')
        .split(',')
        .map(|id| id.trim().trim_matches('"').replace("\\\"", "\""))
        .filter(|id| !id.is_empty())
        .collect()
}

/// A full row of the table, as the aggregate is rebuilt from it.
pub fn to_snapshot(row: &Row<'_>) -> rusqlite::Result<NoteSnapshot> {
    let status: String = row.get("status")?;
    let shared_with: String = row.get("shared_with")?;
    let version: i64 = row.get("version")?;
    Ok(NoteSnapshot {
        id: row.get("id")?,
        owner_id: row.get("owner_id")?,
        title: row.get("title")?,
        content: row.get("content")?,
        status: NoteStatus::parse(&status).unwrap_or_else(|| panic!("Corrupted note row: status {status}")),
        pinned: row.get("pinned")?,
        shared_with: shared_with_from_column(&shared_with),
        version: u64::try_from(version).unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_shared_ids_as_a_json_array_and_reads_them_back() {
        let column = shared_with_column(&["bob".into(), "carol".into()]);

        assert_eq!(column, "[\"bob\",\"carol\"]");
        assert_eq!(shared_with_from_column(&column), ["bob", "carol"]);
        assert!(shared_with_from_column("[]").is_empty());
    }
}
