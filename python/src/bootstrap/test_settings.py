"""The settings read from the environment: what is never given a default."""

from bootstrap.settings import AdminAccount, admin_account_from


def test_an_administrator_exists_only_when_both_its_identifier_and_password_are_set() -> None:
    assert admin_account_from("root@example.com", "s3cret") == AdminAccount(
        identifier="root@example.com", password="s3cret"
    )
    assert admin_account_from(None, None) is None
    assert admin_account_from("root@example.com", None) is None
    assert admin_account_from(None, "s3cret") is None
    assert admin_account_from("", "") is None
