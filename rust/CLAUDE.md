# Working on this repository (guide for AI assistance)

This is the **Rust implementation** of the Clean Architecture + Domain-Driven Design reference. The rules themselves, and what every language of the reference shares, are in the root [CLAUDE.md](../CLAUDE.md); this guide is Rust's: its commands, where its things are, how a feature is added here. Before changing anything, read the [README](README.md): it says what is written so far, how the decisions land in Rust, and maps every concept to the file that shows it. The TypeScript guide ([`typescript/CLAUDE.md`](../typescript/CLAUDE.md)) is the fuller one: the shape of a feature is the same, and the questions it answers (where a rule lives, whether an event needs a handler, which verb) are answered the same way here.

Every command below runs from this directory (`cd rust`).

## Commands

```bash
cargo run -p conventions                    # the crate graph is the table, the tree matches the binding, every named file exists
cargo fmt --check                           # rustfmt (cargo fmt to apply)
cargo clippy --all-targets -- -D warnings   # the lints, warnings refused
cargo test                                  # every #[test], the end-to-end suites included; cargo test -p notes-domain for one crate, cargo test <name> for one test
cargo run -p bootstrap                      # serves the application on http://127.0.0.1:10000/v1
yarn --cwd ../typescript architecture rule <ID> | concept <id> | checklist <kind>   # the contract, asked (any language)
yarn --cwd ../typescript conventions:write  # re-render README.md after editing conventions/rust.yaml
```

All four `cargo` checks must pass before a change is done; CI runs them on every PR, from this directory.

## Where things are

```
src/architecture/<layer>/         the building blocks, one crate per layer: domain (Entity, Aggregate, ValueObject, Id,
                                  Event, Exception, DomainResult), application (the handler traits, ExecutionContext,
                                  EventBus, Operation, Module), infrastructure (the in-memory adapters, ConsoleLogger),
                                  presentation (accept() and the refusals)
src/shared_kernel/<layer>/        domain (Email, Role), application (require_signed_in, integration_events/)
src/contexts/<context>/           one crate per layer (domain/, application/, infrastructure/, presentation/) and wiring/
                                  (notes, security, notifications, tracker)
  domain/src/<aggregate>/mod.rs   the aggregate; beside it <name>.rs value objects, events.rs, <aggregate>_exceptions.rs,
                                  dtos.rs (the snapshot), <rule>.rs domain services, ports/
  application/src/                commands/<use_case>.rs, queries/<use_case>.rs, events/<name>_handler.rs, the ports the
                                  Application owns (suggestions.rs)
  infrastructure/src/             the adapters, and the contract test of a port with several adapters
  presentation/src/               the routes of the context: a Router, a function per route, the bodies and the views
  wiring/src/lib.rs               local_<context>_module(): the Module as data, and what the context exports
src/bootstrap/                    the composition root (create_application.rs), the settings, the binary, and tests/:
                                  the end-to-end suites, over HTTP, with tests/support/mod.rs booting the application
tools/conventions/                the conventions check
../conventions/rust.yaml          this language's binding of the contract: contexts, trees, enforcers, checklists, canonical files
```

**Layers are crates.** A crate's `[dependencies]` are its row of the dependency table in [`conventions/architecture.yaml`](../conventions/architecture.yaml): `notes-domain` depends on `architecture-domain` and `shared-kernel-domain`, and on nothing else. Adding a dependency a row does not allow does not compile, and `cargo run -p conventions` names the rule. A crate is named after its tree and its layer (`architecture-domain`, `shared-kernel-domain`, `notes-domain`); its directory is the layer's name in lowercase. Inside a crate, a `use` names a sibling module (`super::note_title::NoteTitle`) or another crate by name; there is no path alias to bypass (ARCH-RELATIVE).

## The rules (enforced)

The rules are the contract's, the same in every language, and listed in the root [CLAUDE.md](../CLAUDE.md). What is Rust's is in [`conventions/rust.yaml`](../conventions/rust.yaml), this language's **binding**: the contexts, the trees, the libraries only an adapter may depend on, which tool holds each rule here (the crate graph for the dependency table, `cargo run -p conventions`, the compiler, a `#[test]`, review), what a new thing of each kind is made of (`yarn --cwd ../typescript architecture checklist <kind>`), and the file that shows each concept and each rule.

- **The architecture is data.** A new context goes in `contexts` of the binding, with one crate per layer; a new file worth pointing at goes under `concepts` of the binding; a new rule goes in the contract, and in no binding. Neither is edited to make a violation pass.

## How to add a feature (follow an existing one, do not invent a shape)

Ask the contract first: `yarn --cwd ../typescript architecture checklist <kind>` lists what a new one is made of in Rust and where it goes, with the placeholders filled in snake_case; `plan validate|explain` works on a plan that says `language: rust` ([`conventions/plans/share-a-note.rust.yaml`](../conventions/plans/share-a-note.rust.yaml) is the example). The questions the TypeScript guide answers (verbs, where a spec goes, whether an event needs a handler, a guard on an event handler) are answered the same way here.

1. **Domain first.** Add a behaviour to the aggregate that enforces the rule and records an event ([`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs)): check the rules with `?` on the private `ensure_*` helpers, change the state, `self.root.record(NoteEvent::…)`, return `Ok(())`. A pure read skips the aggregate: its first step is a read model and a method on the queries port ([`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs)). New concept with validation? A value object ([`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs)): a newtype, a private field, `create()` returning `DomainResult`, one exception per rule in [`note_exceptions.rs`](src/contexts/notes/domain/src/note/note_exceptions.rs) (a `kind` constant and a constructor). New rule about the whole collection, or a fact another context owns? A domain service generic over its port ([`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs)). A new fact is a new variant of the aggregate's event enum ([`events.rs`](src/contexts/notes/domain/src/note/events.rs)), named in the past tense, with its payload as fields. Tests at the bottom of the file.
2. **Command + handler**, in one file copied from [`edit_note.rs`](src/contexts/notes/application/src/commands/edit_note.rs): the command struct with its `NAME`, the handler generic over its ports with `execute()` — `require_signed_in` → load → ask the aggregate → `save(&note).await?` → `publish_domain_events(note, context).await`. Or a query handler from [`get_note.rs`](src/contexts/notes/application/src/queries/get_note.rs). One `pub mod` line in `commands/mod.rs` or `queries/mod.rs`; the tests of the handlers of one aggregate share the fixture at the bottom of [`commands/mod.rs`](src/contexts/notes/application/src/commands/mod.rs), with the in-memory repository as the double and the in-memory bus with a recording handler to see what was published.
3. **Infrastructure** only if a port changed. A new adapter of an existing port is added to `adapters()` in [`persistence_contract.rs`](src/contexts/notes/infrastructure/src/persistence_contract.rs) and must pass it unchanged; that is the whole review — the SQLite pair in [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs) and [`queries.rs`](src/contexts/notes/infrastructure/src/queries.rs) got in that way.
4. **Route + controller** in the context's `presentation` crate ([`notes/presentation`](src/contexts/notes/presentation/src/lib.rs)): one `async fn` per route, taking the request's `Extension<ExecutionContext>` and, for a query, the module from `State`. A command is `accept(&context, TheCommand { … })` — the `202` goes out, the dispatch runs after; a query is `module.query::<TheQuery>().handle(TheQuery { … }, &context).await`, answered through a view struct (`#[serde(rename_all = "camelCase")]`) or refused through the file's `refuse()`, which maps the context's own kinds before `status_of()`. A request body is a serde struct beside the route. An answer the HTMX front end also wants is a `const ByFormat` of two `Presenter`s, picked by `format_of(&headers)` ([`security/presentation/presenters.rs`](src/contexts/security/presentation/src/presenters.rs)); JSON is mandatory, HTMX optional. The verb follows the HTTP grammar (`yarn --cwd ../typescript architecture verbs`): `POST /notes` creates, `PUT /notes/{id}` replaces, `POST /notes/{id}/share` acts. Prove it end to end in [`src/bootstrap/tests`](src/bootstrap/tests): follow a `202` with `app.accepted(&client, response)`, which polls the operation to its outcome.
5. **List it in the wiring** ([`wiring/src/lib.rs`](src/contexts/notes/wiring/src/lib.rs)): `Subscription::command(handler)` for a command, `query(handler)` for a query, `Subscription::reaction("<TheFact>", handler)` for a reaction.
6. Cross-context reaction? Publish an integration event from a domain event handler ([`notes/.../note_shared_handler.rs`](src/contexts/notes/application/src/events/note_shared_handler.rs)): the contract is an enum in the shared kernel's `integration_events/`, with its published name. The consuming context reacts with an anti-corruption handler in its own `events/` ([`notifications/.../note_shared_handler.rs`](src/contexts/notifications/application/src/events/note_shared_handler.rs)): it knows the contract and nothing else of the other context, restates the fact in its own words, and calls its own use case; listed in its wiring under `integration_events`, on the contract's published name.
7. **The map.** A new file worth pointing at goes under `concepts` in [`conventions/rust.yaml`](../conventions/rust.yaml); then `yarn --cwd ../typescript conventions:write` and `cargo run -p conventions`.

## Code style

- Edition 2024, `cargo clippy --all-targets -- -D warnings` clean, `cargo fmt` applied (`rustfmt.toml`: 120 columns).
- Private fields everywhere in the domain; the only way into an aggregate is `create()` or `from_snapshot()`, the only way into a value object is `create()`. Accessors return references or copies, never `&mut`.
- `DomainResult<T>` in every signature that can refuse; `?` to pass a refusal on; `panic!` only for corrupted state, with the id in the message. No `unwrap()` outside tests; `expect("why")` in tests. A handler never catches: the provided `handle()` is the safety net.
- A handler takes its ports in `new()`, generic over their traits, shared in `Arc` with the other handlers of the aggregate; the only state it holds is those ports (ARCH-EXECUTION-CONTEXT: a clock, a mailer, a model client is such a port, never a member of the context).
- Only [`logging.rs`](src/architecture/infrastructure/src/logging.rs) and the tools print: the workspace denies `println!` and `eprintln!` everywhere else; a handler logs through `context.logger()`.
- `snake_case` files named after what they hold (`note_title.rs`, `note_sharing.rs`); `PascalCase` types; a `kind` constant in `SCREAMING_CASE` per rule (`NOT_NOTE_OWNER`); enum names in the outside world are the variant in uppercase (`NoteStatus::Active.as_str() == "ACTIVE"`).
- A doc comment (`//!` at the top of a file, `///` on an item) explains *why* the file exists and what rule it protects, in a few lines. No commented-out code.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`), one concern per PR, and the PR body states how it was verified.

## Things to avoid

- A trait object or a generic base type that reintroduces inheritance (`Box<dyn Aggregate>`); the aggregate holds its `AggregateRoot` and that is the whole mechanism.
- A dependency a crate's row does not allow, however convenient: the compiler says no, `cargo run -p conventions` says which rule, and the fix is a port, an integration event or a move — never an edit to the binding.
- A rule in `conventions/rust.yaml`: a binding points at files and holds no rule (ARCH-ONE-CONTRACT).
- A `Result` type of our own, a `Mapper`, a generic `Repository<T>`, a service locator or a DI container.
- A runtime dependency (`tokio`) below the Presentation layer — it is a listed library, and the check refuses it there: the ports are `async` by shape, the tests drive them with `pollster`, the bus awaits the handlers inline, and `accept()` in the Presentation building block is where the dispatch is spawned.
- Overriding `handle()` or `run()`: they are the template method, the same for every handler; what differs goes in `execute()` or `guard()`.
- Naming a handler's concrete type from a controller (`module.query::<GetNoteQueryHandler<InMemoryNoteQueries>>()`): it would name the adapter, which the Presentation may not see. Ask by the message: `module.query::<GetNote>()`, `module.command::<Login>()`.
- Publishing a command whose answer must not be recorded (a login's token) — run it through the module instead, and let the Tracker see nothing.
