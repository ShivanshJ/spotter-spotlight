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
