"""The conventions check, tried against the tree as it is and against violations written into a
copy of it: a refusal must name its rule, as the ESLint probes do in TypeScript."""

import shutil
from pathlib import Path

import pytest

from tools.conventions import can_import, run

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
