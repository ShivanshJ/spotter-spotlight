from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PageAction(_Model):
    name: str
    description: str
    selector: str


class Route(_Model):
    path: str
    description: str
    title: str | None = None
    reachable_from: list[str] | None = None
    actions: list[PageAction] | None = None
    selectors: dict[str, str] = Field(default_factory=dict)
    role: str | None = None


class Action(_Model):
    intent: str
    type: Literal["api"]
    endpoint: str
    auth: Literal["session"]
    role: str | None = None


class MCPServer(_Model):
    url: str
    allowed_tools: list[str] | None = None


class SpotterConfig(_Model):
    version: Literal["1"]
    routes: list[Route]
    actions: list[Action]
    mcp_servers: list[MCPServer] = Field(default_factory=list)


class SpotterQuery(_Model):
    query: str
    url: str
    session_token: str | None = None
    role: str | None = None
