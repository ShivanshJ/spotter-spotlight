# Spotter Python SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** `docs/superpowers/plans/2026-11-22-spotter-graph-format-v1-1.md` must be fully executed first. This plan reads the `/conformance` fixtures that plan creates (`config.json`, `summary.txt`, `routing-prompt.txt`, `navigate-cases.json`).

**Goal:** Ship `pip install spotter-sdk`: a Python implementation of the Spotter proxy (config loading, site-map summary, LLM routing, navigate-step building, analytics hook) with a FastAPI adapter, so Python backends can serve the Spotter widget with no Node sidecar.

**Architecture:** A `spotter_sdk` package under `packages/python/` mirroring the TypeScript proxy module-for-module (`types`, `site_map`, `navigate_steps`, `llm_client`, `analytics`, `proxy`) plus a thin `fastapi_router`. Framework-agnostic core: `create_spotter_proxy(...)` returns `async handle(query) -> dict`; the FastAPI router only adapts HTTP to that function. Behavioural parity with the TS SDK is enforced by running the shared `/conformance` fixtures in the Python test suite. Project analysis (`spotter analyze`) stays in the npm CLI; Python users run it with `npx`.

**Tech Stack:** Python >=3.10, pydantic v2, openai (AsyncOpenAI), FastAPI (optional extra), pytest, pytest-asyncio, httpx.

**Principles:** one responsibility per module, plain functions, no comments inside functions, dataclass/pydantic for data, no inheritance beyond the pydantic base.

---

## File Map

All paths under `packages/python/` unless noted.

| File | Status | Responsibility |
|---|---|---|
| `pyproject.toml` | Create | Package metadata, deps, extras, pytest config |
| `spotter_sdk/__init__.py` | Create | Public exports |
| `spotter_sdk/types.py` | Create | Pydantic models (camelCase JSON aliases) |
| `spotter_sdk/site_map.py` | Create | `load_config`, `summarize_config`, `find_route_by_path`, `find_action_by_intent` |
| `spotter_sdk/navigate_steps.py` | Create | `build_navigate_steps` |
| `spotter_sdk/llm_client.py` | Create | `LLMConfig`, `build_routing_prompt`, `create_llm_client`, `route_query` |
| `spotter_sdk/analytics.py` | Create | `SpotterEvent`, `AnalyticsHandler`, `noop_analytics` |
| `spotter_sdk/proxy.py` | Create | `create_spotter_proxy` |
| `spotter_sdk/fastapi_router.py` | Create | `create_spotter_router` |
| `tests/helpers.py` | Create | Conformance fixture readers |
| `tests/conftest.py` | Create | `conformance_config` fixture |
| `tests/test_types.py` | Create | Model parsing tests |
| `tests/test_site_map.py` | Create | Summary conformance + lookups + load_config |
| `tests/test_navigate_steps.py` | Create | Conformance + edge cases |
| `tests/test_llm_client.py` | Create | Prompt conformance + route_query behaviour |
| `tests/test_proxy.py` | Create | End-to-end handler tests with `route_query` patched |
| `tests/test_fastapi_router.py` | Create | HTTP-level test with TestClient |
| `README.md` | Create | Package README |
| `/.gitignore` | Modify | Ignore Python build artefacts |
| `/README.md` | Modify | "Python backends" section |

---

### Task 1: Package scaffold + types

**Files:**
- Create: `packages/python/pyproject.toml`
- Create: `packages/python/spotter_sdk/__init__.py`
- Create: `packages/python/spotter_sdk/types.py`
- Create: `packages/python/tests/__init__.py` (empty)
- Create: `packages/python/tests/test_types.py`
- Modify: `.gitignore`

- [ ] **Step 1: Create `packages/python/pyproject.toml`**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "spotter-sdk"
version = "0.0.2"
description = "Natural-language navigation for any web app: Python backend SDK for Spotter"
readme = "README.md"
requires-python = ">=3.10"
license = { text = "ISC" }
dependencies = [
  "openai>=1.40",
  "pydantic>=2.6",
]

[project.optional-dependencies]
fastapi = ["fastapi>=0.110"]
dev = [
  "pytest>=8",
  "pytest-asyncio>=0.23",
  "httpx>=0.27",
  "fastapi>=0.110",
]

[tool.hatch.build.targets.wheel]
packages = ["spotter_sdk"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Append to the repo-root `.gitignore`**

```
packages/python/.venv
__pycache__/
*.egg-info/
.pytest_cache/
```

- [ ] **Step 3: Create the virtualenv and install**

Run:
```bash
cd packages/python && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
```
Expected: installs without error. (Create a placeholder `README.md` containing `# spotter-sdk` first if hatchling complains about the missing readme; it is replaced in Task 8.)

Create empty `spotter_sdk/__init__.py` and `tests/__init__.py` before installing.

- [ ] **Step 4: Write failing tests `packages/python/tests/test_types.py`**

```python
import pytest
from pydantic import ValidationError

from spotter_sdk.types import SpotterConfig, SpotterQuery

BASE = {"version": "1", "baseUrl": "https://app.com", "actions": [], "mcpServers": []}


def test_parses_route_with_page_actions_and_reachability():
    config = SpotterConfig.model_validate(
        {
            **BASE,
            "routes": [
                {
                    "path": "/settings/billing",
                    "description": "Manage subscription",
                    "title": "Billing",
                    "reachableFrom": ["/settings"],
                    "actions": [
                        {"name": "change_plan", "description": "Change plan", "selector": "[data-testid=x]"}
                    ],
                }
            ],
        }
    )
    route = config.routes[0]
    assert route.title == "Billing"
    assert route.reachable_from == ["/settings"]
    assert route.actions[0].name == "change_plan"


def test_v1_0_route_defaults():
    config = SpotterConfig.model_validate(
        {**BASE, "routes": [{"path": "/rewards", "description": "Points"}]}
    )
    route = config.routes[0]
    assert route.actions is None
    assert route.reachable_from is None
    assert route.selectors == {}


def test_rejects_page_action_without_selector():
    with pytest.raises(ValidationError):
        SpotterConfig.model_validate(
            {**BASE, "routes": [{"path": "/x", "description": "X", "actions": [{"name": "a", "description": "A"}]}]}
        )


def test_rejects_unknown_version():
    with pytest.raises(ValidationError):
        SpotterConfig.model_validate({**BASE, "version": "2", "routes": []})


def test_query_accepts_camel_case_session_token():
    query = SpotterQuery.model_validate({"query": "q", "url": "https://app.com", "sessionToken": "t"})
    assert query.session_token == "t"
    assert query.role is None
```

- [ ] **Step 5: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_types.py -v`
Expected: FAIL — `ModuleNotFoundError: spotter_sdk.types`.

- [ ] **Step 6: Create `packages/python/spotter_sdk/types.py`**

```python
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
    base_url: str
    routes: list[Route]
    actions: list[Action]
    mcp_servers: list[MCPServer] = Field(default_factory=list)


class SpotterQuery(_Model):
    query: str
    url: str
    session_token: str | None = None
    role: str | None = None
```

- [ ] **Step 7: Run tests**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add .gitignore packages/python/pyproject.toml packages/python/spotter_sdk packages/python/tests packages/python/README.md
git commit -m "feat(python): scaffold spotter-sdk package with pydantic config models"
```

---

### Task 2: Conformance test helpers + site_map

**Files:**
- Create: `packages/python/tests/helpers.py`
- Create: `packages/python/tests/conftest.py`
- Create: `packages/python/spotter_sdk/site_map.py`
- Create: `packages/python/tests/test_site_map.py`

- [ ] **Step 1: Create `packages/python/tests/helpers.py`**

```python
import json
from pathlib import Path
from typing import Any

CONFORMANCE_DIR = Path(__file__).resolve().parents[3] / "conformance"


def read_conformance_text(name: str) -> str:
    return (CONFORMANCE_DIR / name).read_text(encoding="utf-8").strip()


def read_conformance_json(name: str) -> Any:
    return json.loads(read_conformance_text(name))
```

- [ ] **Step 2: Create `packages/python/tests/conftest.py`**

```python
import pytest

from spotter_sdk.types import SpotterConfig
from tests.helpers import read_conformance_json


@pytest.fixture
def conformance_config() -> SpotterConfig:
    return SpotterConfig.model_validate(read_conformance_json("config.json"))
```

- [ ] **Step 3: Write failing tests `packages/python/tests/test_site_map.py`**

```python
from spotter_sdk.site_map import (
    find_action_by_intent,
    find_route_by_path,
    load_config,
    summarize_config,
)
from spotter_sdk.types import SpotterConfig
from tests.helpers import CONFORMANCE_DIR, read_conformance_text


def test_summary_matches_conformance_fixture(conformance_config):
    assert summarize_config(conformance_config) == read_conformance_text("summary.txt")


def test_summary_appends_role_after_reachability():
    config = SpotterConfig.model_validate(
        {
            "version": "1",
            "baseUrl": "https://app.com",
            "actions": [],
            "routes": [
                {"path": "/admin/users", "description": "Users", "reachableFrom": ["/admin"], "role": "admin"}
            ],
        }
    )
    assert '"Users" [reachable from: /admin] [role: admin]' in summarize_config(config)


def test_summary_of_empty_config():
    config = SpotterConfig.model_validate(
        {"version": "1", "baseUrl": "https://app.com", "actions": [], "routes": []}
    )
    assert summarize_config(config) == "Routes:\n  (none)\n\nActions:\n  (none)"


def test_find_route_by_path(conformance_config):
    assert find_route_by_path(conformance_config, "/rewards").path == "/rewards"
    assert find_route_by_path(conformance_config, "/nope") is None


def test_find_action_by_intent(conformance_config):
    assert find_action_by_intent(conformance_config, "get user points balance").endpoint == "GET /api/user/rewards"
    assert find_action_by_intent(conformance_config, "nope") is None


def test_load_config_reads_a_file(conformance_config):
    loaded = load_config(CONFORMANCE_DIR / "config.json")
    assert loaded == conformance_config
```

- [ ] **Step 4: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_site_map.py -v`
Expected: FAIL — `ModuleNotFoundError: spotter_sdk.site_map`.

- [ ] **Step 5: Create `packages/python/spotter_sdk/site_map.py`**

```python
import os
from pathlib import Path

from .types import Action, Route, SpotterConfig


def load_config(path: str | os.PathLike[str]) -> SpotterConfig:
    return SpotterConfig.model_validate_json(Path(path).read_text(encoding="utf-8"))


def _route_lines(route: Route) -> list[str]:
    reachable = f" [reachable from: {', '.join(route.reachable_from)}]" if route.reachable_from else ""
    role = f" [role: {route.role}]" if route.role else ""
    page_actions = [f"      action {a.name}: {a.description}" for a in route.actions or []]
    return [f'  - {route.path}: "{route.description}"{reachable}{role}', *page_actions]


def _action_line(action: Action) -> str:
    role = f" [role: {action.role}]" if action.role else ""
    return f'  - "{action.intent}" → {action.endpoint}{role}'


def summarize_config(config: SpotterConfig) -> str:
    routes = "\n".join(line for route in config.routes for line in _route_lines(route))
    actions = "\n".join(_action_line(action) for action in config.actions)
    return f"Routes:\n{routes or '  (none)'}\n\nActions:\n{actions or '  (none)'}"


def find_route_by_path(config: SpotterConfig, path: str | None) -> Route | None:
    return next((route for route in config.routes if route.path == path), None)


def find_action_by_intent(config: SpotterConfig, intent: str | None) -> Action | None:
    return next((action for action in config.actions if action.intent == intent), None)
```

- [ ] **Step 6: Run tests**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/python/spotter_sdk/site_map.py packages/python/tests
git commit -m "feat(python): add site map summary and lookups, verified against conformance fixtures"
```

---

### Task 3: build_navigate_steps

**Files:**
- Create: `packages/python/spotter_sdk/navigate_steps.py`
- Create: `packages/python/tests/test_navigate_steps.py`

- [ ] **Step 1: Write failing tests `packages/python/tests/test_navigate_steps.py`**

```python
import pytest

from spotter_sdk.navigate_steps import build_navigate_steps
from spotter_sdk.site_map import find_route_by_path
from spotter_sdk.types import Route
from tests.helpers import read_conformance_json

CASES = read_conformance_json("navigate-cases.json")


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_matches_conformance_case(conformance_config, case):
    route = find_route_by_path(conformance_config, case["routePath"])
    steps = build_navigate_steps(conformance_config, route, case.get("actionName"))
    assert steps == case["expectedSteps"]


def test_skips_parent_step_when_parent_route_is_missing(conformance_config):
    route = Route(path="/a/b", description="B", reachable_from=["/missing"])
    config = conformance_config.model_copy(update={"routes": [route]})
    steps = build_navigate_steps(config, route)
    assert [step["selector"] for step in steps] == ['a[href="/a/b"]']
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_navigate_steps.py -v`
Expected: FAIL — `ModuleNotFoundError: spotter_sdk.navigate_steps`.

- [ ] **Step 3: Create `packages/python/spotter_sdk/navigate_steps.py`**

```python
from typing import Any

from .site_map import find_route_by_path
from .types import Route, SpotterConfig

Step = dict[str, Any]


def _link_step(route: Route) -> Step:
    return {
        "selector": f'a[href="{route.path}"]',
        "description": f"Navigate to {route.path} — {route.description}",
        "interactionType": "click",
    }


def _selector_steps(route: Route) -> list[Step]:
    return [
        {
            "selector": selector,
            "description": f"{route.description} — {key}",
            "interactionType": "click",
        }
        for key, selector in route.selectors.items()
    ]


def _parent_steps(config: SpotterConfig, route: Route) -> list[Step]:
    candidates = (find_route_by_path(config, path) for path in route.reachable_from or [])
    parent = next((candidate for candidate in candidates if candidate is not None), None)
    return [_link_step(parent)] if parent else []


def build_navigate_steps(config: SpotterConfig, route: Route, action_name: str | None = None) -> list[Step]:
    page_action = next((action for action in route.actions or [] if action.name == action_name), None)
    if page_action:
        return [
            *_parent_steps(config, route),
            _link_step(route),
            {"selector": page_action.selector, "description": page_action.description, "interactionType": "click"},
        ]

    legacy_steps = _selector_steps(route)
    if legacy_steps:
        return legacy_steps

    return [*_parent_steps(config, route), _link_step(route)]
```

- [ ] **Step 4: Run tests**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/python/spotter_sdk/navigate_steps.py packages/python/tests/test_navigate_steps.py
git commit -m "feat(python): add build_navigate_steps, verified against conformance cases"
```

---

### Task 4: LLM client

**Files:**
- Create: `packages/python/spotter_sdk/llm_client.py`
- Create: `packages/python/tests/test_llm_client.py`

- [ ] **Step 1: Write failing tests `packages/python/tests/test_llm_client.py`**

```python
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from spotter_sdk.llm_client import (
    DEFAULT_MODEL,
    LLMConfig,
    build_routing_prompt,
    create_llm_client,
    route_query,
)
from spotter_sdk.site_map import summarize_config
from tests.helpers import read_conformance_text


def make_client(content):
    message = SimpleNamespace(content=content)
    response = SimpleNamespace(choices=[SimpleNamespace(message=message)])
    create = AsyncMock(return_value=response)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return client, create


def test_routing_prompt_matches_conformance_fixture(conformance_config):
    prompt = build_routing_prompt(summarize_config(conformance_config))
    assert prompt == read_conformance_text("routing-prompt.txt")


async def test_returns_navigate_result():
    client, _ = make_client(json.dumps({"type": "navigate", "routePath": "/rewards"}))
    assert await route_query(client, "show points", "Routes:\n  (none)") == {
        "type": "navigate",
        "routePath": "/rewards",
    }


async def test_passes_action_name_through():
    payload = {"type": "navigate", "routePath": "/settings/billing", "actionName": "change_plan"}
    client, _ = make_client(json.dumps(payload))
    assert await route_query(client, "change my plan", "Routes:\n  (none)") == payload


async def test_sends_prompt_query_model_and_json_mode():
    client, create = make_client(json.dumps({"type": "general"}))
    await route_query(client, "hello", "Routes:\n  (none)", "custom-model")
    kwargs = create.call_args.kwargs
    assert kwargs["model"] == "custom-model"
    assert kwargs["response_format"] == {"type": "json_object"}
    assert kwargs["messages"][0]["content"] == build_routing_prompt("Routes:\n  (none)")
    assert kwargs["messages"][1] == {"role": "user", "content": "hello"}


async def test_uses_default_model():
    client, create = make_client(json.dumps({"type": "general"}))
    await route_query(client, "hello", "Routes:\n  (none)")
    assert create.call_args.kwargs["model"] == DEFAULT_MODEL


async def test_falls_back_to_general_on_empty_content():
    client, _ = make_client(None)
    assert await route_query(client, "q", "s") == {"type": "general"}


async def test_falls_back_to_general_on_invalid_json():
    client, _ = make_client("not json")
    assert await route_query(client, "q", "s") == {"type": "general"}


async def test_falls_back_to_general_when_json_is_not_an_object():
    client, _ = make_client(json.dumps(["navigate"]))
    assert await route_query(client, "q", "s") == {"type": "general"}


async def test_falls_back_to_general_when_the_call_raises():
    client, create = make_client("{}")
    create.side_effect = RuntimeError("network failure")
    assert await route_query(client, "q", "s") == {"type": "general"}


def test_create_llm_client_passes_base_url():
    client = create_llm_client(LLMConfig(api_key="k", base_url="https://openrouter.ai/api/v1"))
    assert str(client.base_url).startswith("https://openrouter.ai/api/v1")
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_llm_client.py -v`
Expected: FAIL — `ModuleNotFoundError: spotter_sdk.llm_client`.

- [ ] **Step 3: Create `packages/python/spotter_sdk/llm_client.py`**

```python
import json
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

DEFAULT_MODEL = "gpt-4o-mini"

_ROUTING_PROMPT_HEADER = """You are a navigation classifier for a web application.
Given a user query and the app's site map, determine:
1. Is this a UI navigation or action request?
2. If navigate: which route path best matches, and which page action (if any) the user wants to perform there?
3. If action: which action intent best matches?

Return one of:
- {"type":"navigate","routePath":"/exact/path"}
- {"type":"navigate","routePath":"/exact/path","actionName":"exact page action name"}
- {"type":"action","actionIntent":"exact intent string"}
- {"type":"general"}

Only return "navigate" or "action" if there is a clear match. When unsure, return "general".

Site map:
"""

_GENERAL: dict[str, Any] = {"type": "general"}


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str | None = None
    model: str | None = None


def build_routing_prompt(site_map_summary: str) -> str:
    return _ROUTING_PROMPT_HEADER + site_map_summary


def create_llm_client(config: LLMConfig) -> AsyncOpenAI:
    return AsyncOpenAI(api_key=config.api_key, base_url=config.base_url)


async def route_query(
    client: AsyncOpenAI,
    query: str,
    site_map_summary: str,
    model: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    try:
        response = await client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": build_routing_prompt(site_map_summary)},
                {"role": "user", "content": query},
            ],
        )
        content = response.choices[0].message.content
        if not content:
            return dict(_GENERAL)
        result = json.loads(content)
        return result if isinstance(result, dict) else dict(_GENERAL)
    except Exception:
        return dict(_GENERAL)
```

- [ ] **Step 4: Run tests**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: all pass. If `test_create_llm_client_passes_base_url` fails because the OpenAI client normalises the URL differently, assert on `client.base_url.host == "openrouter.ai"` instead.

- [ ] **Step 5: Commit**

```bash
git add packages/python/spotter_sdk/llm_client.py packages/python/tests/test_llm_client.py
git commit -m "feat(python): add OpenAI-compatible LLM routing client, verified against conformance prompt"
```

---

### Task 5: Analytics + proxy core

**Files:**
- Create: `packages/python/spotter_sdk/analytics.py`
- Create: `packages/python/spotter_sdk/proxy.py`
- Create: `packages/python/tests/test_proxy.py`

- [ ] **Step 1: Write failing tests `packages/python/tests/test_proxy.py`**

```python
import json

from spotter_sdk import proxy as proxy_module
from spotter_sdk.llm_client import LLMConfig
from spotter_sdk.proxy import create_spotter_proxy
from tests.helpers import CONFORMANCE_DIR, read_conformance_json

LLM = LLMConfig(api_key="test")
QUERY = {"query": "change my plan", "url": "https://app.com/home"}


def route_returns(monkeypatch, result):
    async def fake_route_query(client, query, summary, model):
        return result

    monkeypatch.setattr(proxy_module, "route_query", fake_route_query)


async def test_returns_page_action_steps(monkeypatch):
    route_returns(
        monkeypatch,
        {"type": "navigate", "routePath": "/settings/billing", "actionName": "change_plan"},
    )
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    response = await handle(QUERY)
    assert response["type"] == "navigate"
    assert [step["selector"] for step in response["steps"]] == [
        'a[href="/settings"]',
        'a[href="/settings/billing"]',
        '[data-testid="change-plan"]',
    ]


async def test_returns_unhandled_for_unknown_route(monkeypatch):
    route_returns(monkeypatch, {"type": "navigate", "routePath": "/nope"})
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    assert await handle(QUERY) == {"type": "unhandled", "query": QUERY["query"]}


async def test_returns_unhandled_for_general(monkeypatch):
    route_returns(monkeypatch, {"type": "general"})
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    assert (await handle(QUERY))["type"] == "unhandled"


async def test_returns_answer_for_known_action(monkeypatch):
    route_returns(monkeypatch, {"type": "action", "actionIntent": "get user points balance"})
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    response = await handle(QUERY)
    assert response["type"] == "answer"
    assert "GET /api/user/rewards" in response["content"]


async def test_returns_unhandled_for_unknown_action(monkeypatch):
    route_returns(monkeypatch, {"type": "action", "actionIntent": "nope"})
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    assert (await handle(QUERY))["type"] == "unhandled"


async def test_loads_config_from_a_path(monkeypatch):
    route_returns(monkeypatch, {"type": "navigate", "routePath": "/rewards"})
    handle = create_spotter_proxy(config=CONFORMANCE_DIR / "config.json", llm=LLM)
    assert (await handle(QUERY))["type"] == "navigate"


async def test_loads_config_from_a_string_path(monkeypatch):
    route_returns(monkeypatch, {"type": "navigate", "routePath": "/rewards"})
    handle = create_spotter_proxy(config=str(CONFORMANCE_DIR / "config.json"), llm=LLM)
    assert (await handle(QUERY))["type"] == "navigate"


async def test_returns_error_when_routing_raises(monkeypatch):
    async def boom(client, query, summary, model):
        raise RuntimeError("network failure")

    monkeypatch.setattr(proxy_module, "route_query", boom)
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    assert await handle(QUERY) == {"type": "error", "message": "network failure"}


async def test_returns_error_for_invalid_query():
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    response = await handle({"url": "https://app.com"})
    assert response["type"] == "error"


async def test_returns_error_for_missing_config_file():
    handle = create_spotter_proxy(config="/does/not/exist.json", llm=LLM)
    assert (await handle(QUERY))["type"] == "error"


async def test_passes_the_configured_model_to_routing(monkeypatch):
    seen = {}

    async def spy(client, query, summary, model):
        seen["model"] = model
        return {"type": "general"}

    monkeypatch.setattr(proxy_module, "route_query", spy)
    handle = create_spotter_proxy(
        config=read_conformance_json("config.json"),
        llm=LLMConfig(api_key="k", model="anthropic/claude-sonnet-4"),
    )
    await handle(QUERY)
    assert seen["model"] == "anthropic/claude-sonnet-4"


async def test_emits_analytics_event(monkeypatch):
    route_returns(monkeypatch, {"type": "navigate", "routePath": "/rewards"})
    events = []
    handle = create_spotter_proxy(
        config=read_conformance_json("config.json"), llm=LLM, on_analytics=events.append
    )
    await handle({**QUERY, "role": "admin"})
    assert events == [
        {
            "type": "query",
            "query": QUERY["query"],
            "responseType": "navigate",
            "url": QUERY["url"],
            "role": "admin",
        }
    ]


async def test_awaits_async_analytics_handlers(monkeypatch):
    route_returns(monkeypatch, {"type": "general"})
    events = []

    async def on_analytics(event):
        events.append(event)

    handle = create_spotter_proxy(
        config=read_conformance_json("config.json"), llm=LLM, on_analytics=on_analytics
    )
    await handle(QUERY)
    assert len(events) == 1


async def test_a_failing_analytics_handler_does_not_break_the_response(monkeypatch):
    route_returns(monkeypatch, {"type": "general"})

    def broken(event):
        raise RuntimeError("disk full")

    handle = create_spotter_proxy(
        config=read_conformance_json("config.json"), llm=LLM, on_analytics=broken
    )
    assert (await handle(QUERY))["type"] == "unhandled"


async def test_works_without_an_analytics_handler(monkeypatch):
    route_returns(monkeypatch, {"type": "general"})
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLM)
    assert (await handle(QUERY))["type"] == "unhandled"


async def test_ndjson_logging_handler_pattern(monkeypatch, tmp_path):
    route_returns(monkeypatch, {"type": "general"})
    log = tmp_path / "spotter-session.ndjson"

    def on_analytics(event):
        with log.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")

    handle = create_spotter_proxy(
        config=read_conformance_json("config.json"), llm=LLM, on_analytics=on_analytics
    )
    await handle(QUERY)
    await handle(QUERY)
    lines = log.read_text(encoding="utf-8").strip().splitlines()
    assert [json.loads(line)["responseType"] for line in lines] == ["unhandled", "unhandled"]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_proxy.py -v`
Expected: FAIL — `ModuleNotFoundError: spotter_sdk.proxy`.

- [ ] **Step 3: Create `packages/python/spotter_sdk/analytics.py`**

```python
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
```

Add `"typing_extensions>=4.7"` to `dependencies` in `packages/python/pyproject.toml` (`NotRequired` is in `typing` only from 3.11, and `requires-python` is `>=3.10`). Re-run `.venv/bin/pip install -e ".[dev]"`.

- [ ] **Step 4: Create `packages/python/spotter_sdk/proxy.py`**

```python
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
```

- [ ] **Step 5: Run tests**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/python/pyproject.toml packages/python/spotter_sdk/analytics.py packages/python/spotter_sdk/proxy.py packages/python/tests/test_proxy.py
git commit -m "feat(python): add framework-agnostic spotter proxy with analytics hook"
```

---

### Task 6: FastAPI adapter

**Files:**
- Create: `packages/python/spotter_sdk/fastapi_router.py`
- Create: `packages/python/tests/test_fastapi_router.py`

- [ ] **Step 1: Write failing tests `packages/python/tests/test_fastapi_router.py`**

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

from spotter_sdk import proxy as proxy_module
from spotter_sdk.fastapi_router import create_spotter_router
from spotter_sdk.llm_client import LLMConfig
from spotter_sdk.proxy import create_spotter_proxy
from tests.helpers import read_conformance_json


def make_app(monkeypatch, result, path=None):
    async def fake_route_query(client, query, summary, model):
        return result

    monkeypatch.setattr(proxy_module, "route_query", fake_route_query)
    handle = create_spotter_proxy(config=read_conformance_json("config.json"), llm=LLMConfig(api_key="t"))
    app = FastAPI()
    router = create_spotter_router(handle, path) if path else create_spotter_router(handle)
    app.include_router(router)
    return TestClient(app)


def test_serves_navigate_steps_on_the_default_path(monkeypatch):
    client = make_app(monkeypatch, {"type": "navigate", "routePath": "/rewards"})
    response = client.post(
        "/api/spotter",
        json={"query": "show my points", "url": "https://app.com", "sessionToken": "abc", "role": "user"},
    )
    assert response.status_code == 200
    assert response.json()["type"] == "navigate"
    assert response.json()["steps"][0]["selector"] == 'a[href="/rewards"]'


def test_supports_a_custom_path(monkeypatch):
    client = make_app(monkeypatch, {"type": "general"}, path="/spotter/query")
    response = client.post("/spotter/query", json={"query": "q", "url": "https://app.com"})
    assert response.json()["type"] == "unhandled"


def test_rejects_a_malformed_body(monkeypatch):
    client = make_app(monkeypatch, {"type": "general"})
    response = client.post("/api/spotter", json={"url": "https://app.com"})
    assert response.status_code == 422
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_fastapi_router.py -v`
Expected: FAIL — `ModuleNotFoundError: spotter_sdk.fastapi_router`.

- [ ] **Step 3: Create `packages/python/spotter_sdk/fastapi_router.py`**

```python
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
```

- [ ] **Step 4: Run tests**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/python/spotter_sdk/fastapi_router.py packages/python/tests/test_fastapi_router.py
git commit -m "feat(python): add FastAPI router adapter"
```

---

### Task 7: Public exports

**Files:**
- Modify: `packages/python/spotter_sdk/__init__.py`
- Create: `packages/python/tests/test_public_api.py`

- [ ] **Step 1: Write failing test `packages/python/tests/test_public_api.py`**

```python
import subprocess
import sys

import spotter_sdk


def test_public_exports():
    expected = {
        "create_spotter_proxy",
        "LLMConfig",
        "SpotterConfig",
        "SpotterQuery",
        "SpotterEvent",
        "AnalyticsHandler",
        "load_config",
    }
    assert expected <= set(spotter_sdk.__all__)
    for name in expected:
        assert hasattr(spotter_sdk, name)


def test_importing_the_package_does_not_require_fastapi():
    code = "import sys; sys.modules['fastapi'] = None; import spotter_sdk"
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/python && .venv/bin/pytest tests/test_public_api.py -v`
Expected: FAIL — `__all__` not defined.

- [ ] **Step 3: Write `packages/python/spotter_sdk/__init__.py`**

```python
from .analytics import AnalyticsHandler, SpotterEvent
from .llm_client import LLMConfig
from .proxy import create_spotter_proxy
from .site_map import load_config
from .types import SpotterConfig, SpotterQuery

__all__ = [
    "AnalyticsHandler",
    "LLMConfig",
    "SpotterConfig",
    "SpotterEvent",
    "SpotterQuery",
    "create_spotter_proxy",
    "load_config",
]
```

- [ ] **Step 4: Run the full suite**

Run: `cd packages/python && .venv/bin/pytest -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/python/spotter_sdk/__init__.py packages/python/tests/test_public_api.py
git commit -m "feat(python): export public API"
```

---

### Task 8: Docs, build check, end-to-end smoke

**Files:**
- Create/overwrite: `packages/python/README.md`
- Modify: `README.md` (repo root)

- [ ] **Step 1: Write `packages/python/README.md`**

````md
# spotter-sdk (Python)

Natural-language navigation for your web app, served from a Python backend.

## 1. Generate your app graph

Run once in your frontend repo (Node is only needed for this step):

```bash
npx spotter-sdk analyze
```

This writes `spotter.config.json`. Commit it.

## 2. Add the endpoint (FastAPI)

```bash
pip install "spotter-sdk[fastapi]"
```

```python
import os
from fastapi import FastAPI
from spotter_sdk import LLMConfig, create_spotter_proxy
from spotter_sdk.fastapi_router import create_spotter_router

app = FastAPI()

handle = create_spotter_proxy(
    config="spotter.config.json",
    llm=LLMConfig(api_key=os.environ["OPENAI_API_KEY"]),
)
app.include_router(create_spotter_router(handle))
```

The router serves `POST /api/spotter`, which is what the Spotter widget calls by default.

## 3. Add the widget

Use the widget from the `spotter-sdk` npm package in your frontend, exactly as in the main README.

## Other LLM providers

Any OpenAI-compatible endpoint works:

```python
LLMConfig(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
    model="anthropic/claude-sonnet-4",
)
```

Ollama: `LLMConfig(api_key="ollama", base_url="http://localhost:11434/v1", model="llama3.2")`.

## Analytics

```python
import json

def log_event(event):
    with open("spotter-session.ndjson", "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")

handle = create_spotter_proxy(config="spotter.config.json", llm=llm, on_analytics=log_event)
```

Handlers may be sync or async. A failing handler is logged and never breaks the response. Events have the shape `{type, query, responseType, url, role}`; `responseType` of `unhandled` marks queries your graph could not answer.

## Other frameworks

`create_spotter_proxy(...)` returns `async handle(query: dict) -> dict` with no web-framework dependency. Call it from any handler (Starlette, Flask via `asyncio.run`, Django async views) with the JSON body of the widget request.

## Format

The config format is language-neutral: see [docs/graph-format.md](../../docs/graph-format.md). Both the TypeScript and Python SDKs are tested against the shared fixtures in `/conformance`.
````

- [ ] **Step 2: Add a "Python backends" section to the root `README.md`**

Insert before the `## Config reference` section:

````md
## Python backends

Using FastAPI (or any Python server)? Install the Python SDK instead of the Node proxy:

```bash
pip install "spotter-sdk[fastapi]"
```

```python
from spotter_sdk import LLMConfig, create_spotter_proxy
from spotter_sdk.fastapi_router import create_spotter_router

handle = create_spotter_proxy(config="spotter.config.json", llm=LLMConfig(api_key="..."))
app.include_router(create_spotter_router(handle))
```

Run `npx spotter-sdk analyze` once to generate `spotter.config.json`. Full guide: [packages/python/README.md](packages/python/README.md).
````

- [ ] **Step 3: Run both test suites**

Run: `npm test && cd packages/python && .venv/bin/pytest -v`
Expected: both pass.

- [ ] **Step 4: Verify the package builds**

Run:
```bash
cd packages/python && .venv/bin/pip install build && .venv/bin/python -m build --wheel --outdir /tmp/spotter-wheel && unzip -l /tmp/spotter-wheel/*.whl | grep spotter_sdk
```
Expected: wheel contains every `spotter_sdk/*.py` module.

- [ ] **Step 5: End-to-end smoke test against a live FastAPI server (no LLM key needed)**

Create `/tmp/spotter_smoke.py`:

```python
from fastapi import FastAPI
from spotter_sdk import LLMConfig, create_spotter_proxy
from spotter_sdk.fastapi_router import create_spotter_router

app = FastAPI()
handle = create_spotter_proxy(config="conformance/config.json", llm=LLMConfig(api_key="invalid"))
app.include_router(create_spotter_router(handle))
```

Run from the repo root:
```bash
packages/python/.venv/bin/pip install uvicorn
packages/python/.venv/bin/uvicorn --app-dir /tmp spotter_smoke:app --port 8765 &
sleep 2
curl -s -X POST localhost:8765/api/spotter -H 'content-type: application/json' -d '{"query":"change my plan","url":"https://app.com"}'
kill %1
```
Expected: `{"type":"unhandled","query":"change my plan"}` (the invalid key makes the LLM call fail, which the SDK degrades to `general`). This proves the server wiring, config loading, and graceful degradation end to end.

- [ ] **Step 6: Commit**

```bash
git add packages/python/README.md README.md
git commit -m "docs: add Python SDK guide and README section"
```
