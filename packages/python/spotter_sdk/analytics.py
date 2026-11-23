import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable
from typing import Literal

from typing_extensions import NotRequired, TypedDict

_logger = logging.getLogger("spotter_sdk")


class SpotterEvent(TypedDict):
    type: Literal["query"]
    query: str
    responseType: Literal["navigate", "answer", "unhandled", "error"]
    url: str
    role: NotRequired[str]


AnalyticsHandler = Callable[[SpotterEvent], Awaitable[None] | None]


def noop_analytics(event: SpotterEvent) -> None:
    return None


async def emit_event(handler: AnalyticsHandler, event: SpotterEvent) -> None:
    try:
        if inspect.iscoroutinefunction(handler):
            await handler(event)
            return
        outcome = await asyncio.to_thread(handler, event)
        if inspect.isawaitable(outcome):
            await outcome
    except Exception:
        _logger.exception("spotter analytics handler failed")
