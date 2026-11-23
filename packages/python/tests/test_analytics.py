import logging
import threading

from spotter_sdk.analytics import emit_event

EVENT = {"type": "query", "query": "q", "responseType": "unhandled", "url": "https://app.com"}


async def test_runs_sync_handlers_off_the_event_loop():
    loop_thread = threading.get_ident()
    seen = []

    def handler(event):
        seen.append(threading.get_ident())

    await emit_event(handler, EVENT)
    assert len(seen) == 1
    assert seen[0] != loop_thread


async def test_awaits_async_handlers_inline():
    loop_thread = threading.get_ident()
    seen = []

    async def handler(event):
        seen.append((threading.get_ident(), event))

    await emit_event(handler, EVENT)
    assert seen == [(loop_thread, EVENT)]


async def test_awaits_awaitables_returned_by_sync_handlers():
    done = []

    async def inner():
        done.append(True)

    def handler(event):
        return inner()

    await emit_event(handler, EVENT)
    assert done == [True]


async def test_logs_and_swallows_sync_handler_failures(caplog):
    def handler(event):
        raise RuntimeError("disk full")

    with caplog.at_level(logging.ERROR, logger="spotter_sdk"):
        await emit_event(handler, EVENT)
    assert any(r.getMessage() == "spotter analytics handler failed" for r in caplog.records)


async def test_logs_and_swallows_async_handler_failures(caplog):
    async def handler(event):
        raise RuntimeError("disk full")

    with caplog.at_level(logging.ERROR, logger="spotter_sdk"):
        await emit_event(handler, EVENT)
    assert any(r.getMessage() == "spotter analytics handler failed" for r in caplog.records)
