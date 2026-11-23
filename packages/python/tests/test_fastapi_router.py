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
