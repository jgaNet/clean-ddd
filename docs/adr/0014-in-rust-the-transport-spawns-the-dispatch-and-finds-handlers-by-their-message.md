# 14. In Rust, the transport spawns the dispatch, and a handler is found by its message

## Context

ADR 13 left the runtime at the door of the Application layer: the bus awaits the handlers inline, and "a transport that wants to answer `202` before the handling is done spawns the publication on its runtime". The Presentation layer and the composition root are that transport, and writing them raised what the sentence had deferred:

- `publish()` answered with the operation *after* the handlers had run, so a route could not answer `202 { operationId }` before the handling: the id did not exist yet.
- A controller needs a query's handler from the module. In TypeScript it asks by the handler's class (`getQuery(GetNoteQueryHandler)`). In Rust the handler is generic over its port — `GetNoteQueryHandler<InMemoryNoteQueries>` — and naming it would name the adapter, which the Presentation may not see (ARCH-PRESENTATION). The same holds for the one command a controller runs synchronously, the login.
- The Tracker records the answer of a command for the client who asked, as JSON; the operation held it as `Arc<dyn Any>`, downcastable by the code that knows the type and opaque to the Tracker, which does not.
- The Tracker announces the outcome of a *command*, never of a reaction; TypeScript asks `instanceof CommandEvent`, which type erasure has lost.
- A session token must not travel through the bus and into the Tracker's records.
- End-to-end tests must depend on the bootstrap and nothing below it (ARCH-E2E), and a Rust crate's tests cannot depend on a crate that depends on it.

## Decision

- **`publish()` is `dispatch()` of an operation it builds.** The bus's required method is `dispatch(operation)`; `publish(event, context)` is provided and does `dispatch(Operation::new(event, context))`. A route does the same by hand in `accept()` of the Presentation building block: the operation exists, its id is answered with `202`, and `bus.dispatch(operation)` is spawned on the runtime, with the request's context. The runtime (`tokio`) is a library of the binding: it appears in `architecture-presentation`, in the contexts' Presentation crates and in the bootstrap, and the check refuses it below.
- **A handler is found by its message.** A query is a struct with its parameters, like a command, and says its `Output` through the `Query` trait; a command says its `Output` on `CommandEvent`. The module stores each handler under the `TypeId` of its message, as the `dyn` that answers it (`AnyQuery<Q>`, `AnyCommand<C>`), and a controller asks `module.query::<GetNote>()` or `module.command::<Login>()`. The handler's concrete type, and the adapter it is generic over, stay in the wiring.
- **A command's answer is an `AnyValue`**: `Serialize + Any`, so the operation hands it back typed to whoever downcasts and as JSON to the Tracker's record. A command's `Output` is therefore `Serialize`.
- **Every message says its `EventKind`** (command, domain, integration), the required method of `Event` beside `name()`; the bus sees it through `AnyEvent`, and the Tracker announces the outcome of the commands only.
- **A synchronous command runs through the module, not the bus.** `CommandHandler::run()` is the template method's typed half — guard, log, transaction, safety net, the `Output` in return — and `handle()` is `run()` marking the operation. The login route runs `module.command::<Login>().run(…)`: the token is answered, and the Tracker never sees it.
- **The end-to-end tests are the bootstrap crate's `tests/`**, booting the application on a free port through `tests/support/mod.rs` and speaking HTTP with `reqwest`; the check holds the crate's `[dev-dependencies]` to the libraries (ARCH-E2E). A `202` is followed through the Tracker to its outcome, as a client would: the dispatch runs after the answer, and a test that read right after it would be early.
- **A use case answers in several formats through presenters the controller owns.** `Format` is read from the `HX-Request` header; a `Presenter<T>` turns a view model into a response; a `ByFormat<T>` holds the JSON one and, optionally, the HTMX one, as a `const` beside the controller — unit structs behind `&'static dyn`, so there is no registry and nothing to look up. The static front end is served as is by the bootstrap.
- **The per-request context is an axum extension.** Security's authentication layer establishes the caller (`Auth`) and never blocks; the bootstrap's layer builds the `ExecutionContext` — the trace from `x-trace-id` or generated, the caller, a unit of work over the stores it lists, the tracked bus, the logger — and answers with the trace in the response. A route takes `Extension<ExecutionContext>`; it never builds one.

## Consequences

- A route is three lines: extract the context, build the command, `accept()`. A query route is three more: ask the module by the query, hand the read model to a view struct, or `refuse()`.
- The bus's doubles implement `dispatch`; `publish` comes for free. A decorator such as the Tracker's wraps `dispatch` once and sees the operation before and after the handling.
- A concrete handler changes nothing: its `Output` moved from the handler to the command it already names, and `run()` is provided. The `Module` keeps listing handlers; it also keeps, per command, the `dyn` a synchronous caller runs it through.
- The `EventKind` is one more line per event enum and per command: explicit, and what the Tracker needs in a language without `instanceof`.
- `serde` is a dependency of the Domain's building blocks' neighbours (the Application, for `AnyValue`) and of the Application crates whose commands answer a structured value; the Domain crates stay serde-free, and the JSON shapes of the API are view structs in the Presentation.
- Dropping a `Running` application without `stop()` leaves it serving until the runtime ends; the tests stop theirs, and the binary waits on it.

## When to revisit

If a handler ever needs the operation itself (its id, to correlate), `execute()` would take it, and `run()` would build a pending one for the synchronous path. If the per-request context grows a member that is not per request, ARCH-EXECUTION-CONTEXT says where it goes instead: a constructor dependency of the handler that needs it.
