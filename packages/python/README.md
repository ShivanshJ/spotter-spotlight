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
