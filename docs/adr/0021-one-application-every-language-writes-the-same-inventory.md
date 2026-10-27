# 21. One application: every language's tool writes the same inventory, and the check holds them equal

## Context

ADR 16 made the four servers one API: a black-box scenario run against each, which fails against the server that differs. ADR 19 made the context map data and read its contracts from the TypeScript tree; ADR 20 read the event storm from the same tree. Both readings were the TypeScript tree's, with the note that the other languages render the same application and would one day report the same.

That day is the gap: the scenario sees routes, status codes and body shapes, and the operation names on the Tracker, and nothing else. A policy that reaches different facts in one language, a domain event one tree records and another does not, a guard that admits anyone in one implementation and a signed-in account in the next — none of that is visible to a client, so none of it fails the scenario, and the map and the storm, read from one tree, would not say so either. Three languages could be one application and the fourth something else, with every check green.

## Decision

**Every language's tree says the same application, in words every language shares, and the check holds the four to it** (ARCH-ONE-APPLICATION, which this record introduces).

- **The inventory** is the reading of ADR 20 reduced to what has the same name in every language: per context, the commands (the public name, who may call — an administrator, a signed-in account, anyone — the route with every parameter spelled `{param}`, the aggregate reached, the events it records), the queries (name, actor, route), the domain events, the policies (what they react to and of which kind, what they publish, what they reach) and the links between contexts with their contracts. No file, no class name, no idiom: nothing a language owns.
- **Each language's conventions tool writes its own**, from its own tree, with its own reader of its own canonical shapes — the Rust tool reads `Subscription::command` and `record(NoteEvent::Shared …)`, the Python tool reads the `Module(...)` call and `self.record(...)` with the `ast` module, the Go tool reads `application.Command(...)` and `n.Record(...)` with `go/parser`, the TypeScript tool projects its storm — into `docs/inventory/<language>.json`, in canonical JSON (two-space indentation, one key order, sorted arrays, a trailing newline), so that the four files are byte-equal but for the language line when the four trees agree.
- **Each check refuses a stale inventory** (`cargo run -p conventions`, `uv run python -m tools.conventions`, `go run ./tools/conventions`, `yarn check:conventions` each compare their committed file to what the tree says now), and **the TypeScript check compares every committed inventory to its own** and names each difference in the words of the inventory: "Notes: rust lacks the command TypeScript has: ShareNote (…)". CI runs each tool from its directory, as it already does; no job needs another language's toolchain.
- **A difference is closed in the tree that differs, never in the inventory.** The inventory is generated and committed, like the rendered documents; editing it by hand is editing the check.
- The inventories live under `docs/`, beside the storm, and not under `conventions/`: a feature that adds a command changes them, and a feature may not touch the conventions (ADR 9).

## Consequences

- The reference is one application from the inside as well as the outside. A pull request that adds a command in one language fails the TypeScript check until the three others carry it — the same cost ADR 16 accepted for routes, now for the model — and the failing lines are the list of what the other languages owe.
- Each language's reader is that language's business, written in its idiom with its own parser, and must reach the same words: four readers of four trees agreeing is a stronger proof of "one application" than one reader of one tree, and a shape one reader cannot recognise is a shape that language's guide does not teach.
- The words had to be chosen so that every language can say them. A route's parameters lose their names (`{param}`), because `:id`, `{note_id}` and `{id}` name the same thing; a port keeps its name because the asking side names it in its own words in every language; an actor is one of three phrases.
- The first run of the four readers is itself an evaluation of the four trees. What it finds — a policy reaching one fact fewer, a query guarded differently — is a divergence that was invisible until now, and is fixed in the tree, never in the reader.

## When to revisit

If a language cannot say one of the words (a shape it genuinely cannot carry), the word leaves the inventory for every language rather than being faked in one; the storm keeps it for the languages that have it. If the inventories ever need a field only one language fills, that field is that language's storm, not the inventory's. If the readers' agreement ever rests on one tree being copied into another, the readers have stopped reading.
