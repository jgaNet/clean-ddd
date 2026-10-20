"""Boots the real application in this process, on a free port, with fresh in-memory stores,
seeded with the administrator from the settings. Each end-to-end suite starts its own and stops
it afterwards, so suites neither share state nor depend on their order. The tests still talk
HTTP: what they prove is what a client would see.

The end-to-end tests depend on this module and on the HTTP client, and reach into no layer
(ARCH-E2E).
"""

import asyncio
from typing import Any

import httpx

from bootstrap.create_application import Running, create_application
from bootstrap.settings import Settings


class TestApplication:
    __test__ = False  # not a test class, whatever its name

    def __init__(self, running: Running) -> None:
        self._running = running
        #: Base URL of the API of this instance, e.g. ``http://127.0.0.1:53210/v1``.
        self.api = f"{running.address}/v1"
        self._clients: list[httpx.AsyncClient] = []

    def anonymous(self) -> httpx.AsyncClient:
        client = httpx.AsyncClient(headers={"accept": "application/json"})
        self._clients.append(client)
        return client

    async def login(self, identifier: str, password: str) -> httpx.Response:
        return await self.anonymous().post(
            f"{self.api}/auth/login", json={"identifier": identifier, "password": password}
        )

    async def agent_as(self, identifier: str, password: str) -> httpx.AsyncClient:
        """A client carrying the bearer token of that account."""
        token = (await self.login(identifier, password)).json()["token"]
        client = httpx.AsyncClient(headers={"authorization": f"Bearer {token}"})
        self._clients.append(client)
        return client

    async def admin(self) -> httpx.AsyncClient:
        return await self.agent_as("admin@admin.fr", "admin")

    async def operation(self, client: httpx.AsyncClient, operation_id: str) -> dict[str, Any]:
        """Follows an accepted command to its outcome: the operation, once it is no longer
        pending. A client holding a 202 does the same; the dispatch runs after the answer (ADR 14)."""
        for _ in range(200):
            response = await client.get(f"{self.api}/tracker/operations/{operation_id}")
            if response.is_success:
                operation: dict[str, Any] = response.json()
                if operation["status"] != "PENDING":
                    return operation
            await asyncio.sleep(0.005)
        raise AssertionError(f"operation {operation_id} did not reach an outcome in time")

    async def accepted(self, client: httpx.AsyncClient, response: httpx.Response) -> dict[str, Any]:
        """Accepts a command and follows it: the operation at its outcome."""
        assert response.status_code == 202, response.text
        return await self.operation(client, response.json()["operationId"])

    async def sign_up_validated(self, identifier: str, password: str) -> str:
        """Signs up a new account, validates it as the administrator, and returns its id: a fresh, usable user."""
        admin = await self.admin()
        signed_up = await self.anonymous().post(
            f"{self.api}/auth/signup", json={"identifier": identifier, "password": password}
        )
        account_id: str = (await self.accepted(admin, signed_up))["result"]
        validated = await admin.get(f"{self.api}/auth/accounts/{account_id}/validate")
        await self.accepted(admin, validated)
        return account_id

    async def stop(self) -> None:
        for client in self._clients:
            await client.aclose()
        await self._running.stop()


async def start_test_application() -> TestApplication:
    app = await create_application(Settings.for_tests())
    return TestApplication(await app.start())
