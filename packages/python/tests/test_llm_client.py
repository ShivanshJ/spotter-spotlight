import json
import logging
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


async def test_logs_a_warning_when_the_call_raises(caplog):
    client, create = make_client("{}")
    create.side_effect = RuntimeError("network failure")
    with caplog.at_level(logging.WARNING, logger="spotter_sdk"):
        await route_query(client, "q", "s")
    record = next(r for r in caplog.records if r.getMessage() == "spotter LLM routing failed")
    assert record.levelno == logging.WARNING
    assert record.exc_info is not None


def test_create_llm_client_passes_base_url():
    client = create_llm_client(LLMConfig(api_key="k", base_url="https://openrouter.ai/api/v1"))
    assert str(client.base_url).startswith("https://openrouter.ai/api/v1")
