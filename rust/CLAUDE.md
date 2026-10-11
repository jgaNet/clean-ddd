# Working on this repository (guide for AI assistance)

This is the **Rust implementation** of the Clean Architecture + Domain-Driven Design reference. The rules themselves, and what every language of the reference shares, are in the root [CLAUDE.md](../CLAUDE.md); this guide is Rust's: its commands, where its things are, how a feature is added here. Before changing anything, read the [README](README.md): it says what is written so far, how the decisions land in Rust, and maps every concept to the file that shows it. The TypeScript guide ([`typescript/CLAUDE.md`](../typescript/CLAUDE.md)) is the fuller one: the shape of a feature is the same, and the questions it answers (where a rule lives, whether an event needs a handler, which verb) are answered the same way here.

Every command below runs from this directory (`cd rust`).

## Commands

```bash
cargo run -p conventions                    # the crate graph is the table, the tree matches the binding, every named file exists
cargo fmt --check                           # rustfmt (cargo fmt to apply)
cargo clippy --all-targets -- -D warnings   # the lints, warnings refused
cargo test                                  # every #[test]; cargo test -p notes-domain for one crate, cargo test <name> for one test
yarn --cwd ../typescript architecture rule <ID> | concept <id> | checklist <kind>   # the contract, asked (any language)
yarn --cwd ../typescript conventions:write  # re-render README.md after editing conventions/rust.yaml
```

All four `cargo` checks must pass before a change is done; CI runs them on every PR, from this directory.

## Where things are

```
src/architecture/domain/          crate architecture-domain: the building blocks' Domain (mechanics, no vocabulary)
src/shared_kernel/domain/         crate shared-kernel-domain: Email, Role
src/contexts/<context>/           one crate per layer (domain/, application/, infrastructure/, presentation/) and wiring/
  domain/src/<aggregate>/mod.rs   the aggregate; beside it <name>.rs value objects, events.rs, <aggregate>_exceptions.rs,
                                  dtos.rs (the snapshot), <rule>.rs domain services, ports/
tools/conventions/                the conventions check
../conventions/rust.yaml          this language's binding of the contract: contexts, trees, enforcers, checklists, canonical files
```

**Layers are crates.** A crate's `[dependencies]` are its row of the dependency table in [`conventions/architecture.yaml`](../conventions/architecture.yaml): `notes-domain` depends on `architecture-domain` and `shared-kernel-domain`, and on nothing else. Adding a dependency a row does not allow does not compile, and `cargo run -p conventions` names the rule. A crate is named after its tree and its layer (`architecture-domain`, `shared-kernel-domain`, `notes-domain`); its directory is the layer's name in lowercase. Inside a crate, a `use` names a sibling module (`super::note_title::NoteTitle`) or another crate by name; there is no path alias to bypass (ARCH-RELATIVE).

## The rules (enforced)

The rules are the contract's, the same in every language, and listed in the root [CLAUDE.md](../CLAUDE.md). What is Rust's is in [`conventions/rust.yaml`](../conventions/rust.yaml), this language's **binding**: the contexts, the trees, the libraries only an adapter may depend on, which tool holds each rule here (the crate graph for the dependency table, `cargo run -p conventions`, the compiler, a `#[test]`, review), what a new thing of each kind is made of (`yarn --cwd ../typescript architecture checklist <kind>`), and the file that shows each concept and each rule.

- **The architecture is data.** A new context goes in `contexts` of the binding, with one crate per layer; a new file worth pointing at goes under `concepts` of the binding; a new rule goes in the contract, and in no binding. Neither is edited to make a violation pass.

## How to add a feature (follow an existing one, do not invent a shape)

Only the Domain layer exists so far, so a feature here is a domain change; the steps below are the ones that apply today, in the order of the TypeScript guide.

1. **Domain first.** Add a behaviour to the aggregate that enforces the rule and records an event ([`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs)): check the rules with `?` on the private `ensure_*` helpers, change the state, `self.root.record(NoteEvent::…)`, return `Ok(())`. New concept with validation? A value object ([`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs)): a newtype, a private field, `create()` returning `DomainResult`, one exception per rule in [`note_exceptions.rs`](src/contexts/notes/domain/src/note/note_exceptions.rs) (a `kind` constant and a constructor). New rule about the whole collection, or a fact another context owns? A domain service generic over its port ([`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs)). A new fact is a new variant of the aggregate's event enum ([`events.rs`](src/contexts/notes/domain/src/note/events.rs)), named in the past tense, with its payload as fields.
2. **Tests beside the code**, in a `#[cfg(test)] mod tests` at the bottom of the file: every rule, the happy path and each refusal (`expect_err(...).is(KIND)`), and for an aggregate the round-trip through the snapshot. A port is doubled by a small struct implementing the trait; an `async` port is driven with `pollster::block_on`.
3. **The map.** A new file worth pointing at goes under `concepts` in [`conventions/rust.yaml`](../conventions/rust.yaml); then `yarn --cwd ../typescript conventions:write` and `cargo run -p conventions`.

The Application, Infrastructure and Presentation steps are the TypeScript guide's; when those crates exist here, this section grows with them.

## Code style

- Edition 2024, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt` applied (`rustfmt.toml`: 120 columns).
- Private fields everywhere in the domain; the only way into an aggregate is `create()` or `from_snapshot()`, the only way into a value object is `create()`. Accessors return references or copies, never `&mut`.
- `DomainResult<T>` in every signature that can refuse; `?` to pass a refusal on; `panic!` only for corrupted state, with the id in the message. No `unwrap()` outside tests; `expect("why")` in tests.
- `snake_case` files named after what they hold (`note_title.rs`, `note_sharing.rs`); `PascalCase` types; a `kind` constant in `SCREAMING_CASE` per rule (`NOT_NOTE_OWNER`); enum names in the outside world are the variant in uppercase (`NoteStatus::Active.as_str() == "ACTIVE"`).
- A doc comment (`//!` at the top of a file, `///` on an item) explains *why* the file exists and what rule it protects, in a few lines. No commented-out code.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`), one concern per PR, and the PR body states how it was verified.

## Things to avoid

- A trait object or a generic base type that reintroduces inheritance (`Box<dyn Aggregate>`); the aggregate holds its `AggregateRoot` and that is the whole mechanism.
- A dependency a crate's row does not allow, however convenient: the compiler says no, `cargo run -p conventions` says which rule, and the fix is a port, an integration event or a move — never an edit to the binding.
- A rule in `conventions/rust.yaml`: a binding points at files and holds no rule (ARCH-ONE-CONTRACT).
- A `Result` type of our own, a `Mapper`, a generic `Repository<T>`, a service locator or a DI container.
