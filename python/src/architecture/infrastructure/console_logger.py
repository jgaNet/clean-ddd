"""The Logger port on the standard ``logging`` module. Each line starts with the trace id when
the meta carries one, so the lines of one request can be grepped together; the rest of the meta
is printed after the message. The only place in the project that writes to the console."""

import logging

from architecture.application.execution_context import Meta

NO_TRACE = "*" * 36


class ConsoleLogger:
    def __init__(self, *, debug: bool, name: str = "clean-ddd") -> None:
        self._logger = logging.getLogger(name)
        self._logger.setLevel(logging.DEBUG if debug else logging.INFO)
        if not self._logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter("%(levelname)-5s %(message)s"))
            self._logger.addHandler(handler)

    def info(self, message: str, meta: Meta | None = None) -> None:
        self._logger.info(self._line(message, meta))

    def warn(self, message: str, meta: Meta | None = None) -> None:
        self._logger.warning(self._line(message, meta))

    def error(self, message: str, error: object = None, meta: Meta | None = None) -> None:
        self._logger.error(self._line(message, meta) + (f" {error!r}" if error is not None else ""))

    def debug(self, message: str, meta: Meta | None = None) -> None:
        self._logger.debug(self._line(message, meta))

    @staticmethod
    def _line(message: str, meta: Meta | None) -> str:
        rest = dict(meta or {})
        trace = rest.pop("traceId", None)
        text = f"[{trace if isinstance(trace, str) else NO_TRACE}] {message}"
        return f"{text} {rest}" if rest else text
