"""Hashing is a technical concern with a business meaning ("is this the right password?"). The
port keeps the algorithm out of the domain and the application layer; the infrastructure
provides it (BcryptPasswordHasher), tests provide a fake."""

from typing import Protocol


class PasswordHasher(Protocol):
    async def hash(self, plain: str) -> str: ...

    async def compare(self, plain: str, hash: str) -> bool: ...
