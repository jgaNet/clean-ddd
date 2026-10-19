"""The published contract of the Security context: what other contexts may know about accounts."""

from dataclasses import dataclass

from architecture.domain.event import IntegrationEvent


@dataclass(frozen=True)
class AccountCreatedIntegrationEvent(IntegrationEvent):
    account_id: str
    email: str
    validation_token: str


@dataclass(frozen=True)
class AccountValidatedIntegrationEvent(IntegrationEvent):
    account_id: str
    email: str
