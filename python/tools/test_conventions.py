"""The conventions check, tried against the tree as it is and against violations written into a
copy of it: a refusal must name its rule, as the ESLint probes do in TypeScript."""

import json
import shutil
from pathlib import Path

import pytest

from tools.conventions import (
    INVENTORY,
    INVENTORY_WRITE,
    can_import,
    inspect_inventory,
    inventory_changes,
    run,
    serialize_inventory,
    write_inventory,
)

HERE = Path(__file__).resolve().parent.parent

STALE_INVENTORY = (
    f"ARCH-ONE-APPLICATION: {INVENTORY} differs from what the Python tree says; run `{INVENTORY_WRITE}` "
    "and commit it (fix the tree that differs from the other languages, never the inventory)"
)


def test_the_tree_as_it_is_passes() -> None:
    problems, summary = run(HERE)
    assert problems.found == []
    assert summary.startswith("✓ contract v1, Python binding")


@pytest.fixture
def copy(tmp_path: Path) -> Path:
    """A copy of the language directory beside a copy of the conventions, so a violation can be written into it."""
    root = tmp_path / "repo"
    shutil.copytree(HERE.parent / "conventions", root / "conventions")
    shutil.copytree(HERE / "src", root / "python" / "src")
    shutil.copytree(HERE / "tools", root / "python" / "tools")
    shutil.copytree(HERE.parent / "docs" / "inventory", root / "docs" / "inventory")
    return root / "python"


def refusals(here: Path) -> list[str]:
    problems, _ = run(here)
    return problems.found


def test_refuses_a_domain_that_imports_its_infrastructure_naming_the_rule(copy: Path) -> None:
    (copy / "src/contexts/notes/domain/note/stray.py").write_text(
        "from contexts.notes.infrastructure.repositories import InMemoryNoteRepository\n"
    )
    found = refusals(copy)
    assert any(problem.startswith("ARCH-DOMAIN:") and "own.Infrastructure" in problem for problem in found)


def test_refuses_a_domain_that_reaches_another_context_or_a_library(copy: Path) -> None:
    (copy / "src/contexts/notes/domain/note/stray.py").write_text(
        "from contexts.security.domain.account import Account\nimport fastapi\n"
    )
    found = refusals(copy)
    assert any("ARCH-DOMAIN:" in problem and "others.Domain" in problem for problem in found)
    assert any("ARCH-DOMAIN:" in problem and "fastapi (libraries)" in problem for problem in found)


def test_refuses_a_relative_import_across_directories(copy: Path) -> None:
    (copy / "src/contexts/notes/domain/note/stray.py").write_text(
        "from ..note import Note\nfrom .ports.note_queries import NoteDetail\n"
    )
    found = refusals(copy)
    assert sum(problem.startswith("ARCH-RELATIVE:") for problem in found) == 2


def test_refuses_an_undeclared_context_and_a_stray_file(copy: Path) -> None:
    (copy / "src/contexts/billing").mkdir()
    (copy / "src/contexts/billing/__init__.py").write_text("")
    (copy / "src/contexts/notes/helpers.py").write_text("")
    found = refusals(copy)
    assert any("ARCH-CONTEXT-DECLARED:" in problem and "billing" in problem for problem in found)
    assert any("ARCH-CONTEXT-DECLARED:" in problem and "helpers.py" in problem for problem in found)


def test_a_test_module_may_use_its_own_infrastructure_but_a_domain_test_may_not(copy: Path) -> None:
    (copy / "src/contexts/notes/application/test_x.py").write_text(
        "from contexts.notes.infrastructure.repositories import InMemoryNoteRepository\n"
    )
    (copy / "src/contexts/notes/domain/note/test_stray.py").write_text(
        "from contexts.notes.infrastructure.repositories import InMemoryNoteRepository\n"
    )
    found = refusals(copy)
    assert not any("application/test_x.py" in problem for problem in found)
    assert any("ARCH-DOMAIN:" in problem and "test_stray.py" in problem for problem in found)


def test_refuses_a_binding_that_names_a_file_which_does_not_exist(copy: Path) -> None:
    binding = copy.parent / "conventions/python.yaml"
    binding.write_text(binding.read_text() + "\n  nowhere:\n    canonical: [src/nowhere.py]\n")
    found = refusals(copy)
    assert any(problem.startswith("ARCH-MAP-IS-REAL:") and "src/nowhere.py" in problem for problem in found)


def one_handler_refusals(here: Path) -> list[str]:
    return [problem for problem in refusals(here) if problem.startswith("ARCH-ONE-HANDLER:")]


def test_refuses_a_command_the_module_lists_with_two_handlers_naming_the_rule_and_the_command(copy: Path) -> None:
    wiring = copy / "src/contexts/notes/module_local.py"
    one = "[CreateNoteCommandHandler(repository)]"
    two = "[CreateNoteCommandHandler(repository), EditNoteCommandHandler(repository)]"
    wiring.write_text(wiring.read_text(encoding="utf-8").replace(one, two), encoding="utf-8")
    assert one_handler_refusals(copy) == [
        "ARCH-ONE-HANDLER: Notes: command CreateNote has 2 handlers "
        "(CreateNoteCommandHandler, EditNoteCommandHandler); a command has exactly one"
    ]


def test_refuses_a_command_a_route_builds_that_no_handler_answers(copy: Path) -> None:
    wiring = copy / "src/contexts/notes/module_local.py"
    listed = "            Subscription(RestoreNoteCommandEvent, [RestoreNoteCommandHandler(repository)]),\n"
    wiring.write_text(wiring.read_text(encoding="utf-8").replace(listed, ""), encoding="utf-8")
    assert one_handler_refusals(copy) == [
        "ARCH-ONE-HANDLER: Notes: command RestoreNote is built by a route and no handler in the Module answers it"
    ]


def test_refuses_a_command_a_policy_dispatches_that_no_handler_answers(copy: Path) -> None:
    policy = copy / "src/contexts/notes/application/events/note_created_handler.py"
    dispatch = "\n\ndef dispatch() -> object:\n    return PinNoteCommandEvent(note_id='x')\n"
    policy.write_text(policy.read_text(encoding="utf-8") + dispatch, encoding="utf-8")
    assert one_handler_refusals(copy) == [
        "ARCH-ONE-HANDLER: Notes: command PinNote is dispatched by NoteCreatedHandler "
        "and no handler in the Module answers it"
    ]


def test_can_import_answers_before_the_import_is_written_and_names_the_rule_that_refuses() -> None:
    verdicts = can_import(
        HERE,
        [
            ("src/contexts/notes/application/commands/pin_note.py", "contexts.notes.domain.note.note"),
            ("src/contexts/notes/domain/note/note.py", "contexts.notes.infrastructure.repositories"),
            ("src/contexts/notes/domain/note/note.py", "contexts.security.domain.account.account"),
            ("src/contexts/notes/infrastructure/queries.py", "sqlite3"),
        ],
    )
    assert [refusal is None for _, _, refusal in verdicts] == [True, False, False, True]
    assert verdicts[1][2] is not None and verdicts[1][2].startswith("ARCH-DOMAIN:")
    assert verdicts[2][2] is not None and verdicts[2][2].startswith("ARCH-DOMAIN:")


def test_the_inventory_says_the_same_application_as_the_typescript_tree() -> None:
    """The words every language must say the same (ARCH-ONE-APPLICATION): read from the Python tree with
    ``ast``, they are the TypeScript inventory's, context for context and link for link."""
    inventory = inspect_inventory(HERE)
    reference = json.loads((HERE.parent / "docs" / "inventory" / "typescript.json").read_text(encoding="utf-8"))
    assert inventory["language"] == "python"
    assert inventory["schemaVersion"] == reference["schemaVersion"]
    assert {context["id"]: context for context in inventory["contexts"]} == {
        context["id"]: context for context in reference["contexts"]
    }
    assert inventory["links"] == reference["links"]
    # Canonical bytes: what is written is what is read back, the keys in the order they were inserted.
    assert json.loads(serialize_inventory(inventory)) == inventory
    assert serialize_inventory(inventory).endswith("}\n")


def test_refuses_a_stale_or_missing_inventory_naming_the_command_that_writes_it(copy: Path) -> None:
    committed = copy.parent / INVENTORY
    committed.write_text(committed.read_text(encoding="utf-8").replace('"ShareNote"', '"ShareNotes"'), encoding="utf-8")
    stale = [problem for problem in refusals(copy) if problem.startswith("ARCH-ONE-APPLICATION:")]
    assert stale == [
        STALE_INVENTORY,
        "ARCH-ONE-APPLICATION: Notes: the committed inventory has the command ShareNotes, the tree no longer says it",
        "ARCH-ONE-APPLICATION: Notes: the tree says the command ShareNote, the committed inventory does not",
    ]

    committed.unlink()
    missing = [problem for problem in refusals(copy) if problem.startswith("ARCH-ONE-APPLICATION:")]
    assert len(missing) == 1 and "missing" in missing[0] and INVENTORY_WRITE in missing[0]

    assert write_inventory(copy) == committed
    assert not any(problem.startswith("ARCH-ONE-APPLICATION:") for problem in refusals(copy))


def test_a_stale_inventory_names_each_difference_committed_before_tree_in_the_words_every_language_prints() -> None:
    share = {
        "name": "ShareNote",
        "actor": "a signed-in account",
        "route": "POST /notes/{param}/share",
        "aggregate": "Note",
        "events": ["NoteShared"],
    }
    archive = {"name": "ArchiveNote", "actor": "a signed-in account", "aggregate": "Note", "events": ["NoteArchived"]}
    on_shared = {"on": "NoteShared", "kind": "domain-event", "publishes": ["NoteShared"], "events": []}
    link = {"mechanism": "owned-port", "upstream": "Security", "downstream": "Notes", "contracts": ["AccountDirectory"]}
    committed = {
        "schemaVersion": 1,
        "language": "python",
        "contexts": [
            {
                "id": "Notes",
                "commands": [archive, share],
                "queries": [],
                "events": ["NoteArchived", "NoteShared"],
                "policies": [on_shared],
            },
            {"id": "Notifications", "commands": [], "queries": [], "events": [], "policies": []},
        ],
        "links": [link],
    }
    tree = {
        "schemaVersion": 1,
        "language": "python",
        "contexts": [
            {
                "id": "Notes",
                "commands": [
                    {"name": "PinNote", "actor": "a signed-in account", "aggregate": "Note", "events": []},
                    {**{key: value for key, value in share.items() if key != "route"}, "actor": "anyone"},
                ],
                "queries": [],
                "events": ["NoteShared"],
                "policies": [{**on_shared, "publishes": []}],
            },
        ],
        "links": [{**link, "contracts": ["AccountDirectory", "AccountNames"]}],
    }
    assert inventory_changes(committed, tree) == [
        "Notes: the committed inventory has the command ArchiveNote, the tree no longer says it",
        'Notes: the command ShareNote differs: actor "a signed-in account" → "anyone"; '
        'route "POST /notes/{param}/share" → none',
        "Notes: the tree says the command PinNote, the committed inventory does not",
        "Notes: the committed inventory has the domain event NoteArchived, the tree no longer says it",
        "Notes: the policy on NoteShared differs: publishes [NoteShared] → []",
        "Notifications: the committed inventory has the context, the tree no longer says it",
        "context map: the link Security → Notes (owned-port) differs: contracts [AccountDirectory] → "
        "[AccountDirectory, AccountNames]",
    ]
    assert inventory_changes(committed, committed) == []


# The readers, challenged with unusual shapes: recognised, or caught, never silent.
#
# The readers recognise the canonical shapes the guide teaches, and no other — by design: a reading that guessed
# at every way a command could be built would be a second guide, drifting from the first. What that stance costs
# is a shape a reader does not see, and the question that matters is whether such a shape can stay silent. These
# probes write unusual but valid shapes into a copy of the tree and run the full check on it: the command is
# still read as the committed inventory expects (recognised), or the copy is refused — by the inventory held
# current (ARCH-ONE-APPLICATION), or by the one-handler rule (ARCH-ONE-HANDLER). A probe that is neither is a
# false negative, and fails here; a reader that starts recognising a shape moves its probe to "recognised",
# which is a change to the guide as much as to the tool. The TypeScript reader's probes are the same, in
# tools/src/shapes.spec.ts at the root.

NOTES_WIRING = "src/contexts/notes/module_local.py"
NOTES_ROUTES = "src/contexts/notes/presentation/routes.py"
SHARE_HANDLER = "src/contexts/notes/application/commands/share_note.py"

SHARE_BUILT = "ShareNoteCommandEvent(note_id=note_id, recipient_id=body.recipientId)"
SHARE_HANDLER_BUILT = "ShareNoteCommandHandler(repository, NoteSharing(accounts))"
SHARE_LISTED = f"Subscription(ShareNoteCommandEvent, [{SHARE_HANDLER_BUILT}]),"
#: Where a module-level name goes in the routes module; where a name built from the wiring's ports goes, since
#: the ports are the wiring function's locals.
ROUTES_BODY = "class ShareNoteBody(BaseModel):"
WIRING_PORTS = "    queries = InMemoryNoteQueries(store)\n"

SHARE_ROUTE_LOST = (
    'ARCH-ONE-APPLICATION: Notes: the command ShareNote differs: route "POST /notes/{param}/share" → none'
)
SHARE_LOST = (
    "ARCH-ONE-APPLICATION: Notes: the committed inventory has the command ShareNote, the tree no longer says it"
)
SHARE_UNANSWERED = (
    "ARCH-ONE-HANDLER: Notes: command ShareNote is built by a route and no handler in the Module answers it"
)


def rewrite(here: Path, file: str, old: str, new: str) -> None:
    """Replace ``old`` by ``new`` in one file of the copy; a probe that does not match exactly once is broken."""
    path = here / file
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise AssertionError(f"{file} does not contain exactly once: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def probe(here: Path, *edits: tuple[str, str, str]) -> list[str]:
    """The copy with one unusual shape written into it, and every line the full check says of it: none when
    the shape is recognised (the inventory is then the committed one, byte for byte), else the refusals —
    a stale inventory is the stale line followed by each difference it names."""
    for file, old, new in edits:
        rewrite(here, file, old, new)
    return refusals(here)


def test_the_tree_as_it_is_every_shape_recognised_nothing_caught(copy: Path) -> None:
    assert probe(copy) == []


def test_a_handler_class_named_for_its_use_case_is_recognised_the_command_is_named_by_its_event(copy: Path) -> None:
    found = probe(
        copy,
        (SHARE_HANDLER, "class ShareNoteCommandHandler(", "class ShareNoteUseCase("),
        (NOTES_WIRING, "ShareNoteCommandEvent, ShareNoteCommandHandler\n", "ShareNoteCommandEvent, ShareNoteUseCase\n"),
        (NOTES_WIRING, SHARE_HANDLER_BUILT, "ShareNoteUseCase(repository, NoteSharing(accounts))"),
    )
    assert found == []


def test_a_command_built_through_an_alias_of_its_class_is_not_seen_by_the_route_reading_caught_by_the_inventory(
    copy: Path,
) -> None:
    found = probe(
        copy,
        (NOTES_ROUTES, SHARE_BUILT, "Share(note_id=note_id, recipient_id=body.recipientId)"),
        (NOTES_ROUTES, ROUTES_BODY, f"Share = ShareNoteCommandEvent\n\n\n{ROUTES_BODY}"),
    )
    # The handler is listed, so ARCH-ONE-HANDLER has nothing to say; the route is what the inventory lost.
    assert found == [STALE_INVENTORY, SHARE_ROUTE_LOST]


def test_a_command_built_by_a_helper_the_route_calls_is_not_seen_by_the_route_reading_caught_by_the_inventory(
    copy: Path,
) -> None:
    helper = (
        "def share(note_id: str, recipient_id: str) -> ShareNoteCommandEvent:\n"
        "    return ShareNoteCommandEvent(note_id=note_id, recipient_id=recipient_id)\n\n\n"
    )
    found = probe(
        copy,
        (NOTES_ROUTES, SHARE_BUILT, "share(note_id, body.recipientId)"),
        (NOTES_ROUTES, ROUTES_BODY, f"{helper}{ROUTES_BODY}"),
    )
    # The helper builds the command in the routes module, which ARCH-ONE-HANDLER reads whole: it is answered.
    assert found == [STALE_INVENTORY, SHARE_ROUTE_LOST]


def test_a_handlers_list_held_in_a_variable_is_not_seen_caught_by_both_rules_as_zero_handlers(copy: Path) -> None:
    found = probe(
        copy,
        (NOTES_WIRING, SHARE_LISTED, "Subscription(ShareNoteCommandEvent, share_handlers),"),
        (NOTES_WIRING, WIRING_PORTS, f"{WIRING_PORTS}    share_handlers = [{SHARE_HANDLER_BUILT}]\n"),
    )
    # The Subscription is read and its handlers are not: the command is listed with none.
    assert found == [
        "ARCH-ONE-HANDLER: Notes: command ShareNote has 0 handlers (); a command has exactly one",
        STALE_INVENTORY,
        SHARE_LOST,
    ]


def test_a_handler_built_by_a_factory_is_counted_as_the_one_handler_but_not_read_caught_by_the_inventory(
    copy: Path,
) -> None:
    factory = f"    def share_handler() -> ShareNoteCommandHandler:\n        return {SHARE_HANDLER_BUILT}\n\n"
    found = probe(
        copy,
        (NOTES_WIRING, SHARE_LISTED, "Subscription(ShareNoteCommandEvent, [share_handler()]),"),
        (NOTES_WIRING, WIRING_PORTS, f"{WIRING_PORTS}{factory}"),
    )
    # One call in the list is one handler, so ARCH-ONE-HANDLER is satisfied; the call names no class the
    # reader can follow, so the command keeps its route and loses its guard, its aggregate and its events.
    assert found == [
        STALE_INVENTORY,
        'ARCH-ONE-APPLICATION: Notes: the command ShareNote differs: actor "a signed-in account" → "anyone"; '
        'aggregate "Note" → none; events [NoteShared] → []',
    ]


def test_a_subscription_spread_into_the_commands_list_from_a_variable_is_not_seen_caught_by_both_rules(
    copy: Path,
) -> None:
    found = probe(
        copy,
        (NOTES_WIRING, SHARE_LISTED, "*share_commands,"),
        (NOTES_WIRING, WIRING_PORTS, f"{WIRING_PORTS}    share_commands = [{SHARE_LISTED[:-1]}]\n"),
    )
    assert found == [SHARE_UNANSWERED, STALE_INVENTORY, SHARE_LOST]


def test_a_command_listed_under_an_alias_of_its_event_class_is_not_seen_caught_by_both_rules(copy: Path) -> None:
    found = probe(
        copy,
        (NOTES_WIRING, SHARE_LISTED, f"Subscription(Share, [{SHARE_HANDLER_BUILT}]),"),
        (NOTES_WIRING, "#: The context's store", "Share = ShareNoteCommandEvent\n\n#: The context's store"),
    )
    # The alias is read as the command's name: a command Share no route builds, and ShareNote unanswered.
    assert found == [
        SHARE_UNANSWERED,
        STALE_INVENTORY,
        SHARE_LOST,
        "ARCH-ONE-APPLICATION: Notes: the tree says the command Share, the committed inventory does not",
    ]


# What a policy publishes: a reaction tells other contexts through the outbox, ``publish_integration_event(
# XIntegrationEvent(...), context)`` (ADR 30), and that call is what the reader reads; a bus's own
# ``publish(...)`` is read too, since the Tracker's decorated bus publishes that way.

ON_SHARED = "src/contexts/notes/application/events/note_shared_handler.py"
TOLD = "        publish_integration_event(\n            NoteSharedIntegrationEvent("
ON_SHARED_LOST = "ARCH-ONE-APPLICATION: Notes: the policy on NoteShared differs: publishes [NoteShared] → []"


def test_a_reaction_that_publishes_straight_to_the_bus_is_still_read_as_publishing(copy: Path) -> None:
    found = probe(
        copy, (ON_SHARED, TOLD, "        context.event_bus.publish(\n            NoteSharedIntegrationEvent(")
    )
    # Recognised: what the policy publishes is the same fact; that it bypasses the outbox is the review's to see.
    assert found == []


def test_an_integration_event_published_from_a_variable_is_not_seen_caught_by_the_inventory(copy: Path) -> None:
    found = probe(
        copy,
        (ON_SHARED, TOLD, "        told = NoteSharedIntegrationEvent("),
        (
            ON_SHARED,
            "            ),\n            context,\n        )\n",
            "        )\n        publish_integration_event(told, context)\n",
        ),
    )
    assert found == [STALE_INVENTORY, ON_SHARED_LOST]
