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
5. The committed inventory (``docs/inventory/python.json``) is what the tree says the application
   is (ARCH-ONE-APPLICATION): the commands of each context with who may call them, their route,
   the aggregate they reach and the events it records; the queries; the domain events; the
   policies and what they publish or reach; the links between contexts — read from the canonical
   shapes with ``ast`` (the wiring listed as data, a behaviour that ``_record()``s its events, a
   handler that guards with ``require_signed_in()`` or a ``guard()`` on a role, a route whose
   function builds the command) and written in words every language shares, so the TypeScript
   check can hold the four inventories equal. ``python -m tools.conventions inventory`` prints
   it, ``--write`` writes it.

Every refusal names its rule id first, so a reader or ``yarn architecture rule <id>`` can look
it up. Layer names are the contract's (``Domain``); a package is the same word in lowercase.
"""

from __future__ import annotations

import ast
import json
import re
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


# 5. The inventory: what the tree says the application is, in words every language shares


INVENTORY = f"docs/inventory/{LANGUAGE}.json"
INVENTORY_SCHEMA_VERSION = 1
INVENTORY_WRITE = "uv run python -m tools.conventions inventory --write"
INVENTORY_RULE = "ARCH-ONE-APPLICATION"

SUFFIXES = re.compile(r"(CommandEvent|IntegrationEvent|CommandHandler|QueryHandler|EventHandler|Handler|Event)$")
#: The building blocks a service is not: a class extending one of these holds state or a fact, not an orchestration.
NOT_A_SERVICE = {
    "AggregateRoot",
    "Entity",
    "ValueObject",
    "DomainEvent",
    "CommandEvent",
    "IntegrationEvent",
    "Protocol",
    "StrEnum",
    "Enum",
    "BaseModel",
}
RECORDS = {"_record", "record"}

type Json = dict[str, Any]


def public_name(class_name: str) -> str:
    """The public name of a class: its intent or its fact, without the suffix of its kind (API-ONE-SURFACE)."""
    return SUFFIXES.sub("", class_name)


def canonical_route(verb: str, prefix: str, path: str) -> str:
    """`VERB /path`, every path parameter spelled `{param}`; an empty path on a prefixed router is the prefix."""
    joined = re.sub(r"/{2,}", "/", f"{prefix}/{path}").rstrip("/") or "/"
    return f"{verb.upper()} {re.sub(r'\{\w+\}', '{param}', joined)}"


def sorted_names(values: list[str]) -> list[str]:
    """Alphabetical the way every language's tool sorts: letters before case, then the exact spelling."""
    return sorted(set(values), key=lambda value: (value.casefold(), value))


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


@dataclass(frozen=True)
class Source:
    """A parsed module of a context: its path, its tree and the classes it declares, by name."""

    path: Path
    module: ast.Module
    classes: dict[str, ast.ClassDef]
    layer: str  # the package under the context (domain, application, ...) or "" for the wiring


def parse_sources(directory: Path) -> list[Source]:
    """Every non-test module of a context, read with ``ast`` and never executed."""
    sources: list[Source] = []
    for path in sorted(directory.rglob("*.py")):
        if path.name.startswith("test_"):
            continue
        module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        classes = {node.name: node for node in module.body if isinstance(node, ast.ClassDef)}
        relative = path.relative_to(directory).parts
        sources.append(Source(path, module, classes, relative[0] if len(relative) > 1 else ""))
    return sources


def name_of(node: ast.expr) -> str:
    """The name a call or a base names: ``Note`` for ``Note``, ``create`` for ``Note.create``."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def bases_of(cls: ast.ClassDef) -> set[str]:
    return {name_of(base) for base in cls.bases} | {
        name_of(base.value) for base in cls.bases if isinstance(base, ast.Subscript)
    }


def calls_in(node: ast.AST) -> list[ast.Call]:
    return [found for found in ast.walk(node) if isinstance(found, ast.Call)]


def names_in(node: ast.AST) -> set[str]:
    """Every name a module mentions, the imported ones included: what a handler refers to."""
    found: set[str] = set()
    for each in ast.walk(node):
        if isinstance(each, ast.Name):
            found.add(each.id)
        elif isinstance(each, ast.Attribute):
            found.add(each.attr)
        elif isinstance(each, ast.ImportFrom | ast.Import):
            found.update(alias.asname or alias.name.split(".")[-1] for alias in each.names)
    return found


def methods_of(cls: ast.ClassDef) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    return [node for node in cls.body if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)]


def recorded_events(method: ast.AST) -> list[str]:
    """The domain events a behaviour records: ``self._record(XEvent(...))``, as public names."""
    return unique(
        [
            public_name(name_of(call.args[0].func))
            for call in calls_in(method)
            if isinstance(call.func, ast.Attribute)
            and call.func.attr in RECORDS
            and call.args
            and isinstance(call.args[0], ast.Call)
            and name_of(call.args[0].func).endswith("Event")
        ]
    )


def published_integration_events(node: ast.AST) -> list[str]:
    """The integration events a node publishes: ``bus.publish(XIntegrationEvent(...), context)``, as public names."""
    return unique(
        [
            public_name(name_of(call.args[0].func))
            for call in calls_in(node)
            if name_of(call.func) == "publish"
            and call.args
            and isinstance(call.args[0], ast.Call)
            and name_of(call.args[0].func).endswith("IntegrationEvent")
        ]
    )


def actor_of(handler: ast.ClassDef | None, module: ast.Module) -> str:
    """Who may call: ``require_signed_in()`` says a signed-in account (an administrator may see more, the
    handler says so itself); a ``guard()`` that admits the administrator role alone says an administrator;
    a guard on any other role says a signed-in account; nothing says anyone."""
    if any(name_of(call.func) == "require_signed_in" for call in calls_in(module)):
        return "a signed-in account"
    scope: ast.AST = handler if handler is not None else module
    guards = [node for node in ast.walk(scope) if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)]
    roles = {
        node.attr
        for guard in guards
        if guard.name == "guard"
        for node in ast.walk(guard)
        if isinstance(node, ast.Attribute) and name_of(node.value) == "Role"
    }
    if "ADMIN" in roles and "USER" not in roles:
        return "an administrator"
    if roles:
        return "a signed-in account"
    return "anyone"


@dataclass(frozen=True)
class ServiceMethod:
    service: str
    method: str
    behaviours: list[str]


@dataclass
class ContextShapes:
    """The canonical shapes of one context, read once: its aggregates' behaviours and the events they
    record, its services' methods and the behaviours they reach, where to find a class."""

    id: str
    sources: list[Source]
    behaviours: dict[str, dict[str, list[str]]] = field(default_factory=dict)  # aggregate -> behaviour -> events
    services: list[ServiceMethod] = field(default_factory=list)

    def find(self, class_name: str) -> tuple[ast.ClassDef, ast.Module] | None:
        for source in self.sources:
            if class_name in source.classes:
                return source.classes[class_name], source.module
        return None

    def behaviours_reached(self, node: ast.AST) -> list[str]:
        """An aggregate's behaviour called on an instance or on the class, as ``Aggregate.behaviour``."""
        called = {call.func.attr for call in calls_in(node) if isinstance(call.func, ast.Attribute)}
        return [
            f"{aggregate}.{behaviour}"
            for aggregate, behaviours in self.behaviours.items()
            for behaviour in behaviours
            if behaviour in called
        ]

    def analyse(self, node: ast.AST) -> tuple[str | None, list[str], list[str]]:
        """What a handler's module reaches: the aggregate, the behaviours (directly or through a service),
        the events those behaviours record."""
        names = names_in(node)
        called = {call.func.attr for call in calls_in(node) if isinstance(call.func, ast.Attribute)}
        through = [each for each in self.services if each.service in names and each.method in called]
        behaviours = unique(self.behaviours_reached(node) + [b for each in through for b in each.behaviours])
        events = unique([event for full in behaviours for event in self.events_of(full)])
        aggregate = behaviours[0].split(".")[0] if behaviours else None
        if aggregate is None:
            aggregate = next((name for name in self.behaviours if name in names), None)
        return aggregate, behaviours, events

    def events_of(self, full: str) -> list[str]:
        aggregate, behaviour = full.split(".")
        return self.behaviours.get(aggregate, {}).get(behaviour, [])


def read_shapes(context: str, sources: list[Source]) -> ContextShapes:
    shapes = ContextShapes(context, sources)
    for source in sources:
        if source.layer != "domain":
            continue
        for cls in source.classes.values():
            if "AggregateRoot" not in bases_of(cls):
                continue
            shapes.behaviours[cls.name] = {
                method.name: events
                for method in methods_of(cls)
                if method.name != "from_snapshot" and (events := recorded_events(method))
            }
    for source in sources:
        if source.layer not in ("domain", "application"):
            continue
        for cls in source.classes.values():
            bases = bases_of(cls)
            if cls.name in shapes.behaviours or bases & NOT_A_SERVICE:
                continue
            if any(base.endswith(("Exception", "Handler")) for base in bases):
                continue
            for method in methods_of(cls):
                if reached := shapes.behaviours_reached(method):
                    shapes.services.append(ServiceMethod(cls.name, method.name, reached))
    return shapes


def domain_events_of(sources: list[Source]) -> list[str]:
    return sorted_names(
        [
            public_name(cls.name)
            for source in sources
            if source.layer == "domain"
            for cls in source.classes.values()
            if "DomainEvent" in bases_of(cls)
        ]
    )


def wiring_of(sources: list[Source], wiring: str) -> dict[str, list[tuple[str, list[str]]]]:
    """The sections of the Module built as data: ``commands`` and the two event sections as
    (event, [handlers]), ``queries`` as (handler, [])."""
    sections: dict[str, list[tuple[str, list[str]]]] = {
        "commands": [],
        "queries": [],
        "domain_events": [],
        "integration_events": [],
    }
    module = next((source.module for source in sources if source.path.name == wiring), None)
    if module is None:
        return sections
    for call in calls_in(module):
        if name_of(call.func) != "Module":
            continue
        for keyword in call.keywords:
            if keyword.arg not in sections or not isinstance(keyword.value, ast.List):
                continue
            for entry in keyword.value.elts:
                if not isinstance(entry, ast.Call):
                    continue
                if keyword.arg == "queries":
                    sections["queries"].append((name_of(entry.func), []))
                elif name_of(entry.func) == "Subscription" and len(entry.args) == 2:
                    handlers = entry.args[1]
                    listed = handlers.elts if isinstance(handlers, ast.List) else []
                    sections[keyword.arg].append(
                        (name_of(entry.args[0]), [name_of(h.func) for h in listed if isinstance(h, ast.Call)])
                    )
    return sections


def constant_str(node: ast.expr | None) -> str:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else ""


def router_prefixes(module: ast.Module) -> dict[str, str]:
    """Router name -> its ``prefix``, for every ``name = APIRouter(prefix=...)`` of a routes module."""
    prefixes: dict[str, str] = {}
    for node in ast.walk(module):
        if (
            isinstance(node, ast.Assign)
            and isinstance(node.value, ast.Call)
            and name_of(node.value.func) == "APIRouter"
        ):
            prefix = next((k.value for k in node.value.keywords if k.arg == "prefix"), None)
            for target in node.targets:
                prefixes[name_of(target)] = constant_str(prefix)
    return prefixes


def route_of(decorator: ast.expr, prefixes: dict[str, str]) -> str | None:
    """The ``VERB /path`` a ``@router.<verb>(path)`` decorator declares, under its router's prefix."""
    if not (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)):
        return None
    router = name_of(decorator.func.value)
    if router not in prefixes:
        return None
    path = decorator.args[0] if decorator.args else next((k.value for k in decorator.keywords if k.arg == "path"), None)
    return canonical_route(decorator.func.attr, prefixes[router], constant_str(path))


def routes_of(sources: list[Source]) -> dict[str, str]:
    """Public name -> ``VERB /path`` for every command a route's function builds and every query it asks,
    read from the decorators of the presentation routes and the ``prefix`` of their router; when several
    routes carry the same one, the first declared is the route."""
    routes: dict[str, str] = {}
    for source in sources:
        if source.layer != "presentation":
            continue
        prefixes = router_prefixes(source.module)
        for function in ast.walk(source.module):
            if not isinstance(function, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            for route in filter(None, (route_of(decorator, prefixes) for decorator in function.decorator_list)):
                for call in calls_in(function):
                    built = name_of(call.func)
                    if built.endswith("CommandEvent"):
                        routes.setdefault(public_name(built), route)
                    if built == "get_query" and call.args:
                        routes.setdefault(public_name(name_of(call.args[0])), route)
    return routes


def inventory_command(name: str, handler: str, shapes: ContextShapes, routes: dict[str, str]) -> Json:
    found = shapes.find(handler)
    cls, module = found if found else (None, ast.Module(body=[], type_ignores=[]))
    aggregate, _, events = shapes.analyse(module)
    command: Json = {"name": name, "actor": actor_of(cls, module)}
    if name in routes:
        command["route"] = routes[name]
    if aggregate:
        command["aggregate"] = aggregate
    command["events"] = sorted_names(events)
    return command


def inventory_query(handler: str, shapes: ContextShapes, routes: dict[str, str]) -> Json:
    found = shapes.find(handler)
    cls, module = found if found else (None, ast.Module(body=[], type_ignores=[]))
    name = public_name(handler)
    query: Json = {"name": name, "actor": actor_of(cls, module)}
    if name in routes:
        query["route"] = routes[name]
    return query


def inventory_policy(on: str, kind: str, node: ast.AST, shapes: ContextShapes) -> Json:
    _, _, events = shapes.analyse(node)
    return {
        "on": on,
        "kind": kind,
        "publishes": sorted_names(published_integration_events(node)),
        "events": sorted_names(events),
    }


def inventory_policies(shapes: ContextShapes, wiring: dict[str, list[tuple[str, list[str]]]]) -> list[Json]:
    policies: list[Json] = []
    subscribed: set[str] = set()
    for section, kind in (("domain_events", "domain-event"), ("integration_events", "integration-event")):
        for event, handlers in wiring[section]:
            for handler in handlers:
                subscribed.add(handler)
                found = shapes.find(handler)
                node: ast.AST = found[1] if found else ast.Module(body=[], type_ignores=[])
                policies.append(inventory_policy(public_name(event), kind, node, shapes))
    # A publisher that is not a subscribed handler reacts to every operation: the Tracker's decorated bus.
    command_handlers = {handler for _, handlers in wiring["commands"] for handler in handlers}
    for source in shapes.sources:
        for cls in source.classes.values():
            if cls.name in subscribed or cls.name in command_handlers or not published_integration_events(cls):
                continue
            policies.append(inventory_policy("every operation", "every-operation", cls, shapes))
    return sorted(
        policies,
        key=lambda policy: ((policy["kind"].casefold(), policy["kind"]), (policy["on"].casefold(), policy["on"])),
    )


def inventory_context(context: str, sources: list[Source], wiring_file: str) -> Json:
    shapes = read_shapes(context, sources)
    wiring = wiring_of(sources, wiring_file)
    routes = routes_of(sources)
    commands = [
        inventory_command(public_name(event), handler, shapes, routes)
        for event, handlers in wiring["commands"]
        for handler in handlers
    ]
    queries = [inventory_query(handler, shapes, routes) for handler, _ in wiring["queries"]]
    by_name = lambda item: (str(item["name"]).casefold(), str(item["name"]))  # noqa: E731
    return {
        "id": context,
        "commands": sorted(commands, key=by_name),
        "queries": sorted(queries, key=by_name),
        "events": domain_events_of(sources),
        "policies": inventory_policies(shapes, wiring),
    }


def port_implemented(cls: ast.ClassDef, ports: dict[str, set[str]]) -> str:
    """The port a class implements without naming it: the Protocol whose every method the class defines,
    the one its name ends with when several do."""
    defined = {method.name for method in methods_of(cls)}
    candidates = [port for port, methods in ports.items() if methods and methods <= defined]
    return next((port for port in candidates if cls.name.endswith(port)), candidates[0] if candidates else "")


def inventory_links(
    contexts: dict[str, list[Source]], binding: dict[str, Any], wiring_file: str, here: Path
) -> list[Json]:
    """The relationships the code carries: an integration event of the shared kernel, from each context
    that builds it to each context whose wiring subscribes to it; a port the asking side owns, from the
    context whose package an adapter imports to the context of that adapter."""
    links: dict[tuple[str, str, str], list[str]] = {}

    def link(mechanism: str, upstream: str, downstream: str, contract: str) -> None:
        contracts = links.setdefault((upstream, downstream, mechanism), [])
        if contract and contract not in contracts:
            contracts.append(contract)

    kernel_events = here / binding["kernel"]["path"] / "application" / "integration_events"
    events = [
        cls.name
        for source in parse_sources(kernel_events)
        for cls in source.classes.values()
        if cls.name.endswith("IntegrationEvent")
    ]
    for event in events:
        publishers = [
            context
            for context, sources in contexts.items()
            if any(name_of(call.func) == event for source in sources for call in calls_in(source.module))
        ]
        consumers = [
            context
            for context, sources in contexts.items()
            if any(event in names_in(source.module) for source in sources if source.path.name == wiring_file)
        ]
        for upstream in publishers:
            for downstream in consumers:
                if upstream != downstream:
                    link("integration-event", upstream, downstream, public_name(event))

    alias = str(binding["contexts_tree"]["alias"])
    by_package = {context.lower(): context for context in contexts}
    for context, sources in contexts.items():
        ports = {
            cls.name: {method.name for method in methods_of(cls)}
            for source in sources
            for cls in source.classes.values()
            if "Protocol" in bases_of(cls)
        }
        for source in sources:
            others = {
                by_package[target.split(".")[1]]
                for target, level, _ in imports_of(source.path)
                if target is not None
                and level == 0
                and target.startswith(f"{alias}.")
                and target.split(".")[1] in by_package
            }
            for other in others - {context}:
                port = next((port_implemented(cls, ports) for cls in source.classes.values()), "")
                link("owned-port", other, context, port)
    return sorted(
        [
            {
                "mechanism": mechanism,
                "upstream": upstream,
                "downstream": downstream,
                "contracts": sorted_names(contracts),
            }
            for (upstream, downstream, mechanism), contracts in links.items()
        ],
        key=lambda each: (f"{each['upstream']}→{each['downstream']}:{each['mechanism']}".casefold(),),
    )


def inspect_inventory(here: Path) -> Json:
    """The inventory of this language's tree, read with ``ast``: the commands of each context with who may
    call them, their route, the aggregate they reach and the events it records; the queries; the domain
    events; the policies and what they publish or reach; the links between contexts. Nothing Python owns
    is in it: no file, no class name, no idiom (ARCH-ONE-APPLICATION)."""
    root = repository_root(here)
    if root is None:
        raise SystemExit(f"✗ {CONTRACT} not found at or above {here}")
    binding = load_yaml(root / BINDING)
    wiring_file = str(binding["wiring"])
    contexts_dir = here / binding["contexts_tree"]["path"]
    sources = {context: parse_sources(contexts_dir / context.lower()) for context in binding["contexts"]}
    return {
        "schemaVersion": INVENTORY_SCHEMA_VERSION,
        "language": LANGUAGE,
        # In the order of the ids, not of the binding: the bindings list their contexts as they please.
        "contexts": [inventory_context(context, sources[context], wiring_file) for context in sorted(sources)],
        "links": inventory_links(sources, binding, wiring_file, here),
    }


def serialize_inventory(inventory: Json) -> str:
    """Canonical JSON: two-space indentation, the keys in the order they were inserted, a trailing newline.
    The same bytes from every language's tool."""
    return json.dumps(inventory, indent=2, ensure_ascii=False) + "\n"


def check_inventory(here: Path, problems: Problems) -> None:
    root = repository_root(here)
    if root is None:
        return
    committed = root / INVENTORY
    rendered = serialize_inventory(inspect_inventory(here))
    if not committed.is_file():
        problems.add(INVENTORY_RULE, f"{INVENTORY} is missing; run `{INVENTORY_WRITE}` and commit it")
    elif committed.read_text(encoding="utf-8") != rendered:
        problems.add(
            INVENTORY_RULE,
            f"{INVENTORY} differs from what the Python tree says; run `{INVENTORY_WRITE}` and commit it "
            "(fix the tree that differs from the other languages, never the inventory)",
        )


def write_inventory(here: Path) -> Path:
    root = repository_root(here)
    if root is None:
        raise SystemExit(f"✗ {CONTRACT} not found at or above {here}")
    target = root / INVENTORY
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(serialize_inventory(inspect_inventory(here)), encoding="utf-8")
    return target


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
    check_inventory(here, problems)
    summary = (
        f"✓ contract v{contract.get('schemaVersion')}, Python binding: {len(modules)} modules and {imports} imports "
        f"are the table, {len(binding['contexts'])} contexts match the tree, every file the binding names exists; "
        "the inventory is current."
    )
    return problems, summary


def can_import(here: Path, pairs: list[tuple[str, str]]) -> list[tuple[str, str, str | None]]:
    """For each (file, module) pair, None when the import would be allowed, else the refusal naming
    its rule: the same table the check holds every import to, asked before the import is written."""
    root = repository_root(here)
    if root is None:
        raise SystemExit(f"✗ {CONTRACT} not found at or above {here}")
    contract = load_yaml(root / CONTRACT)
    binding = load_yaml(root / BINDING)
    verdicts: list[tuple[str, str, str | None]] = []
    for file, target in pairs:
        path = (here / file).resolve() if not Path(file).is_absolute() else Path(file)
        module = classify(path, binding, contract, here) if path.is_relative_to(here / "src") else None
        if module is None:
            verdicts.append((file, target, "ARCH-CONTEXT-DECLARED: the file is outside every tree the binding names"))
            continue
        row = row_of(module, contract)
        unit = unit_of(module, target, binding, contract)
        if row is None or unit is None:
            verdicts.append((file, target, None))
            continue
        rule_id, allowed = row
        if unit in expand(allowed, contract):
            verdicts.append((file, target, None))
        else:
            verdicts.append((file, target, f"{rule_id}: {unit} is not in the row of {module.layer or 'the wiring'}"))
    return verdicts


def inventory_main(here: Path, options: list[str]) -> int:
    """``inventory`` prints the inventory as canonical JSON; ``inventory --write`` writes it where the
    check reads it."""
    if options == ["--write"]:
        written = write_inventory(here)
        print(f"✓ wrote {written.relative_to(repository_root(here) or here)}")
        return 0
    if options:
        print("usage: python -m tools.conventions inventory [--write]", file=sys.stderr)
        return 2
    sys.stdout.write(serialize_inventory(inspect_inventory(here)))
    return 0


def main(argv: list[str] | None = None) -> int:
    here = Path(__file__).resolve().parent.parent
    args = sys.argv[1:] if argv is None else argv
    if args[:1] == ["inventory"]:
        return inventory_main(here, args[1:])
    if args[:1] == ["can-import"]:
        pairs = list(zip(args[1::2], args[2::2], strict=True))
        if not pairs:
            print(
                "usage: python -m tools.conventions can-import <file> <module> [<file> <module> ...]", file=sys.stderr
            )
            return 2
        refused = False
        for file, target, refusal in can_import(here, pairs):
            refused = refused or refusal is not None
            print(f"{'✗' if refusal else '✓'} {file} -> {target}" + (f": {refusal}" if refusal else ""))
        return 1 if refused else 0
    problems, summary = run(here)
    if problems.found:
        for problem in problems.found:
            print(f"✗ {problem}", file=sys.stderr)
        return 1
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
