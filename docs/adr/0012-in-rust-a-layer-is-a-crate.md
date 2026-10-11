# 12. In Rust, a layer is a crate, and the dependency table is its dependencies

## Context

ADR 11 made the reference a repository of several languages under one contract, and said what a second language would have to bring: a directory, a binding, an import linter and a conventions check generated from the dependency table, and documents rendered from the contract. Rust is the second language, and the first question it asked was the one ADR 11 left open: what holds the table in a language with no ESLint?

Rust has no import linter worth the name, and writing one — a tool parsing `use` statements against path patterns — would be the TypeScript mechanism rebuilt in a language that does not need it. Rust has something stronger: a crate can only use what its `Cargo.toml` names, and the compiler refuses the rest before any linter would run.

Three other questions came with the port, each a place where the TypeScript idiom does not transpose: there is no inheritance for an `AggregateRoot` base class, no exception to throw, and no structural equality on a class with private fields to guard against.

## Decision

**Every layer of every tree is a crate** (`architecture-domain`, `shared-kernel-domain`, `notes-domain`, then `notes-application`, `notes-infrastructure`, `notes-presentation` and a `notes-wiring` crate for the context's wiring). A crate's `[dependencies]` are its row of the dependency table, and the compiler holds the boundary: an import the table forbids does not lint, it does not compile. What the binding's check adds, `cargo run -p conventions`, is the proof that the graph is the table: it classifies every crate by its directory, maps each workspace dependency to a unit of the contract's vocabulary (`own.Domain`, `architecture.Domain`, `kernel.Domain`, `others.Domain`, the wiring, the bootstrap) and refuses one the row does not allow, naming the rule; a `[dev-dependency]` may add what the layer's `specs` row allows, and a library the binding lists is seen only where `libraries` is allowed. The binding's `enforcers` therefore says, for `linter`, "the crate graph"; the rule ids are the contract's.

The idiom, where it had to differ:

- **An aggregate holds an `AggregateRoot` in a private field** and delegates to it, instead of extending one. The field being private is what keeps `record()` the aggregate's own (DOMAIN-RECORDS-EVENTS): a handler holding a `Note` cannot reach it.
- **A refusal is the language's `Result`**: `DomainResult<T>` is `Result<T, Exception>`, `?` is the early return, and a `panic!` is a throw — for corrupted state only (ADR 1, ADR 4).
- **A value object is a newtype with a private field** deriving `PartialEq`; two kinds cannot be compared because they are two types. An entity implements a trait whose `equals` takes a `&Self`, and derives no `PartialEq`, so there is no structural comparison to warn against.
- **Events are an enum per aggregate**, one variant per fact with the payload as named fields, so a test asserting an event asserts what it says; the three kinds of message are three traits.
- **Exceptions are values with a `kind`**: a constant per rule and a constructor function, instead of a subclass per rule.
- **Ports are traits whose methods return `impl Future + Send`**, so an in-memory adapter and a database adapter sit behind the same trait; a domain service is generic over the port it needs, and a test hands it a small struct. The runtime is the Presentation layer's business and arrives with it.

The first increment is the Domain layer only — the building blocks', the shared kernel's and the Notes context's — with the map showing the rest as gaps. A context's wiring crate is required by the check once the context has an Application layer, which is when there are handlers to wire.

## Consequences

- A boundary violation in Rust is a compile error with the crate name in it, and the conventions check turns it into the rule id. There is nothing to silence: `eslint-disable` has no equivalent, and ARCH-INWARD's remediation ("a port, an integration event or a move") is the only way through.
- The crate count grows with the contexts: four layers and a wiring crate per context. That is the cost of the compiler holding the table, and it is paid once per context, in `Cargo.toml` files that are each their row of the table written out.
- Layer directories are lowercase (`domain`), as a Rust path wants, while the contract's layers are `Domain`: the check compares case-insensitively, and the binding's checklists use lowercase placeholders (`<context>`, `<aggregate>`) that the plan tooling fills in snake_case.
- The documents of `rust/` are rendered by the TypeScript tooling, which reads every binding. A second renderer in Rust would be a second thing to drift; what Rust owns is the check that only Rust can make, the crate graph.
- The ports being `async` by shape before any runtime exists means the Domain's tests drive them with a minimal executor (`pollster`). The alternative — synchronous ports to be made asynchronous with the Presentation layer — would have changed every port's signature later, which is the one change a port should never make.

## When to revisit

If a crate ever needs a dependency its row forbids and the fix is to edit the binding rather than to add a port, the split has failed for Rust the way ADR 11 said it would. If the crate count makes a context too heavy to add, the question is whether a layer that holds one file needs to be a crate, and the answer is to look at what the compiler is then no longer holding.
