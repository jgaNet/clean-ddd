"""The same use case answered in two formats; which one is decided per request from the
headers. For the HTMX front end, "not signed in" is answered with the login form itself."""

from starlette.responses import JSONResponse, Response

from architecture.presentation.format import ByFormat, html
from contexts.security.domain.account.ports.account_queries import AccountDetail


def account_view(account: AccountDetail) -> dict[str, str]:
    view = {"id": account.id, "email": account.email, "role": account.role.value, "status": account.status.value}
    if account.last_authenticated_at is not None:
        view["lastAuthenticatedAt"] = account.last_authenticated_at.isoformat()
    return view


class LoggedInJsonPresenter:
    def present(self, token: str) -> Response:
        return JSONResponse({"token": token})


class LoggedInHtmxPresenter:
    """Logged in: the page loads the account. The fragment carries the token, so a page served from
    another origin, where the cookie does not reach, can keep it and send it as a bearer."""

    def present(self, token: str) -> Response:
        return html(
            '<div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app"'
            f' data-token="{token}"></div>'
        )


class MeJsonPresenter:
    def present(self, account: AccountDetail) -> Response:
        return JSONResponse(account_view(account))


class MeHtmxPresenter:
    def present(self, account: AccountDetail) -> Response:
        return html(f"""
            <div ws-connect="/ws">
              <div id="notifications"></div>
              <div>
                <h3>
                  Welcome {account.email}
                  <button id="logout" hx-push-url="/" hx-post="/v1/auth/logout" hx-trigger="click" hx-ext="json-enc">
                    Logout
                  </button>
                </h3>
              </div>
              <div
                hx-get="/v1/notes/new" hx-trigger="load" hx-swap="outerHTML" hx-target="#new-note" id="new-note"
              ></div>
            </div>
        """)


class ErrorJsonPresenter:
    def present(self, message: str) -> Response:
        return JSONResponse({"error": message})


class ErrorHtmxPresenter:
    def present(self, message: str) -> Response:
        return html(f'<div class="alert alert-danger" role="alert">{message}</div>')


class LogoutJsonPresenter:
    def present(self, message: str) -> Response:
        return JSONResponse({"message": message})


class LoginHtmxPresenter:
    def present(self, message: str) -> Response:
        return html(f"""
            <div>
              <form
                hx-push-url="/me"
                hx-post="/v1/auth/login"
                hx-ext="json-enc"
                hx-target="#app"
                hx-target-error="#errors"
                hx-swap="innerHTML"
              >
                <input name="identifier" placeholder="Identifier" />
                <input name="password" placeholder="Password" />
                <input type="submit" value="Login" />
              </form>
              <br />
              <div id="errors">{message}</div>
              <script>
                history.pushState({{}}, '', '/');
              </script>
            </div>
        """)


LOGGED_IN: ByFormat[str] = ByFormat(json=LoggedInJsonPresenter(), htmx=LoggedInHtmxPresenter())
ME: ByFormat[AccountDetail] = ByFormat(json=MeJsonPresenter(), htmx=MeHtmxPresenter())
LOGGED_OUT: ByFormat[str] = ByFormat(json=LogoutJsonPresenter(), htmx=LoginHtmxPresenter())
ERROR: ByFormat[str] = ByFormat(json=ErrorJsonPresenter(), htmx=ErrorHtmxPresenter())
SIGN_IN_AGAIN: ByFormat[str] = ByFormat(json=ErrorJsonPresenter(), htmx=LoginHtmxPresenter())
