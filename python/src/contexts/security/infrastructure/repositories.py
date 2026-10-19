from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.security.domain.account.account import Account
from contexts.security.domain.account.dtos import AccountSnapshot


class InMemoryAccountRepository:
    def __init__(self, data_source: InMemoryDataSource[AccountSnapshot]) -> None:
        self._data_source = data_source

    async def find_by_id(self, id: str) -> Account | None:  # noqa: A002
        snapshot = self._data_source.collection.get(id)
        return Account.from_snapshot(snapshot) if snapshot else None

    async def find_by_email(self, email: str) -> Account | None:
        wanted = email.strip().lower()
        snapshot = next((a for a in self._data_source.collection.values() if a.email == wanted), None)
        return Account.from_snapshot(snapshot) if snapshot else None

    async def save(self, account: Account) -> None:
        self._data_source.collection[account.id.value] = account.to_snapshot()
