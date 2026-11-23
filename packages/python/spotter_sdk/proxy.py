import asyncio
import inspect
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

from .analytics import AnalyticsHandler, SpotterEvent, noop_analytics
from .llm_client import DEFAULT_MODEL, LLMConfig, create_llm_client, route_query
from .navigate_steps import build_navigate_steps
from .site_map import find_action_by_intent, find_route_by_path, load_config, summarize_config
from .types import SpotterConfig, SpotterQuery

ConfigSource = str | os.PathLike[str] | dict[str, Any] | SpotterConfig
Handler = Callable[[dict[str, Any] | SpotterQuery], Awaitable[dict[str, Any]]]

_logger = logging.getLogger("spotter_sdk")


async def _resolve_config(source: ConfigSource) -> SpotterConfig:
    if isinstance(source, SpotterConfig):
        return source
    if isinstance(source, dict):
        return SpotterConfig.model_validate(source)
    return await asyncio.to_thread(load_config, source)


def _unhandled(query: str) -> dict[str, Any]:
    return {"type": "unhandled", "query": query}


def _navigate_response(config: SpotterConfig, query: str, result: dict[str, Any]) -> dict[str, Any]:
    route = find_route_by_path(config, result.get("routePath"))
    if route is None:
        return _unhandled(query)
    return {"type": "navigate", "steps": build_navigate_steps(config, route, result.get("actionName"))}


def _action_response(config: SpotterConfig, query: str, result: dict[str, Any]) -> dict[str, Any]:
    action = find_action_by_intent(config, result.get("actionIntent"))
    if action is None:
        return _unhandled(query)
    return {"type": "answer", "content": f"Action available but not enabled on this plan: {action.endpoint}"}


def _build_response(config: SpotterConfig, query: str, result: dict[str, Any]) -> dict[str, Any]:
    kind = result.get("type")
    if kind == "navigate":
        return _navigate_response(config, query, result)
    if kind == "action":
        return _action_response(config, query, result)
    return _unhandled(query)


async def _emit(handler: AnalyticsHandler, event: SpotterEvent) -> None:
    try:
        outcome = handler(event)
        if inspect.isawaitable(outcome):
            await outcome
    except Exception:
        _logger.exception("spotter analytics handler failed")


def create_spotter_proxy(
    *,
    config: ConfigSource,
    llm: LLMConfig,
    on_analytics: AnalyticsHandler | None = None,
) -> Handler:
    client = create_llm_client(llm)
    analytics = on_analytics or noop_analytics
    model = llm.model or DEFAULT_MODEL

    async def handle(query: dict[str, Any] | SpotterQuery) -> dict[str, Any]:
        try:
            request = SpotterQuery.model_validate(query)
            resolved = await _resolve_config(config)
            result = await route_query(client, request.query, summarize_config(resolved), model)
            response = _build_response(resolved, request.query, result)
            await _emit(
                analytics,
                {
                    "type": "query",
                    "query": request.query,
                    "responseType": response["type"],
                    "url": request.url,
                    "role": request.role,
                },
            )
            return response
        except Exception as error:
            return {"type": "error", "message": str(error) or "Unknown error"}

    return handle
