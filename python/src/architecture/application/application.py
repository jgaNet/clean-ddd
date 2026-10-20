"""Application: registers modules and starts them against one event bus. The composition root
builds one, sets the bus, registers the modules, starts them, seeds, and only then listens; the
transport (FastAPI, uvicorn) is the composition root's, not this class's."""

from architecture.application.event_bus import EventBus
from architecture.application.module import Module


class Application:
    def __init__(self, event_bus: EventBus) -> None:
        self._event_bus = event_bus
        self._modules: dict[str, Module] = {}

    @property
    def event_bus(self) -> EventBus:
        return self._event_bus

    def register_module(self, module: Module) -> "Application":
        self._modules[module.name] = module
        return self

    def get_module(self, name: str) -> Module:
        if name not in self._modules:
            raise LookupError(f"Module {name} not found")
        return self._modules[name]

    async def start_modules(self) -> None:
        """Subscribes every module's handlers to the bus. Awaited, so nothing is served before they listen."""
        for module in self._modules.values():
            await module.start(self._event_bus)
