from collections.abc import Awaitable, Callable
from typing import Literal

from typing_extensions import NotRequired, TypedDict


class SpotterEvent(TypedDict):
    type: Literal["query"]
    query: str
    responseType: Literal["navigate", "answer", "unhandled", "error"]
    url: str
    role: NotRequired[str | None]


AnalyticsHandler = Callable[[SpotterEvent], Awaitable[None] | None]


def noop_analytics(event: SpotterEvent) -> None:
    return None
