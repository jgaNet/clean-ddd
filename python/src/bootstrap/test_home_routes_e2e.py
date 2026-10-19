"""The home of the API and the front end, end to end: the same route in two formats, and the
page the browser loads."""

from bootstrap.settings import package_version
from bootstrap.testing import start_test_application


async def test_the_home_answers_json_to_a_client_and_the_page_shell_to_htmx() -> None:
    app = await start_test_application()
    client = app.anonymous()

    home = await client.get(app.api)
    assert home.status_code == 200
    assert home.json() == {"name": "clean-ddd", "version": package_version()}

    shell = await client.get(app.api, headers={"HX-Request": "true"})
    assert shell.status_code == 200 and shell.headers["content-type"].startswith("text/html")
    assert "<main" in shell.text and "<h1>clean-ddd</h1>" in shell.text

    health = await client.get(f"{app.api}/health")
    assert health.json()["status"] == "ok"

    await app.stop()


async def test_the_front_end_is_served_beside_the_api_and_speaks_htmx() -> None:
    app = await start_test_application()
    root = app.api.removesuffix("/v1")
    client = app.anonymous()

    # The page, and the page again for a route of the front end
    for path in ("/", "/me"):
        page = await client.get(f"{root}{path}")
        assert page.status_code == 200 and '<script src="/js/htmx.min.js"></script>' in page.text
    assert (await client.get(f"{root}/js/htmx.min.js")).status_code == 200

    # Not signed in: HTMX gets the login form, an API client a 401
    form = await client.get(f"{app.api}/auth/me", headers={"HX-Request": "true"})
    assert form.status_code == 200 and 'hx-post="/v1/auth/login"' in form.text
    assert (await client.get(f"{app.api}/auth/me")).status_code == 401

    # Logged in through the form: the fragment that loads the account, with the cookie
    credentials = {"identifier": "admin@admin.fr", "password": "admin"}
    logged_in = await client.post(f"{app.api}/auth/login", json=credentials, headers={"HX-Request": "true"})
    assert logged_in.status_code == 200 and "set-cookie" in logged_in.headers
    assert 'hx-get="/v1/auth/me"' in logged_in.text
    refused = await client.post(
        f"{app.api}/auth/login", json={**credentials, "password": "nope"}, headers={"HX-Request": "true"}
    )
    assert refused.status_code == 401 and "alert" in refused.text

    # The account page and the new-note form, as the front end loads them
    admin = await app.admin()
    me = await admin.get(f"{app.api}/auth/me", headers={"HX-Request": "true"})
    assert "Welcome admin@admin.fr" in me.text
    form = await admin.get(f"{app.api}/notes/new")
    assert 'hx-post="/v1/notes"' in form.text
    logout = await admin.post(f"{app.api}/auth/logout", headers={"HX-Request": "true"})
    assert "Login" in logout.text

    await app.stop()
