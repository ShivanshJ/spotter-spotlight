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


def _is_navigable(route: Route) -> bool:
    return route.navigable is not False


def summarize_config(config: SpotterConfig) -> str:
    routes = "\n".join(line for route in config.routes if _is_navigable(route) for line in _route_lines(route))
    actions = "\n".join(_action_line(action) for action in config.actions)
    return f"Routes:\n{routes or '  (none)'}\n\nActions:\n{actions or '  (none)'}"


def find_route_by_path(config: SpotterConfig, path: str | None) -> Route | None:
    return next((route for route in config.routes if route.path == path and _is_navigable(route)), None)


def find_action_by_intent(config: SpotterConfig, intent: str | None) -> Action | None:
    return next((action for action in config.actions if action.intent == intent), None)
