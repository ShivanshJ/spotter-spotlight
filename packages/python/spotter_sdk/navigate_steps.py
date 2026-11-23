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
