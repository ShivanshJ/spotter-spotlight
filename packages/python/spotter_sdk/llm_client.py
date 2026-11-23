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
