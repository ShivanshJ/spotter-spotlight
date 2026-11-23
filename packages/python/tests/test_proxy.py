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
