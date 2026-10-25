from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.security.domain.account.dtos import AccountSnapshot
from contexts.security.domain.account.ports.account_queries import AccountDetail


class InMemoryAccountQueries:
    def __init__(self, data_source: InMemoryDataSource[AccountSnapshot]) -> None:
        self._data_source = data_source

    async def find_by_id(self, id: str) -> AccountDetail | None:
        account = self._data_source.collection.get(id)
        if account is None:
            return None
        # The read model deliberately leaves the credentials behind.
        return AccountDetail(
            id=account.id,
            email=account.email,
            role=account.role,
            status=account.status,
            last_authenticated_at=account.last_authenticated_at,
        )
