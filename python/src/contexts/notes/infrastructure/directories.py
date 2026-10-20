"""Notes' view of Security's accounts: an adapter over Security's *read model*, never its
aggregate or repository. Only the Notes infrastructure knows the two contexts are in the same
process; the domain and application layers of Notes see AccountDirectory alone. In separate
deployments this file would call Security's API and nothing above it would change."""

from contexts.security.domain.account.account_status import AccountStatus
from contexts.security.domain.account.ports.account_queries import AccountQueries


class SecurityAccountDirectory:
    def __init__(self, accounts: AccountQueries) -> None:
        self._accounts = accounts

    async def exists(self, account_id: str) -> bool:
        account = await self._accounts.find_by_id(account_id)
        return account is not None and account.status is AccountStatus.ACTIVE
