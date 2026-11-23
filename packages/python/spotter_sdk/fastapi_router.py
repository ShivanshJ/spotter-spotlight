from typing import Any

from fastapi import APIRouter

from .proxy import Handler
from .types import SpotterQuery


def create_spotter_router(handle: Handler, path: str = "/api/spotter") -> APIRouter:
    router = APIRouter()

    @router.post(path)
    async def spotter(body: SpotterQuery) -> dict[str, Any]:
        return await handle(body)

    return router
