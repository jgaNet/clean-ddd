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
    run,
    serialize_inventory,
    write_inventory,
)

HERE = Path(__file__).resolve().parent.parent


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
    assert len(stale) == 1 and INVENTORY in stale[0] and INVENTORY_WRITE in stale[0]

    committed.unlink()
    missing = [problem for problem in refusals(copy) if problem.startswith("ARCH-ONE-APPLICATION:")]
    assert len(missing) == 1 and "missing" in missing[0] and INVENTORY_WRITE in missing[0]

    assert write_inventory(copy) == committed
    assert not any(problem.startswith("ARCH-ONE-APPLICATION:") for problem in refusals(copy))
