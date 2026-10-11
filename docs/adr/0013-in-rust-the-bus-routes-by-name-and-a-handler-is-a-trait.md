# 13. In Rust, the bus routes type-erased events by name, and a handler is a trait with a provided `handle()`

## Context

ADR 12 settled the Domain: layers as crates, composition instead of inheritance, the language's `Result`. The Application layer raised the questions the Domain could avoid, because it is where the mechanics meet the type system:

- One bus carries every kind of message, and TypeScript routes them by `event.name` to handlers typed on their event. Rust has no common supertype a `Vec<Handler>` could hold, and a trait with `async fn` cannot be a `dyn` object.
- A base class did four things once for every command (guard, log, transaction, safety net) and left `execute()` to the concrete handler. Rust has no base class.
- `afterCommit` deferred synchronous callbacks that publish; in Rust publishing is `async`, and the context that holds the deferred work is borrowed by the handler that registers it.
- A thrown exception became a failed `Result` in the base handler. Rust's equivalent of an unexpected throw is a panic, which unwinds through an `async` task.
- The in-memory unit of work in TypeScript snapshots every store of the process through a static registry.

## Decision

- **The bus routes by name, on type-erased events.** `EventBus::publish` takes an `Arc<dyn AnyEvent>` — any `Event` that is `Send + Sync + 'static`, through a blanket impl — and a handler is held as an `Arc<dyn AnyHandler>`, both with boxed futures, so a bus is a `dyn` port. A typed handler is wrapped once, by `CommandSubscriber` or `EventSubscriber`, which downcasts the event back to the type the handler declares; a command names its channel with a `const NAME`, a domain event's channel is the variant's name. The subscription names the channel (`Subscription::reaction("NoteShared", …)`), as the TypeScript module names the event class.
- **A handler is a trait with a provided `handle()`.** `CommandHandler`, `EventHandler` and `QueryHandler` declare `execute()` (and an overridable `guard()`) with `impl Future` returns, and provide `handle()`, the template method, which does the guard, the log, the transaction and the safety net. A concrete handler implements `execute()` with `async fn`, generic over the ports it takes in `new()`, and holds them in `Arc` so the handlers of one aggregate share one adapter.
- **The execution context is shared by `Arc`**, so a clone is the same context, and `after_commit` takes a `Send + 'static` future that captures its own clone. The transaction flag is reset before the deferred futures run, so a reaction they publish opens its own transaction and its own deferred work runs at its own commit — which is what the TypeScript microtask ordering did implicitly.
- **`publish_domain_events` takes the aggregate by value.** The handler has saved it and has nothing left to do with it; the events are pulled at the commit, inside the deferred future, so a rollback leaves them with the aggregate it discards. `Aggregate` is a trait of the Domain (`pull_domain_events`), implemented by delegating to the private `AggregateRoot`.
- **The safety net is `catch_unwind`** on the `execute()` future (`futures::FutureExt`), in the transaction for a command, around the reaction for an event handler, around the read for a query: a panic becomes a failed result with the panic's message, and the transaction rolls back.
- **The in-memory unit of work takes the stores it guards**, as a list the composition root builds, instead of a global registry: explicit, and what a database adapter would also need to be told.
- **`println!` is denied workspace-wide** (`clippy::print_stdout`, `print_stderr`), allowed in the console logger and the tools: the Rust spelling of "only the console logger writes to the console".

## Consequences

- A handler reached through the bus is downcast once, in the subscriber wrapper; a wrong event on a channel is a failed operation naming the handler, not a panic. The cost is a `Box::pin` per message, which an in-process bus does not feel.
- The bus awaits the handlers inline and answers with the operation as they left it. A transport that wants to answer `202` before the handling is done spawns the publication on its runtime; the bus does not know the runtime, and the Application layer has no runtime dependency. `tokio` is therefore not an infrastructure library of the binding: it is the Presentation's, when it comes.
- Tests of the Application layer use the real in-memory bus with a small recording handler on the channels they watch, instead of a mock: the double is the adapter, as the TypeScript specs intend.
- A domain event handler receives the aggregate's enum and matches the variant its channel carries; another variant is a programming error in the wiring, and the handler ignores it rather than failing the operation, since the channel is the fact.

## When to revisit

If a second bus implementation needs to know the concrete event type to serialize it (a broker), `AnyEvent` grows a serialization method and the decision holds. If handlers start needing `handle()` overridden, the template method should become a free function the bus calls, as the TypeScript base class is not meant to be extended either.
