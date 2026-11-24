import pytest
from pydantic import ValidationError

from spotter_sdk.types import SpotterConfig, SpotterQuery

BASE = {"version": "1", "actions": [], "mcpServers": []}


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


def test_ignores_a_legacy_base_url():
    config = SpotterConfig.model_validate({**BASE, "baseUrl": "https://app.com", "routes": []})
    assert not hasattr(config, "base_url")
