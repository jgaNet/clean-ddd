# Working on this repository (guide for AI assistance)

This is the **Python implementation** of the Clean Architecture + Domain-Driven Design reference. The rules themselves, and what every language of the reference shares, are in the root [CLAUDE.md](../CLAUDE.md); this guide is Python's: its commands, where its things are, how a feature is added here. Before changing anything, read the [README](README.md): it says what is written so far, how the decisions land in Python, and maps every concept to the file that shows it. The TypeScript guide ([`typescript/CLAUDE.md`](../typescript/CLAUDE.md)) is the fuller one: the shape of a feature is the same, and the questions it answers under [*Questions you will have*](../typescript/CLAUDE.md#how-to-add-a-feature-follow-an-existing-one-do-not-invent-a-shape) — which verb, where a test goes, whether an event needs a handler, what an archived thing refuses — are answered the same way here; read that list before guessing.

Every command below runs from this directory (`cd python`), after `uv sync` once.

## Commands

```bash
uv run python -m tools.conventions          # every import is the table, the tree matches the binding, every named file exists
uv run ruff format --check .                # the formatter (uv run ruff format . to apply)
uv run ruff check .                         # the lints
uv run mypy                                 # strict typing, src/ and tools/
uv run pytest                               # every test_*.py; uv run pytest src/contexts/notes for one context, -k <name> for one test
yarn --cwd ../typescript architecture rule <ID> | concept <id> | checklist <kind> | verb <intent>   # the contract, asked; from here it answers in Python (`--language python` says it explicitly)
yarn --cwd ../typescript architecture mode feature --base <ref>   # did this change leave the architecture alone (`--base working` for uncommitted changes; the default base is origin/main)
yarn --cwd ../typescript conventions:write  # re-render README.md after editing conventions/python.yaml
```

All five checks must pass before a change is done; CI runs them on every PR, from this directory.

## Where things are

```
src/architecture/<layer>/         the building blocks, one package per layer: domain (Entity, AggregateRoot, ValueObject, Id,
                                  the three kinds of Event, DomainException, Result)
src/shared_kernel/<layer>/        domain (Email, Role)
src/contexts/<context>/           one package per layer (domain/, application/, infrastructure/, presentation/) and the
                                  wiring file module_local.py beside them
  domain/<aggregate>/<aggregate>.py   the aggregate; beside it <name>.py value objects, events.py, <aggregate>_exceptions.py,
                                  dtos.py (the snapshot), <rule>.py domain services, ports/, and test_<x>.py for each
tools/conventions.py              the import linter and conventions check, in one
../conventions/python.yaml        this language's binding of the contract: contexts, trees, enforcers, checklists, canonical files
```

**A module is imported by its absolute path** (`from contexts.notes.domain.note.note import Note`), never by a relative path across directories (`from ..note import Note`): the import linter matches on the absolute path, and a relative import may only name a sibling module (ARCH-RELATIVE). A tree is a top-level package under `src/`: `architecture`, `shared_kernel`, `contexts.<context>`, `bootstrap`; a layer is the contract's name in lowercase.

## The rules (enforced)

The rules are the contract's, the same in every language, and listed in the root [CLAUDE.md](../CLAUDE.md). What is Python's is in [`conventions/python.yaml`](../conventions/python.yaml), this language's **binding**: the contexts, the trees, the libraries only an adapter may import, which tool holds each rule here (`tools/conventions.py` for the dependency table and the tree, strict `mypy`, a `test_*.py`, review), what a new thing of each kind is made of (`yarn --cwd ../typescript architecture checklist <kind>`), and the file that shows each concept and each rule.

- **The architecture is data.** A new context goes in `contexts` of the binding, with one package per layer; a new file worth pointing at goes under `concepts` of the binding; a new rule goes in the contract, and in no binding. Neither is edited to make a violation pass.

## How to add a feature (follow an existing one, do not invent a shape)

Ask the contract first: `yarn --cwd ../typescript architecture checklist <kind>` lists what a new one is made of in Python and where it goes, with the placeholders filled in snake_case (typed from this directory it answers in Python; `--language python` says it explicitly). A plan is optional: `plan validate|explain` works on one that says `language: python`, and is worth writing when a feature crosses a context or raises a modelling question.

1. **Domain first.** Add a behaviour to the aggregate that enforces the rule and records an event ([`note.py`](src/contexts/notes/domain/note/note.py)): check the rules with the private `_ensure_*` helpers (return their `Failure` as is), change the state, `self._record(SomethingHappenedEvent(...))`, return `OK`. A pure read skips the aggregate: its first step is a read model and a method on the queries port ([`note_queries.py`](src/contexts/notes/domain/note/ports/note_queries.py)). New concept with validation? A value object ([`note_title.py`](src/contexts/notes/domain/note/note_title.py)): a frozen dataclass extending `ValueObject[T]`, `create()` returning a `Result`, one exception per rule the user could act on differently in [`note_exceptions.py`](src/contexts/notes/domain/note/note_exceptions.py) (a `DomainException` subclass with a PascalCase `type`); a behaviour an archived note refuses reuses `_ensure_active()` and its `NoteArchived`, since the remedy is the same (restore first). New rule about the whole collection, or a fact another context owns? A domain service taking its port in `__init__` ([`note_sharing.py`](src/contexts/notes/domain/note/note_sharing.py)). A new fact is a new frozen dataclass in [`events.py`](src/contexts/notes/domain/note/events.py), extending `DomainEvent`, named in the past tense, its fields the payload. Tests in `test_<aggregate>.py` beside it.
2. **Command + handler**: not here yet; the TypeScript guide's step applies when the Application package exists.
3. **Infrastructure** only if a port changed: not here yet.
4. **Route + controller**: not here yet.
5. **List it in the wiring** (`module_local.py`): not here yet.
6. Cross-context reaction? Publish an integration event from a domain event handler: the contract is a frozen dataclass in the shared kernel's `integration_events/`; not here yet.
7. **The map.** A new file worth pointing at goes under `concepts` in [`conventions/python.yaml`](../conventions/python.yaml); then `yarn --cwd ../typescript conventions:write` and `uv run python -m tools.conventions`. A second use of a kind the map already shows (another command on an aggregate) is not a new example: the map stays as it is, and a feature does not edit the binding.

## Code style

- Python ≥ 3.13; `ruff format` applied, `ruff check` clean (the rules in `pyproject.toml`), `mypy --strict` clean.
- Private attributes everywhere in the domain (`self._title`), reached through properties; the only way into an aggregate is `create()` or `from_snapshot()`, the only way into a value object is `create()`. Accessors return copies of lists, never the list.
- `Result[T]` in every signature that can refuse; a `Failure` is returned as is; `raise` only for corrupted state, with the id in the message. No `assert` outside tests as a check of business state.
- A handler takes its ports in `__init__`, shared with the other handlers of the aggregate; the only state it holds is those ports (ARCH-EXECUTION-CONTEXT: a clock, a mailer, a model client is such a port, never a member of the context).
- `snake_case` modules named after what they hold (`note_title.py`, `note_sharing.py`); `PascalCase` classes; an exception's `type` in PascalCase (`NotNoteOwner`); an enum's value is its name (`NoteStatus.ACTIVE == "ACTIVE"`).
- A docstring at the top of a module explains *why* the file exists and what rule it protects, in a few lines. No commented-out code, no `print()` outside `tools/` (the lint refuses it).
- Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`), one concern per PR, and the PR body states how it was verified.

## Things to avoid

- A relative import across directories, or an import of another context's internals: `tools/conventions.py` says no and names the rule; the fix is a port, an integration event or a move — never an edit to the binding.
- A rule in `conventions/python.yaml`: a binding points at files and holds no rule (ARCH-ONE-CONTRACT).
- A `Result` class of our own with methods that hide the `Failure`, a `Mapper`, a generic `Repository[T]`, a service locator or a DI container.
- Raising a `DomainException`: it does not extend `BaseException`, on purpose; a refusal is returned.
- A mutable dataclass for a value object or an event: they are `frozen=True`, and that is the immutability.
