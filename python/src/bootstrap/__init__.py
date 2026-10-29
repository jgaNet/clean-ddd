"""The composition root and the transport it is served on. ``fastapi_application.py`` is the
transport, which names no context; ``create_application()`` builds the application on it, wired,
started, ready to listen; ``python -m bootstrap`` serves it; the end-to-end tests beside it boot the
same application on a free port and speak HTTP to it. Nothing here is business."""
