"""``uv run python -m tools.conventions``: the Python conventions check and import linter. Runs
in CI from ``python/``.

The contract (``conventions/architecture.yaml``) says which layer may import which; the Python
binding (``conventions/python.yaml``) says where this language keeps its trees. Python has no
compiler to hold a boundary and no linter that reads a YAML table, so this tool is both the
linter and the check, generated from the data the way ``typescript/eslint.config.js`` is:

1. The binding is this language's and the contract knows it (``language``, ``languages``, ``root``).
2. The tree matches the contract: every directory under the contexts tree is a declared context
   holding only layer packages and its wiring file; the two trees beside the contexts hold only
   layers (ARCH-CONTEXT-DECLARED, ARCH-TREES).
3. Every import of every module is a unit its row of the table allows — ``own.<Layer>``,
   ``architecture.<Layer>``, ``kernel.<Layer>``, ``others.<Layer>``, the wiring, the bootstrap,
   the libraries — read with ``ast``, never executed. A test module (``test_*.py``) adds what
   its layer's ``specs`` row allows; an end-to-end test (``test_*_e2e.py``) is held to the
   ``e2e_specs`` row; the wiring file to the ``wiring_file`` row; a library the binding lists is
   seen only where ``libraries`` is allowed (ARCH-INWARD). A relative import names a sibling
   module and nothing else (ARCH-RELATIVE).
4. Every file the binding names exists (ARCH-MAP-IS-REAL). The rendered documents and the links
   are checked by the TypeScript tooling, which reads every binding.

Every refusal names its rule id first, so a reader or ``yarn architecture rule <id>`` can look
it up. Layer names are the contract's (``Domain``); a package is the same word in lowercase.
"""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

CONTRACT = "conventions/architecture.yaml"
BINDING = "conventions/python.yaml"
LANGUAGE = "python"


@dataclass(frozen=True)
class Tree:
    """Which tree a module belongs to: the building blocks, the kernel, a context, or the bootstrap."""

    kind: str  # architecture | kernel | context | bootstrap
    context: str = ""


@dataclass(frozen=True)
class Module:
    """A Python module of the source tree, classified."""

    path: Path
    dotted: str
    tree: Tree
    layer: str = ""  # the contract's name (Domain); "" for the wiring or the bootstrap
    wiring: bool = False
    spec: bool = False
    e2e: bool = False


@dataclass
class Problems:
    found: list[str] = field(default_factory=list)

    def add(self, rule: str, message: str) -> None:
        self.found.append(f"{rule}: {message}")


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        loaded = yaml.safe_load(file)
    if not isinstance(loaded, dict):
        raise SystemExit(f"{path} is not a mapping")
    return loaded


def repository_root(start: Path) -> Path | None:
    """The nearest directory at or above ``start`` holding the contract."""
    return next((directory for directory in [start, *start.parents] if (directory / CONTRACT).is_file()), None)


# 1. The binding is this language's


def check_binding(
    contract: dict[str, Any], binding: dict[str, Any], root: Path, here: Path, problems: Problems
) -> None:
    if binding.get("language") != LANGUAGE:
        problems.add(BINDING, f'"language" is {binding.get("language")!r}, not {LANGUAGE}')
    if LANGUAGE not in contract.get("languages", []):
        problems.add(CONTRACT, f'"languages" does not list {LANGUAGE}, so the map does not know it')
    if (root / str(binding.get("root", ""))).resolve() != here.resolve():
        problems.add(BINDING, f'"root" says {binding.get("root")!r}, but this tool runs from {here}')


# 2. The tree matches the contract, and every module is classified


def layer_dirs(contract: dict[str, Any]) -> dict[str, str]:
    """lowercase directory -> the contract's layer name."""
    return {name.lower(): name for name in contract["layers"]}


def classify_tree(binding: dict[str, Any], contract: dict[str, Any], here: Path, problems: Problems) -> None:
    layers = layer_dirs(contract)
    wiring = str(binding["wiring"])
    contexts: list[str] = binding["contexts"]
    contexts_dir = here / binding["contexts_tree"]["path"]
    packages = [entry for entry in sorted(contexts_dir.iterdir()) if entry.is_dir() and not entry.name.startswith("__")]
    for found in packages:
        if found.name not in [context.lower() for context in contexts]:
            problems.add(
                "ARCH-CONTEXT-DECLARED",
                f"{found.relative_to(here)} is not declared in {BINDING}, so no row of the table applies to it",
            )
    for context in contexts:
        directory = contexts_dir / context.lower()
        if not directory.is_dir():
            problems.add("ARCH-CONTEXT-DECLARED", f"{BINDING} declares the context {context}, which does not exist")
            continue
        for entry in sorted(directory.iterdir()):
            if entry.name.startswith("__") or entry.name.startswith("."):
                continue
            if entry.is_dir() and entry.name not in layers:
                problems.add(
                    "ARCH-CONTEXT-DECLARED",
                    f"{entry.relative_to(here)} is not a layer ({', '.join(layers)}): "
                    "a context holds its layers and its wiring file",
                )
            if entry.is_file() and entry.name != wiring and entry.suffix == ".py":
                problems.add(
                    "ARCH-CONTEXT-DECLARED",
                    f"{entry.relative_to(here)} is neither a layer nor the wiring file {wiring}",
                )
    for tree in ("architecture", "kernel"):
        directory = here / binding[tree]["path"]
        if not directory.is_dir():
            problems.add("ARCH-TREES", f"{binding[tree]['path']} does not exist")
            continue
        for entry in sorted(directory.iterdir()):
            if entry.is_dir() and not entry.name.startswith("__") and entry.name not in layers:
                problems.add(
                    "ARCH-TREES", f"{entry.relative_to(here)} is not a layer: the tree holds layers and nothing else"
                )


def classify(path: Path, binding: dict[str, Any], contract: dict[str, Any], here: Path) -> Module | None:
    """Which tree, layer and kind of file a module is, from the binding's paths; None for a file outside every tree."""
    layers = layer_dirs(contract)
    relative = path.relative_to(here / "src")
    parts = relative.with_suffix("").parts
    dotted = ".".join(parts[:-1] if parts[-1] == "__init__" else parts)
    spec = path.name.startswith("test_")
    e2e = spec and path.stem.endswith("_e2e")
    trees = {binding[tree]["path"].removeprefix("src/"): tree for tree in ("architecture", "kernel", "bootstrap")}
    top = parts[0]
    if top in trees:
        tree = Tree(trees[top])
        if tree.kind == "bootstrap":
            return Module(path, dotted, tree, spec=spec, e2e=e2e)
        layer = layers.get(parts[1], "") if len(parts) > 1 else ""
        return Module(path, dotted, tree, layer=layer, spec=spec, e2e=e2e)
    if top == binding["contexts_tree"]["path"].removeprefix("src/") and len(parts) > 1:
        tree = Tree("context", parts[1])
        if len(parts) == 3 and path.name == binding["wiring"]:
            return Module(path, dotted, tree, wiring=True)
        layer = layers.get(parts[2], "") if len(parts) > 2 else ""
        return Module(path, dotted, tree, layer=layer, spec=spec, e2e=e2e)
    return None


# 3. Every import is a unit the row allows


def imports_of(path: Path) -> list[tuple[str | None, int, str]]:
    """(absolute module or None for relative, level, imported name) for every import statement."""
    found: list[tuple[str | None, int, str]] = []
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.extend((alias.name, 0, alias.name) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                found.append((None, node.level, node.module or ""))
            else:
                found.extend((f"{node.module}.{alias.name}", 0, alias.name) for alias in node.names)
    return found


def unit_of(importing: Module, target: str, binding: dict[str, Any], contract: dict[str, Any]) -> str | None:
    """The unit an absolute import names, seen from the importing module; None when the table does not govern it."""
    layers = layer_dirs(contract)
    parts = target.split(".")
    aliases = {binding[tree]["alias"]: tree for tree in ("architecture", "kernel", "bootstrap")}
    top = parts[0]
    if top == binding["contexts_tree"]["alias"] and len(parts) > 1:
        context = parts[1]
        own = importing.tree.kind == "context" and importing.tree.context == context
        prefix = "own" if own else "others"
        if len(parts) > 2 and f"{parts[2]}.py" == binding["wiring"]:
            return f"{prefix}.wiring"
        layer = layers.get(parts[2], "") if len(parts) > 2 else ""
        return f"{prefix}.{layer}" if layer else f"{prefix}.whole"
    if top in aliases:
        tree = aliases[top]
        if tree == "bootstrap":
            return "bootstrap"
        prefix = "own" if importing.tree.kind == tree else tree
        layer = layers.get(parts[1], "") if len(parts) > 1 else ""
        return f"{prefix}.{layer}" if layer else f"{prefix}.whole"
    libraries: list[str] = binding.get("libraries", [])
    if any(top == library or target.startswith(f"{library}.") for library in libraries):
        return "libraries"
    return None


def expand(allowed: list[str], contract: dict[str, Any]) -> set[str]:
    units: set[str] = set()
    for unit in allowed:
        if unit == "own.*":
            units.update(f"own.{layer}" for layer in contract["layers"])
            units.add("own.wiring")
        elif unit.endswith(".*"):
            units.update(f"{unit[:-2]}.{layer}" for layer in contract["layers"])
        else:
            units.add(unit)
    return units


def row_of(module: Module, contract: dict[str, Any]) -> tuple[str, list[str]] | None:
    """The row a module is held to, with its id; the specs row added for a test module."""
    if module.e2e:
        entry = contract["e2e_specs"]
        return str(entry["id"]), list(entry["may_import"])
    if module.wiring:
        entry = contract["wiring_file"]
        return str(entry["id"]), list(entry["may_import"])
    if module.tree.kind == "bootstrap" or not module.layer:
        return None
    entry = contract["layers"][module.layer]
    allowed = list(entry["may_import"])
    if module.spec and "specs" in entry:
        allowed += list(entry["specs"]["may_import"])
    return str(entry["id"]), allowed


def check_imports(
    modules: list[Module], binding: dict[str, Any], contract: dict[str, Any], here: Path, problems: Problems
) -> int:
    checked = 0
    relative_rule = contract["relative_imports"]
    for module in modules:
        row = row_of(module, contract)
        for target, level, name in imports_of(module.path):
            checked += 1
            if target is None:
                # A relative import names a sibling module and nothing else.
                if level > 1 or "." in name:
                    problems.add(
                        str(relative_rule["id"]),
                        f"{module.path.relative_to(here)} imports {'.' * level}{name} across directories; "
                        f"{relative_rule['remediation']}",
                    )
                continue
            if row is None:
                continue
            unit = unit_of(module, target, binding, contract)
            if unit is None:
                continue
            rule_id, allowed = row
            kept = expand(allowed, contract)
            if unit not in kept:
                entry = (
                    contract["e2e_specs"]
                    if module.e2e
                    else contract["wiring_file"]
                    if module.wiring
                    else contract["layers"][module.layer]
                )
                problems.add(
                    rule_id,
                    f"{module.path.relative_to(here)} imports {target} ({unit}), which its row of the table does not "
                    f"allow; a {'test' if module.spec else 'module'} there imports only {', '.join(sorted(kept))}. "
                    f"Fix: {entry['remediation']}",
                )
    return checked


# 4. Every file the binding names exists


def check_files(binding: dict[str, Any], here: Path, problems: Problems) -> None:
    named: list[tuple[str, str]] = []
    for rule_id, rule in (binding.get("rules") or {}).items():
        named.extend((f"rule {rule_id}", file) for file in rule.get("references", []))
    for concept_id, concept in (binding.get("concepts") or {}).items():
        named.extend(
            (f"concept {concept_id}", file) for file in concept.get("canonical", []) + concept.get("examples", [])
        )
    for intent, file in (binding.get("verbs") or {}).items():
        named.append((f"verb {intent}", file))
    for what, file in named:
        if not (here / file).exists():
            problems.add("ARCH-MAP-IS-REAL", f"{BINDING} {what} names {file}, which does not exist")


def run(here: Path) -> tuple[Problems, str]:
    root = repository_root(here)
    if root is None:
        raise SystemExit(f"✗ {CONTRACT} not found at or above {here}")
    contract = load_yaml(root / CONTRACT)
    binding = load_yaml(root / BINDING)
    problems = Problems()
    check_binding(contract, binding, root, here, problems)
    classify_tree(binding, contract, here, problems)
    modules: list[Module] = []
    for path in sorted((here / "src").rglob("*.py")):
        module = classify(path, binding, contract, here)
        if module is None:
            problems.add(
                "ARCH-CONTEXT-DECLARED", f"{path.relative_to(here)} is a module outside every tree the binding names"
            )
        else:
            modules.append(module)
    imports = check_imports(modules, binding, contract, here, problems)
    check_files(binding, here, problems)
    summary = (
        f"✓ contract v{contract.get('schemaVersion')}, Python binding: {len(modules)} modules and {imports} imports "
        f"are the table, {len(binding['contexts'])} contexts match the tree, every file the binding names exists."
    )
    return problems, summary


def main() -> int:
    here = Path(__file__).resolve().parent.parent
    problems, summary = run(here)
    if problems.found:
        for problem in problems.found:
            print(f"✗ {problem}", file=sys.stderr)
        return 1
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
