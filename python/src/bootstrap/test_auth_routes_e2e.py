"""The auth routes, end to end: login, sign-up, validation, and what a reference must not do."""

from bootstrap.testing import start_test_application


async def test_login_answers_a_token_for_valid_credentials_and_401_otherwise() -> None:
    app = await start_test_application()
    api = app.api

    accepted = await app.login("admin@admin.fr", "admin")
    assert accepted.status_code == 200
    assert accepted.headers["set-cookie"].startswith("token=")
    assert isinstance(accepted.json()["token"], str)

    assert (await app.login("error@admin.fr", "admin")).status_code == 401
    assert (await app.login("admin@admin.fr", "nope")).status_code == 401

    # A forged token is ignored: the caller is anonymous, and /auth/me says so
    forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWJqZWN0SWQiOiJ4Iiwic3ViamVjdFR5cGUiOiJBRE1JTiJ9.bad"
    me = await app.anonymous().get(f"{api}/auth/me", headers={"authorization": f"Bearer {forged}"})
    assert me.status_code == 401

    # The genuine one is not
    admin = await app.admin()
    me = (await admin.get(f"{api}/auth/me")).json()
    assert (me["email"], me["role"], me["status"]) == ("admin@admin.fr", "ADMIN", "ACTIVE")

    await app.stop()


async def test_sign_up_opens_a_pending_account_an_administrator_validates() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    async def sign_up(identifier: str, password: str) -> dict[str, object]:
        response = await app.anonymous().post(
            f"{api}/auth/signup", json={"identifier": identifier, "password": password}
        )
        return await app.accepted(admin, response)

    # An existing email is refused, through the operation
    existing = await sign_up("admin@admin.fr", "admin")
    assert existing["status"] == "ERROR" and existing["error"] == {
        "type": "AccountAlreadyExists",
        "message": "An account already exists for this email",
    }

    # A new one is pending until validated
    operation = await sign_up("user@user.fr", "user")
    assert operation["status"] == "SUCCESS"
    account_id = operation["result"]

    pending = (await admin.get(f"{api}/auth/accounts/{account_id}")).json()
    assert pending == {"id": account_id, "email": "user@user.fr", "role": "USER", "status": "PENDING"}
    assert (await app.login("user@user.fr", "user")).status_code == 401

    validated = await admin.get(f"{api}/auth/accounts/{account_id}/validate")
    assert (await app.accepted(admin, validated))["status"] == "SUCCESS"

    active = (await admin.get(f"{api}/auth/accounts/{account_id}")).json()
    assert active["status"] == "ACTIVE"
    assert (await app.login("user@user.fr", "user")).status_code == 200

    # A user reads their own account, not another's
    user = await app.agent_as("user@user.fr", "user")
    assert (await user.get(f"{api}/auth/accounts/{account_id}")).status_code == 200
    assert isinstance((await user.get(f"{api}/auth/me")).json()["lastAuthenticatedAt"], str)
    admin_id = (await admin.get(f"{api}/auth/me")).json()["id"]
    assert (await user.get(f"{api}/auth/accounts/{admin_id}")).status_code == 403

    await app.stop()


async def test_what_a_reference_must_not_do() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    # Never store or serve the password of a sign-up
    signed_up = await app.anonymous().post(
        f"{api}/auth/signup", json={"identifier": "frank@user.fr", "password": "S3cret-Plaintext"}
    )
    operation = await app.accepted(admin, signed_up)
    assert "payload" not in operation
    assert "S3cret-Plaintext" not in str(operation)

    # Never let an anonymous caller validate an account
    signed_up = await app.anonymous().post(
        f"{api}/auth/signup", json={"identifier": "grace@user.fr", "password": "grace"}
    )
    account_id = (await app.accepted(admin, signed_up))["result"]
    attempt = await app.anonymous().get(f"{api}/auth/accounts/{account_id}/validate")
    assert attempt.status_code == 202
    operation = await app.accepted(admin, attempt)
    assert operation["status"] == "ERROR" and operation["error"]["type"] == "NotAllowed"
    assert (await admin.get(f"{api}/auth/accounts/{account_id}")).json()["status"] == "PENDING"

    # Never record a login: the token is not an operation's result
    operations = (await admin.get(f"{api}/tracker/operations")).json()
    assert all(record["name"] != "Login" for record in operations)

    await app.stop()
