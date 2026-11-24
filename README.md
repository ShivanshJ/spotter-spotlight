# Spotter

**Natural-language navigation for any web app.** Users type what they want; Spotter takes them there.

```
"show me my unpaid invoices"  →  walks the user to Billing → Invoices
"change my plan"              →  Settings → Billing → highlights "Change plan"
"switch to dark mode"         →  Settings → Appearance → highlights the theme toggle
```

Spotter is a floating chat widget, a small backend endpoint, and a generated map of your app. It works with the app you already have: no rewrite, no new UI framework, and no key in the browser.

- **5 minutes to a working demo.** One CLI command, one endpoint, one script tag.
- **Your stack, your model.** Node or Python (FastAPI) backend. OpenAI, OpenRouter (Claude, Gemini, Llama and more) or local Ollama.
- **Your data stays yours.** The LLM key lives on your server, and the widget acts with the user's own session.
- **Gets better with use.** Every query the map can't answer is an `unhandled` event you can learn from.

---

## Quick start

Pick your backend. Both take about five minutes.

### 1. Generate your app map (any stack)

Run once in your frontend repo:

```bash
npx spotter-sdk analyze
```

Spotter detects Next.js, React Router or Vue Router, finds your routes and their selectors, and writes `spotter.config.json`. Commit it.

Set `OPENAI_API_KEY` first if you want LLM-written page descriptions. Without a key it falls back to path-based descriptions.

### 2. Add the endpoint

<details open>
<summary><b>Node.js (Express)</b></summary>

```bash
npm install spotter-sdk
```

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

```bash
pip install "spotter-sdk[fastapi]"
```

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

The router serves `POST /api/spotter`, the widget's default. The core `create_spotter_proxy` has no web-framework dependency, so any async Python server can call it. Full guide: [packages/python/README.md](packages/python/README.md).

</details>

### 3. Add the widget

```html
<script src="https://unpkg.com/spotter-sdk/dist/index.iife.js"></script>
<script>
  Spotter.init({
    proxyUrl: '/api/spotter',
    sessionToken: () => window.__SESSION_TOKEN__,
  })
</script>
```

Using a bundler?

```ts
import { Spotter } from 'spotter-sdk'

Spotter.init({ proxyUrl: '/api/spotter' })
```

Open your app, click the chat bubble, and ask for a page. That's the whole integration.

---

## How it works

```
Browser                       Your server                    LLM
───────────────────────────────────────────────────────────────────────────
Widget  ──POST /api/spotter──▶ Spotter proxy ──routing prompt──▶ any OpenAI-
  ▲                            │  reads spotter.config.json      compatible
  │                            │  (your app map)                 model
  └──── navigation steps ◀─────┘
        (links to click, element to highlight)
```

1. **Analyze (build time).** `spotter analyze` reads your codebase and writes `spotter.config.json`: pages, how they connect, and what users can do on them.
2. **Route (request time).** The proxy gives the LLM a compact summary of the map plus the user's question. The LLM picks a route and, optionally, a page action.
3. **Navigate (in the browser).** The proxy turns that choice into ordered steps (parent page, target page, action). The widget walks the user through them with the user's own session.

By default the widget runs in **guided** mode: it highlights each step and waits for the user to click it, then moves on to the next one. It survives full page loads and falls back to a direct navigation if a link is missing. Set `mode: 'auto'` to have Spotter click each step for the user. Auto mode is opt-in, so only use it where every action is non-destructive.

The map is plain JSON committed to git. You can read it, review it in a PR and edit it by hand. Edits survive re-running `analyze`.

### Spotter vs. a chatbot

| | Generic chatbot | Spotter |
|---|---|---|
| Knows your UI | Only if you write docs | Generated from your code |
| Answer | Text, which the user must follow | Takes the user there and highlights the control |
| Permissions | Often a separate integration | Uses the user's own session |
| Unknown question | Hallucinates | Returns `unhandled`, so you can forward it to your existing bot |

Already have a support bot? Spotter handles navigation; send everything else on with `onUnhandled`.

---

## Teach Spotter your app

The generated map is a starting point. Add **page actions** to tell Spotter what users can *do* on a page:

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

With that, "change my plan" navigates `Settings → Billing` and highlights the button. Descriptions are what the LLM matches against, so write them the way your users talk.

Full format: [docs/graph-format.md](docs/graph-format.md).

---

## Learn from real usage

Every request emits one analytics event:

```ts
{ type: 'query', query: string, responseType: 'navigate' | 'answer' | 'unhandled' | 'error', url: string, role?: string }
```

**`unhandled` is the signal that matters.** It is something a user wanted that your map couldn't answer. Log events and review them weekly:

<details open>
<summary><b>Node.js</b></summary>

```ts
import fs from 'node:fs'

createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY! },
  onAnalytics: (event) => {
    fs.appendFileSync('spotter-session.ndjson', JSON.stringify(event) + '\n')
  },
})
```

</details>

<details>
<summary><b>Python</b></summary>

```python
import json

def log_event(event):
    with open("spotter-session.ndjson", "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")

handle = create_spotter_proxy(config=..., llm=..., on_analytics=log_event)
```

Handlers can be sync or async. A handler that raises is logged and never breaks the user's response.

</details>

The widget's `onFlowEvent` callback reports whether each navigation flow was completed, failed or abandoned.

For each `unhandled` query, either improve a page `description`, add a page action, or confirm it's a feature your app doesn't have. Pipe the same events into your own analytics (PostHog, Segment, a warehouse) in the handler.

---

## LLM providers

Anything that speaks the OpenAI API works. The default model is `gpt-4o-mini`.

```ts
// OpenAI (default)
llm: { apiKey: process.env.OPENAI_API_KEY! }

// OpenRouter: Claude, Gemini, Llama and more behind one key
llm: {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-3-haiku',
}

// Local Ollama: nothing leaves your machine
llm: { apiKey: 'ollama', baseURL: 'http://localhost:11434/v1', model: 'llama3' }
```

Python uses `LLMConfig(api_key=..., base_url=..., model=...)` with the same values.

The CLI reads:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key for page descriptions |
| `SPOTTER_LLM_BASE_URL` | Override endpoint (for example OpenRouter) |
| `SPOTTER_LLM_MODEL` | Override model |

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `No supported framework detected` | Run `analyze` from your frontend repo root, or pass `--root ./path`. Supported: Next.js, React Router, Vue Router. You can also write `spotter.config.json` by hand. |
| Every query returns `unhandled` | Usually a bad LLM key, wrong `baseURL`/`model`, or an empty config. Python logs the failure under the `spotter_sdk` logger. In Node, log events with `onAnalytics` and check the config. |
| Config not found | The path is resolved from the server's working directory. Use an absolute path, or `Path(__file__).parent / ...` in Python. |
| Navigates to the wrong page | Sharpen that route's `description` in `spotter.config.json`. It is what the LLM matches against. |
| Widget can't reach the endpoint | Check `proxyUrl` matches your route and that `express.json()` (or FastAPI's body parsing) is enabled. |

---

## Reference

### `Spotter.init` options

```ts
type SpotterInitOptions = {
  proxyUrl: string                        // your endpoint, e.g. '/api/spotter'
  sessionToken?: () => string | undefined // the signed-in user's token, passed to your backend
  role?: string                           // used for role-restricted routes and analytics
  onUnhandled?: (query: string) => void   // hand off to an existing chatbot
  mode?: 'guided' | 'auto'                // 'guided' (default): the user clicks each step. 'auto': Spotter clicks for them
  onFlowEvent?: (event: FlowEvent) => void // flow_started | flow_completed | flow_step_failed | flow_abandoned
}
```

### Response types

```ts
type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }  // widget walks the user through the UI
  | { type: 'answer'; content: string }          // direct text answer
  | { type: 'unhandled'; query: string }         // nothing in the map matched
  | { type: 'error'; message: string }
```

### `spotter.config.json`

```ts
type SpotterConfig = {
  version: '1'
  baseUrl: string
  routes: Route[]
  actions: Action[]        // cross-page API actions
  mcpServers: MCPServer[]
}

type Route = {
  path: string
  description: string        // matched against user queries
  title?: string
  reachableFrom?: string[]   // parent pages the user passes through
  actions?: PageAction[]     // what a user can do on this page
  selectors?: Record<string, string>
  role?: string              // restrict to this role
}

type PageAction = { name: string; description: string; selector: string }
```

The format is language-neutral and covered by shared conformance fixtures in [`/conformance`](conformance), so the TypeScript and Python SDKs behave identically.

### Packages

| Install | Use |
|---|---|
| `spotter-sdk` (npm) | Browser widget, Node proxy at `spotter-sdk/proxy`, and the `analyze` CLI |
| `spotter-sdk` (PyPI) | Python proxy and FastAPI router |

---

## Security

- **The LLM key never reaches the browser.** The widget only talks to your endpoint.
- **Spotter acts as the user, not as a superuser.** Your backend enforces permissions as it always does.
- **No `innerHTML`.** The widget builds DOM nodes directly to prevent XSS.
- **You control what the LLM sees.** It receives the route summary and the user's question, nothing else from your app.

---

## Open source and what's next

Everything in this repository is open source: the `analyze` CLI, the app-map format, the widget, the Node and Python proxies, and local-model support.

On the roadmap for teams that want it managed: a hosted app map that re-analyzes on every deploy, an analytics dashboard for `unhandled` queries, and managed inference. If that's useful to you, open an issue and tell us what you'd need.

## Contributing

```bash
npm install
npm test            # vitest
npm run build       # browser widget, Node proxy and CLI into dist/

cd packages/python
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
```

Behavior shared between languages (the map summary, the routing prompt, navigation steps) is pinned by the fixtures in `/conformance`. Change a fixture and both test suites must pass.

## License

ISC
