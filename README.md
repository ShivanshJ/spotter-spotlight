# Spotter

Natural-language navigation for any web app. Users type what they want; Spotter takes them there.

```
"change to dark mode"  →  Settings → Appearance, with the theme toggle highlighted
"change my plan"       →  Settings → Billing, with the "Change plan" button highlighted
```

You add a chat widget to your frontend and an endpoint to your backend. Spotter reads your code to build a map of your app, so there's no config to write. The LLM key stays on your server.

> Pre-1.0. The core flow works end to end; see [Known limitations](#known-limitations).

## Install

```bash
npm install spotter-sdk                  # widget, Node endpoint, and the analyze CLI
pip install "spotter-sdk[fastapi]"       # Python endpoint (only if your backend is Python)
```

Requires Node 18+ (Python 3.10+ for the Python package). The app map is generated for Next.js, React Router and Vue Router frontends.

## Quick start

**1. Generate the map.** In your frontend repo:

```bash
npx spotter-sdk analyze
```

```
✓ Detected: Next.js
✓ Found 3 routes
✓ Written to spotter.config.json
```

This writes `spotter.config.json`, a readable list of your pages. Commit it. Re-run it when your routes change; anything you edited by hand is kept. Set `OPENAI_API_KEY` first for better page descriptions; without it they're built from the path.

**2. Add the endpoint.**

<details open>
<summary><b>Node (Express)</b></summary>

```ts
import express from 'express'
import { createSpotterProxy } from 'spotter-sdk/proxy'

const app = express()
app.use(express.json())

const spotter = createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY! },
})

app.post('/api/spotter', (req, res) => spotter(req, res))
```

</details>

<details>
<summary><b>Python (FastAPI)</b></summary>

```python
import os
from pathlib import Path

from fastapi import FastAPI
from spotter_sdk import LLMConfig, create_spotter_proxy
from spotter_sdk.fastapi_router import create_spotter_router

app = FastAPI()

handle = create_spotter_proxy(
    config=Path(__file__).parent / "spotter.config.json",
    llm=LLMConfig(api_key=os.environ["OPENAI_API_KEY"]),
)
app.include_router(create_spotter_router(handle))
```

Copy `spotter.config.json` next to this file. `create_spotter_proxy` has no web-framework dependency, so any async Python server can call it. More in [packages/python](packages/python/README.md).

</details>

**3. Add the widget.**

```ts
import { Spotter } from 'spotter-sdk'

Spotter.init({ proxyUrl: '/api/spotter' })
```

Or with a script tag:

```html
<script src="https://unpkg.com/spotter-sdk/dist/index.iife.js"></script>
<script>Spotter.init({ proxyUrl: '/api/spotter' })</script>
```

Open your app, click **✦ Ask Spotter**, and ask for a page. Spotter highlights each step; click it to move on.

## Using other LLMs

Any OpenAI-compatible API works. The default model is `gpt-4o-mini`.

```ts
llm: {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-3-haiku',
}

llm: { apiKey: 'ollama', baseURL: 'http://localhost:11434/v1', model: 'llama3' }
```

Python: `LLMConfig(api_key=..., base_url=..., model=...)`. For `analyze`, set `OPENAI_API_KEY` to your provider's key and, if needed, `SPOTTER_LLM_BASE_URL` and `SPOTTER_LLM_MODEL`.

## Let users do things on a page

The generated map knows your pages. To let users ask for something they can *do* on a page, add a page action to that route in `spotter.config.json`:

```json
{
  "path": "/settings/billing",
  "description": "Manage subscription and payment",
  "reachableFrom": ["/settings"],
  "actions": [
    {
      "name": "change_plan",
      "description": "Upgrade or downgrade subscription plan",
      "selector": "[data-testid=\"change-plan\"]"
    }
  ]
}
```

"Change my plan" now goes Settings → Billing and highlights the button. `analyze` lists the `data-testid` and `aria-label` selectors it finds under each route's `selectors`, so you can copy one in. Full format: [docs/graph-format.md](docs/graph-format.md).

## See what users ask

Pass `onAnalytics` to log every request. `unhandled` means the map had no answer, which tells you what to add.

```ts
import fs from 'node:fs'

createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY! },
  onAnalytics: (event) => fs.appendFileSync('spotter.ndjson', JSON.stringify(event) + '\n'),
})
```

```python
handle = create_spotter_proxy(config=..., llm=..., on_analytics=lambda event: print(event))
```

Each event is `{ type: 'query', query, responseType: 'navigate' | 'answer' | 'unhandled' | 'error', url, role? }`. Python handlers can be sync or async, and a handler that raises never breaks the response. The widget's `onFlowEvent` reports whether each navigation completed, failed or was abandoned.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No supported framework detected` | Run `analyze` from your frontend repo root, or pass `--root ./path`. For other frameworks, write a small `spotter.config.json` by hand ([format](docs/graph-format.md)). |
| Every query is `unhandled` | Usually a bad LLM key, wrong `baseURL`/`model`, or no routes in the config. Python logs the cause under the `spotter_sdk` logger; in Node, log events with `onAnalytics`. |
| Config not found | The path resolves from the server's working directory. Use an absolute path, or `Path(__file__).parent / ...` in Python. |
| Wrong page chosen | Edit that route's `description` in `spotter.config.json`. It's what the LLM matches against. |
| Widget can't reach the endpoint | Check `proxyUrl`, that JSON body parsing is on (`express.json()`), and CORS if the widget is on another origin. |

## Known limitations

- Steps click links by `href`. If the link isn't on the page, the widget navigates directly.
- Dynamic routes such as `/invoices/[id]` are written as-is, so Spotter can't open a specific record yet.
- Page actions are hand-written; `analyze` finds pages, not what buttons do.
- Top-level `actions` (API calls) are matched but not executed yet.
- `role` is only a hint to the LLM and analytics. Keep enforcing permissions in your app.
- Routes created dynamically at runtime aren't found by `analyze`.

## Reference

```ts
type SpotterInitOptions = {
  proxyUrl: string                         // your endpoint
  mode?: 'guided' | 'auto'                 // 'guided' (default): the user clicks each step. 'auto': Spotter clicks for them
  onUnhandled?: (query: string) => void    // e.g. hand off to your existing chatbot
  onFlowEvent?: (event: FlowEvent) => void // flow_started | flow_completed | flow_step_failed | flow_abandoned
  sessionToken?: () => string | undefined  // sent to your endpoint with each query, for your own checks
  role?: string                            // optional hint sent with each query
}
```

`auto` mode clicks for the user, so use it only where every step is safe to run unprompted.

```
spotter analyze [--root <dir>] [--output <path>]
```

The config format is documented in [docs/graph-format.md](docs/graph-format.md). It is language-neutral, and shared fixtures in [`/conformance`](conformance) keep the TypeScript and Python SDKs identical.

## Security

- The LLM key stays on your server. The widget only talks to your endpoint.
- The LLM sees your route summary and the user's question, nothing else from your app.
- Spotter doesn't replace your permission checks, and your endpoint calls an LLM per request, so put it behind your normal auth and rate limiting.
- The widget builds DOM nodes directly (no `innerHTML`).

## Contributing

```bash
npm install && npm run check && npm run build

cd packages/python
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/pytest
```

To try your local build in another project: `npm install /path/to/this/repo` and `pip install -e "/path/to/this/repo/packages/python[fastapi]"`.

## License

ISC
