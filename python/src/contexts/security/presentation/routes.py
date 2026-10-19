"""The REST routes of authentication and accounts. Sign-up and validation are commands:
accepted (202) and followed through the operation. Login answers synchronously, in JSON or
HTMX depending on the request, and runs the handler through the module: the token is answered,
and the Tracker never sees it. The two ``GET …/validate`` routes are commands on ``GET``
because they are links clicked from an email; do not copy that for anything else."""

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from starlette.responses import JSONResponse, Response

from architecture.application.module import Module
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.result import Failure
from architecture.presentation.format import Format, format_of
from architecture.presentation.http import accept, context_of, refuse
from contexts.security.application.commands.login import LoginCommandEvent, LoginCommandHandler
from contexts.security.application.commands.sign_up import SignUpCommandEvent
from contexts.security.application.commands.validate_account import ValidateAccountCommandEvent
from contexts.security.application.queries.get_account import GetAccountQueryHandler
from contexts.security.presentation.presenters import ERROR, LOGGED_IN, LOGGED_OUT, ME, SIGN_IN_AGAIN, account_view


class CredentialsBody(BaseModel):
    identifier: str
    password: str


def auth_routes(module: Module) -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/signup", status_code=202)
    async def sign_up(request: Request, body: CredentialsBody) -> Response:
        context = context_of(request)
        if context.logger:
            context.logger.info("Creating new account", {"traceId": context.trace_id, "email": body.identifier})
        # The password is hashed by the handler, behind the PasswordHasher port.
        return accept(context, SignUpCommandEvent(email=body.identifier, password=body.password))

    @router.get("/validate", status_code=202)
    async def validate(request: Request, validation_token: str = Query()) -> Response:
        # The token is verified by the handler; whether it is valid is the operation's outcome.
        return accept(context_of(request), ValidateAccountCommandEvent(validation_token=validation_token))

    @router.post("/login")
    async def login(request: Request, body: CredentialsBody) -> Response:
        format_ = format_of(request.headers)
        result = await module.get_command(LoginCommandHandler).run(
            LoginCommandEvent(identifier=body.identifier, password=body.password), context_of(request)
        )
        if isinstance(result, Failure):
            response = ERROR.present(format_, result.error.message)
            response.status_code = 401
            return response
        response = LOGGED_IN.present(format_, result.data)
        response.set_cookie("token", result.data, path="/", httponly=True, secure=True, samesite="strict")
        return response

    @router.get("/me")
    async def me(request: Request) -> Response:
        context = context_of(request)
        format_ = format_of(request.headers)
        result = await module.get_query(GetAccountQueryHandler).handle(context.auth.subject_id or "", context)
        if isinstance(result, Failure):
            if isinstance(result.error, NotAllowedException):
                # HTMX swaps the login form back in; an API client gets a 401.
                response = SIGN_IN_AGAIN.present(format_, result.error.message)
                response.status_code = 200 if format_ is Format.HTMX else 401
                return response
            response = ERROR.present(format_, result.error.message)
            response.status_code = 400
            return response
        return ME.present(format_, result.data)

    @router.post("/logout")
    async def logout(request: Request) -> Response:
        response = LOGGED_OUT.present(format_of(request.headers), "Logout successful")
        response.delete_cookie("token", path="/")
        return response

    @router.get("/accounts/{account_id}/validate", status_code=202, tags=["accounts"])
    async def validate_account_by_id(request: Request, account_id: str) -> Response:
        # Whether this caller may validate by id is the handler's decision, from the context.
        return accept(context_of(request), ValidateAccountCommandEvent(account_id=account_id))

    @router.get("/accounts/{account_id}", tags=["accounts"])
    async def get_account_by_id(request: Request, account_id: str) -> Response:
        context = context_of(request)
        result = await module.get_query(GetAccountQueryHandler).handle(account_id, context)
        if isinstance(result, Failure):
            return refuse(result.error)
        return JSONResponse(account_view(result.data))

    return router
