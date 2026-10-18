from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.entity import Entity
from architecture.domain.id import Id
from architecture.domain.value_object import ValueObject


class Order(Entity):
    __slots__ = ()


class Invoice(Entity):
    __slots__ = ()


def test_an_entity_is_the_same_thing_as_another_of_its_kind_with_the_same_id() -> None:
    assert Order(Id("a")).equals(Order(Id("a")))
    assert not Order(Id("a")).equals(Order(Id("b")))
    # An Order is never the same thing as an Invoice, whatever the id.
    assert not Order(Id("a")).equals(Invoice(Id("a")))


def test_an_aggregate_carries_the_version_it_was_read_at_and_pulls_its_events_once() -> None:
    class Greeter(AggregateRoot):
        __slots__ = ()

    greeter = Greeter(Id.generate(), version=3)
    assert greeter.version == 3
    assert greeter.pull_domain_events() == []


def test_a_value_object_compares_by_value_and_kind() -> None:
    class Email(ValueObject[str]):
        pass

    class Name(ValueObject[str]):
        pass

    assert Email("a@b.io") == Email("a@b.io")
    assert Email("a@b.io") != Email("c@d.io")
    another_kind: object = Name("x")
    assert Email("x") != another_kind
    assert Id.generate() != Id.generate()
