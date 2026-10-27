# The inventory: what each language's tree says the application is

One JSON file per language, written by that language's conventions tool from its own tree and never edited by hand. The four files say the same application in words every language shares, and the TypeScript check holds them equal (ARCH-ONE-APPLICATION, [ADR 21](../adr/0021-one-application-every-language-writes-the-same-inventory.md)): a command one language has and another lacks, a policy that reaches different facts, a link one tree carries alone, fails the build and is named.

| File | Written by | Checked by |
|---|---|---|
| `typescript.json` | `yarn --cwd typescript conventions:write` | `yarn --cwd typescript check:conventions`, which also compares every other file to it |
| `rust.json` | `cargo run -p conventions -- inventory --write` (from `rust/`) | `cargo run -p conventions` |
| `python.json` | `uv run python -m tools.conventions inventory --write` (from `python/`) | `uv run python -m tools.conventions` |
| `go.json` | `go run ./tools/conventions inventory --write` (from `go/`) | `go run ./tools/conventions` |

What a file holds, per context: the **commands** (the public name, the **actor** — `an administrator`, `a signed-in account` or `anyone`, read from the guard — the **route** as `VERB /path` with every parameter spelled `{param}`, the **aggregate** reached and the **events** it records), the **queries** (name, actor, route), the **domain events**, the **policies** (`on` and `kind`: `domain-event`, `integration-event` or `every-operation`; what they `publishes`; the `events` they reach); then the **links** between contexts with their contracts. Canonical JSON: two-space indentation, one key order, every array sorted, a trailing newline, so that two files that say the same thing are the same bytes but for the language line.

`yarn --cwd typescript architecture inventory` prints the TypeScript one in words; `yarn --cwd typescript architecture inventory rust` says where the committed Rust one differs. A difference is closed in the tree that differs, never here.
