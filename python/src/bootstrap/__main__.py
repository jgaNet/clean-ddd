"""The process entry point (``uv run python -m bootstrap``): build the application and serve
it. Everything else is in ``create_application.py``, so that the tests can build the same
application without listening here."""

import asyncio
import sys

from architecture.infrastructure.console_logger import ConsoleLogger
from bootstrap.create_application import create_application
from bootstrap.settings import Settings


async def main() -> int:
    settings = Settings.from_env()
    logger = ConsoleLogger(debug=settings.debug)
    try:
        running = await (await create_application(settings, logger)).start()
        await running.wait()
    except Exception as error:
        logger.error("The application could not start", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
