"""The composition root: the one place that knows every context, every route and the transport.
``create_application()`` builds the whole application, wired, started, seeded, ready to listen;
``python -m bootstrap`` serves it; the end-to-end tests beside it boot the same application on
a free port and speak HTTP to it through ``testing.py``. Nothing here is business."""
