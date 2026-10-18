from architecture.domain.common_exceptions import NotAllowedException, NotFoundException
from architecture.domain.result import Failure, Result, Success


def halve(n: int) -> Result[int]:
    if n % 2:
        return Failure(NotAllowedException("Test", "Odd numbers do not halve", {"n": n}))
    return Success(n // 2)


def test_a_success_carries_its_data_and_a_failure_its_exception() -> None:
    assert halve(4) == Success(2)
    refused = halve(3)
    assert isinstance(refused, Failure)
    assert refused.error.type == "NotAllowed"
    assert refused.error.context == {"n": 3}


def test_a_failure_is_returned_as_is_whatever_the_expected_type() -> None:
    def describe(n: int) -> Result[str]:
        half = halve(n)
        if isinstance(half, Failure):
            return half
        return Success(f"half of {n} is {half.data}")

    assert describe(4) == Success("half of 4 is 2")
    assert describe(3).is_failure()


def test_the_common_exceptions_name_the_type_a_controller_switches_on_and_never_leave_the_service_blank() -> None:
    assert NotFoundException("Notes", "Note not found").type == "NotFound"
    assert NotAllowedException("", "Sign in first").service == "unknown"
