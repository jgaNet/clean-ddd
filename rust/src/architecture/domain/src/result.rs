//! `DomainResult` is how an operation says whether it worked. An expected failure (a refused
//! command, an invalid value) is a value the caller must look at, not a panic it may forget to
//! catch (ADR 1).
//!
//! In TypeScript this took a class, `Result`, with `isSuccess()` / `isFailure()` narrowing the
//! type. In Rust it is the language's own `Result`, with the [`Exception`] as its error: write
//! `DomainResult<T>` in signatures, `Ok(value)` / `Err(exception)` to build one, and `?` where
//! TypeScript wrote `if (title.isFailure()) return title;`:
//!
//! ```ignore
//! pub fn create(props: NewNote) -> DomainResult<Note> {
//!     let title = NoteTitle::create(&props.title)?;   // a failure is returned as is, whatever T
//!     Ok(Note::new(/* … */))
//! }
//! ```
//!
//! A `panic!` is for a programming error and corrupted state only (`from_snapshot` on data that
//! should never have been stored), never for a refusal.

use crate::exception::Exception;

/// The outcome of an operation: the value, or the rule that refused it.
pub type DomainResult<T = ()> = Result<T, Exception>;
