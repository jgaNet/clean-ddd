"""The PasswordHasher port on bcrypt. Hashing is CPU-bound and synchronous, so it runs in a
thread: the loop keeps serving while a password is checked."""

import asyncio

import bcrypt


class BcryptPasswordHasher:
    def __init__(self, rounds: int = 10) -> None:
        self._rounds = rounds

    async def hash(self, plain: str) -> str:
        return await asyncio.to_thread(lambda: bcrypt.hashpw(plain.encode(), bcrypt.gensalt(self._rounds)).decode())

    async def compare(self, plain: str, hash: str) -> bool:  # noqa: A002
        return await asyncio.to_thread(lambda: bcrypt.checkpw(plain.encode(), hash.encode()))
