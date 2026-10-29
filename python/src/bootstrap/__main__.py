"""The process entry point (``uv run python -m bootstrap``): build the application and serve it,
on the port its composition reads (``PORT``). It reads no settings of its own, so a new
application gets it as it is; everything else is in ``create_application.py``, so that the tests
can build the same application without listening here."""

import asyncio
import sys

from architecture.infrastructure.console_logger import ConsoleLogger
from bootstrap.create_application import create_application


async def main() -> int:
    try:
        running = await (await create_application()).start()
        await running.wait()
    except Exception as error:
        ConsoleLogger(debug=False).error("The application could not start", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
