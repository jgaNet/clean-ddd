"""How an end-to-end suite boots the application: in this process, on a free port, with fresh
in-memory stores, spoken to over HTTP as a client would, and stopped afterwards. A context's suite
sits beside this one, as ``test_<context>_routes_e2e.py``."""

import httpx

from .create_application import create_application

UNKNOWN = "00000000-0000-4000-8000-000000000000"


async def test_serves_the_tracker_under_the_prefix_to_an_anonymous_caller_with_the_trace_of_the_request() -> None:
    app = await create_application(port=0)
    running = await app.start()
    api = f"{running.address}/{app.api_prefix}"
    trace_id = "11111111-1111-4111-8111-111111111111"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{api}/tracker/operations/{UNKNOWN}", headers={"x-trace-id": trace_id})

            # An operation is followed by whoever started it; nobody started this one, and an
            # anonymous caller is told to sign in rather than whether it exists.
            assert response.status_code == 403
            assert list(response.json()) == ["message"]
            assert response.headers["x-trace-id"] == trace_id

            # Listing operations is an administrator's view.
            assert (await client.get(f"{api}/tracker/operations")).status_code == 403
    finally:
        await running.stop()
