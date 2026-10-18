import pytest

from architecture.domain.result import Failure, Success
from shared_kernel.domain.email import Email
from shared_kernel.domain.role import Role


def test_accepts_a_well_formed_address_and_normalises_it() -> None:
    email = Email.create("  Alice@Example.com ")
    assert isinstance(email, Success)
    assert email.data.value == "alice@example.com"
    assert email.data.username == "alice"


@pytest.mark.parametrize("raw", ["", "alice", "alice@", "@example.com", "alice@example", "a b@example.com"])
def test_refuses_what_is_not_an_address(raw: str) -> None:
    refusal = Email.create(raw)
    assert isinstance(refusal, Failure)
    assert refusal.error.type == "InvalidEmailFormat"


def test_compares_by_value() -> None:
    assert Email.create("a@b.io") == Email.create("A@B.IO")


def test_a_role_is_parsed_from_its_name_only() -> None:
    assert Role.parse("USER") is Role.USER
    assert Role.parse("user") is None
    assert Role.ADMIN == "ADMIN"
