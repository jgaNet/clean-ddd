# 15. In Python, a layer is a package, and an `ast` walk holds the dependency table

## Context

ADR 11 made the reference a repository of several languages under one contract; ADR 12 showed what a second language brings (a directory, a binding, a linter and a check generated from the table, rendered documents), and chose, for Rust, to let the compiler hold the table by making every layer a crate. Python is the third language, and the question ADR 12 answered with the compiler has no such answer here: Python has no compilation unit that carries its dependencies, no `import` the language refuses, and no linter that reads a YAML table the way `typescript/eslint.config.js` does.

Three other questions came with the port, each a place where the TypeScript idiom does not transpose as is: the language's `Exception` is the thing that *is* raised; a class with private fields has no `#private`, only a convention; and a structural `Result` with `isFailure()` narrowing has no equivalent in the type checker unless the two cases are two types.

## Decision

- **A tree is a top-level package under `src/`, a layer a sub-package.** `architecture`, `shared_kernel`, `contexts.<context>` and `bootstrap` are what a module imports, by its absolute path; a layer is the contract's name in lowercase (`contexts.notes.domain`); the wiring is one module beside the layers (`module_local.py`). The binding's `alias` of a tree is its package name.
- **An `ast` walk is the linter and the check.** `tools/conventions.py` reads every module of `src/` with `ast` — never importing it — classifies the module by its path (tree, context, layer, wiring, test, end-to-end test) and resolves every absolute import to a unit of the contract's vocabulary (`own.Domain`, `kernel.Application`, `others.Domain`, the wiring, the bootstrap, a listed library); a unit the row does not allow is refused naming the rule. A test module (`test_*.py`) adds its layer's `specs` row; an end-to-end test (`test_*_e2e.py`) is held to the `e2e_specs` row. A relative import may name a sibling module only. The same tool checks the tree against the binding and that every file the binding names exists; `tools/test_conventions.py` tries it against the violations it must refuse, which is what the TypeScript probes do.
- **Inheritance, where the idiom is inheritance.** An aggregate extends `AggregateRoot`, as in TypeScript, with its state in private attributes behind properties and `_record()` as the behaviours' own; a value object is a frozen dataclass extending `ValueObject[T]`, and the dataclass's equality is the value object's — by kind and by value; an event is a frozen dataclass extending one of the three kinds, its fields the payload, its name its class.
- **`Result[T]` is `Success[T] | Failure`**, two frozen dataclasses under one type alias, narrowed by `isinstance(result, Failure)`; a behaviour that answers nothing returns `Result[None]` and the constant `OK`. The refusal it carries is a `DomainException`, a frozen dataclass that does not extend `BaseException`: named so because `Exception` is Python's own, and never raised. `raise` is for corrupted state and programming errors (ADR 4), as `panic!` is in Rust.
- **Ports are `Protocol`s with `async` methods**, implemented structurally: an in-memory adapter and a database adapter satisfy the same protocol without naming it, and a test's five-line class does too. Strict `mypy` is what the contract's `types` enforcement word stands for.
- **The toolchain is `uv`**: one `pyproject.toml`, a lockfile, `ruff` for the format and the lints, `mypy --strict`, `pytest` with tests beside what they test (`test_<x>.py`), as the TypeScript `*.spec.ts` sit beside their files.

## Consequences

- The boundary is as strong as the tool: an import done at run time (`importlib`, `__import__`) is invisible to an `ast` walk. This reference never does one, and the guide says not to.
- A violation is found by `uv run python -m tools.conventions`, not by the editor as it is typed; the five checks are the gate, as in the other languages.
- A domain test imports nothing of the infrastructure, and the tool holds it to that, where a Rust dev-dependency would have been refused by the crate graph.
- `Success`/`Failure` make every refusal visible at the call site (`if isinstance(r, Failure): return r`), which is the verbosity ADR 1 accepted in TypeScript and `?` removed in Rust.

## When to revisit

If a second Python tool reads the table (an editor plugin, a pre-commit hook), it should import `tools/conventions.py` rather than reread the YAML. If the language gains a way to declare a package's allowed imports, the tool should compare that declaration to the contract, as `cargo run -p conventions` does for crates.
