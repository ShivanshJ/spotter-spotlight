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
            "actions": [],
            "routes": [
                {"path": "/admin/users", "description": "Users", "reachableFrom": ["/admin"], "role": "admin"}
            ],
        }
    )
    assert '"Users" [reachable from: /admin] [role: admin]' in summarize_config(config)


def test_summary_of_empty_config():
    config = SpotterConfig.model_validate(
        {"version": "1", "actions": [], "routes": []}
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
