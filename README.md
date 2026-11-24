# Spotter

**Natural-language navigation for any web app.** Users type what they want; Spotter takes them there.

```
"change to dark mode"   →  walks the user to Settings → Appearance and highlights the theme toggle
"where are my invoices" →  walks the user to Billing
"change my plan"        →  Settings → Billing, then highlights the "Change plan" button
```

Spotter is three small pieces: a **chat widget** in your frontend, an **endpoint** on your backend, and a **map of your app** that Spotter generates by reading your code. It works with the app you already have: no rewrite, no new UI framework, no API key in the browser.

> Spotter is pre-1.0. The core flow below works end to end, and a few things are still on the roadmap. See [Known limitations](#known-limitations).

**Requirements:** Node 18+ for the CLI and Node backends, Python 3.10+ for Python backends, and a frontend built with Next.js, React Router or Vue Router (other stacks can use a hand-written map).

---

## Quick start

Four commands from zero to a working demo. You never write `spotter.config.json` yourself; Spotter generates it.

### 1. Generate your app map

From the root of your **frontend** repo:

```bash
npx spotter-sdk analyze --base-url http://localhost:3000
```

```
✓ Detected: Next.js
✓ Found 3 routes
✓ Extracted 3 selectors
✓ Written to spotter.config.json
```

Spotter reads your routes and components and writes `spotter.config.json` next to your code:

```json
{
  "version": "1",
  "baseUrl": "http://localhost:3000",
  "routes": [
    {
      "path": "/settings/appearance",
      "description": "Settings Appearance page",
      "title": "Appearance Settings",
      "selectors": { "darkModeToggle": "[data-testid=\"dark-mode-toggle\"]" }
    }
  ],
  "actions": [],
  "mcpServers": []
}
```

Commit this file. It is the map your endpoint reads in step 2.

Want better page descriptions? Set an LLM key and run it again. Without a key, descriptions are built from the path.

```bash
OPENAI_API_KEY=sk-... npx spotter-sdk analyze --base-url http://localhost:3000
```

<details>
<summary><b>What gets generated, and what you can add later</b></summary>

| Spotter generates (every run) | You can add (optional) |
|---|---|
| Routes and page titles | Page actions, such as "change plan" |
| A description of each page (LLM or path-based) | Sharper descriptions in your own words |
| Parent links between pages (`reachableFrom`) | Role hints |
| `data-testid` and `aria-label` selectors found on each page, as a reference for writing page actions | |

Re-running `analyze` is safe. Descriptions, titles, parent links and page actions you have edited are kept, new routes are added, and routes you deleted are removed. Selectors are regenerated each time.

To keep the map fresh, add a script to your `package.json` and run it when routes change:

```json
{ "scripts": { "spotter": "spotter analyze --base-url http://localhost:3000" } }
```

</details>

### 2. Add the endpoint

Your backend keeps the LLM key and answers the widget. Pick your stack.

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

Copy `spotter.config.json` next to this file (or point `config` at it). Node is needed only for step 1. The core `create_spotter_proxy` has no web-framework dependency, so any async Python server can call it. More in [packages/python/README.md](packages/python/README.md).

</details>

### 3. Add the widget

```html
<script src="https://unpkg.com/spotter-sdk/dist/index.iife.js"></script>
<script>
  Spotter.init({ proxyUrl: '/api/spotter' })
</script>
```

Using a bundler?

```ts
import { Spotter } from 'spotter-sdk'

Spotter.init({ proxyUrl: '/api/spotter' })
```

### 4. Try it

Open your app, click **✦ Ask Spotter**, and ask for a page, for example "billing". Spotter highlights the link to follow; click it, and it moves on to the next step.

If nothing happens, see [Troubleshooting](#troubleshooting).

---

## How it works

```
Browser                         Your server                      LLM
───────────────────────────────────────────────────────────────────────────
Widget ──POST /api/spotter──▶  Spotter endpoint  ──routing prompt──▶  any OpenAI-
   ▲                           reads spotter.config.json              compatible model
   └──── ordered steps ◀───────┘
```

1. **Analyze (build time).** `spotter analyze` reads your codebase and writes `spotter.config.json`.
2. **Route (request time).** Your endpoint sends the LLM a compact summary of the map plus the user's question. The LLM picks a page and, optionally, a page action.
3. **Navigate (in the browser).** The endpoint turns that choice into ordered steps: parent page, target page, then the action. The widget walks the user through them.

The widget runs in **guided** mode by default. It highlights each step, waits for the user to click, then moves on. It survives full page loads, and if a link is missing it falls back to a direct navigation. Set `mode: 'auto'` to have Spotter click for the user. Auto mode is opt-in, so use it only where every step is safe to run without confirmation.

Everything the endpoint knows about your app is in one readable JSON file under version control. Review changes in a PR like any other code.

Already have a support chatbot? Spotter handles "take me there". Anything it can't match comes back as `unhandled`, and `onUnhandled` lets you hand that to your existing bot.

---

## Teach Spotter what users can do

Generated maps know your **pages**. To let users ask for things they can **do** on a page, add page actions to a route in `spotter.config.json`:

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

Now "change my plan" goes Settings → Billing and highlights the button. Your edits survive re-running `analyze`.

Tips:
- Give important buttons a stable `data-testid`. `analyze` lists the `data-testid` and `aria-label` selectors it finds under each route's `selectors`, so you can copy them into a page action.
- Write descriptions the way your users talk. They are what the LLM matches against.

Full format: [docs/graph-format.md](docs/graph-format.md).

---

## Learn from real usage

Every request emits one analytics event:

```ts
{ type: 'query', query: string, responseType: 'navigate' | 'answer' | 'unhandled' | 'error', url: string, role?: string }
```

**`unhandled` is the signal that matters.** It is something a user wanted that your map couldn't answer. Log the events and review them weekly:

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

The widget's `onFlowEvent` callback reports whether each navigation was completed, failed or abandoned.

For each `unhandled` query, improve a page `description`, add a page action, or confirm it's something your app doesn't offer. You can send the same events to your own analytics (PostHog, Segment, a warehouse) from the handler.

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

The `analyze` CLI reads these environment variables:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key for page descriptions. For OpenRouter or Ollama, put that provider's key here |
| `SPOTTER_LLM_BASE_URL` | Override the endpoint, for example `https://openrouter.ai/api/v1` |
| `SPOTTER_LLM_MODEL` | Override the model |

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `No supported framework detected` | Run `analyze` from your frontend repo root, or pass `--root ./path`. Supported: Next.js, React Router, Vue Router. For anything else, write a small `spotter.config.json` by hand using [the format](docs/graph-format.md). |
| `analyze` wrote `https://your-app.com` as `baseUrl` | Pass `--base-url` with your app's URL, or edit the file. |
| Every query returns `unhandled` | Usually a bad LLM key, a wrong `baseURL` or `model`, or an empty map. Python logs the failure under the `spotter_sdk` logger. In Node, log events with `onAnalytics` and check `spotter.config.json` has routes. |
| Config not found | The path is resolved from the server's working directory. Use an absolute path, or `Path(__file__).parent / ...` in Python. |
| Navigates to the wrong page | Sharpen that route's `description` in `spotter.config.json`. It is what the LLM matches against. |
| Widget can't reach the endpoint | Check `proxyUrl` matches your route, that JSON body parsing is enabled (`express.json()`), and that CORS allows the widget's origin if it is served from a different domain. |

---

## Known limitations

- **Navigation uses links.** Steps click `a[href="<path>"]`, so pages reached through a link whose `href` matches the route path work best. If the link isn't on the page, the widget navigates directly.
- **Dynamic routes** such as `/invoices/[id]` are listed as written, so Spotter can't navigate to a specific record yet.
- **Page actions are hand-written.** `analyze` finds pages and selectors; it does not guess what a button does.
- **API actions are not executed yet.** The top-level `actions` list is matched, but the endpoint returns a "not enabled" message instead of calling your API.
- **`role` is a hint, not access control.** It is passed to the LLM and to analytics. Keep enforcing permissions in your own app.
- **Static analysis.** Routes defined dynamically at runtime are not found. Add them to `spotter.config.json` by hand.

---

## Reference

### `Spotter.init` options

```ts
type SpotterInitOptions = {
  proxyUrl: string                         // your endpoint, e.g. '/api/spotter'
  sessionToken?: () => string | undefined  // sent to your endpoint with each query, for your own auth checks
  role?: string                            // optional hint sent with each query
  onUnhandled?: (query: string) => void    // hand off to an existing chatbot
  mode?: 'guided' | 'auto'                 // 'guided' (default): the user clicks each step. 'auto': Spotter clicks for them
  onFlowEvent?: (event: FlowEvent) => void // flow_started | flow_completed | flow_step_failed | flow_abandoned
}
```

### Response types

```ts
type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }  // widget walks the user through the UI
  | { type: 'answer'; content: string }          // text answer
  | { type: 'unhandled'; query: string }         // nothing in the map matched
  | { type: 'error'; message: string }
```

### `spotter.config.json`

```ts
type SpotterConfig = {
  version: '1'
  baseUrl: string          // your app's URL
  routes: Route[]
  actions: Action[]        // cross-page API actions (not executed yet)
  mcpServers: MCPServer[]
}

type Route = {
  path: string
  description: string        // matched against user queries
  title?: string
  reachableFrom?: string[]   // parent pages the user passes through
  actions?: PageAction[]     // what a user can do on this page
  selectors?: Record<string, string>
  role?: string              // hint shown to the LLM
}

type PageAction = { name: string; description: string; selector: string }
```

The format is language-neutral and covered by shared conformance fixtures in [`/conformance`](conformance), so the TypeScript and Python SDKs behave identically.

### CLI

```
spotter analyze [--root <dir>] [--output <path>] [--base-url <url>]
```

| Flag | Default |
|---|---|
| `--root` | current directory |
| `--output` | `<root>/spotter.config.json` |
| `--base-url` | `https://your-app.com` (placeholder) |

### Packages

| Install | Use |
|---|---|
| `spotter-sdk` (npm) | Browser widget, Node endpoint at `spotter-sdk/proxy`, and the `analyze` CLI |
| `spotter-sdk` (PyPI) | Python endpoint and FastAPI router |

---

## Security

- **The LLM key stays on your server.** The widget only talks to your endpoint.
- **Spotter doesn't have its own access to your data.** It sends the LLM your route summary and the user's question, and nothing else from your app. In the browser it clicks what the signed-in user could click.
- **Keep authorizing in your app.** Spotter does not replace your permission checks, so don't treat `role` as access control.
- **No `innerHTML`.** The widget builds DOM nodes directly to prevent XSS.
- **Put your endpoint behind your normal protections** (auth, rate limiting), since each request calls an LLM.

---

## Open source and what's next

Everything in this repository is open source: the `analyze` CLI, the app-map format, the widget, the Node and Python endpoints, and local-model support.

On the roadmap for teams that want it managed: a hosted app map that re-analyzes on every deploy, an analytics dashboard for `unhandled` queries, and managed inference. If that's useful to you, open an issue and tell us what you'd need.

## Contributing

```bash
npm install
npm run check       # lint, typecheck, tests
npm run build       # browser widget, Node endpoint and CLI into dist/

cd packages/python
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/pytest
```

Behavior shared between languages (the map summary, the routing prompt, navigation steps) is pinned by the fixtures in `/conformance`. Change a fixture and both test suites must pass.

## License

ISC
