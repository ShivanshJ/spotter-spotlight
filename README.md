# Spotter

Natural-language navigation for any web app. Users type what they want; Spotter takes them there.

```
"change to dark mode"  →  Settings → Appearance, with the theme toggle highlighted
"change my plan"       →  Settings → Billing, with the "Change plan" button highlighted
```

Spotter reads your code to build a map of your app, so there's no config to write: its pages, what each one is for, and the buttons that do things there. Try it on your running app with one command. Then ship it as a chat widget in your frontend plus an endpoint in your backend, with the LLM key on your server.

> Pre-1.0. The core flow works end to end; see [Known limitations](#known-limitations).

## Install

```bash
npm install -D spotter-sdk               # the analyze and dev CLI, plus the widget and Node endpoint
pip install "spotter-sdk[fastapi]"       # Python endpoint (only if your backend is Python)
```

Requires Node 18+ (Python 3.10+ for the Python package). The app map is generated for Next.js, React Router and Vue Router frontends.

## Quick start

Three steps: map your app, try it locally with no code changes, then ship it.

### 1. Map your app

In your frontend package:

```bash
npx spotter-sdk analyze
```

```
  Using OPENAI_API_KEY in .env
✓ Detected: React Router
✓ Found 18 routes in app/routes.ts
✓ Found 64 controls (buttons, tabs, menu items)
  Reading pages with gpt-4o-mini...
✓ 12 pages, 23 actions, 6 hidden
    /paywall      Interstitial shown when a plan is required
    /api/health   API endpoint
    ...
✓ Written to spotter.config.json
```

This writes `spotter.config.json`, a readable list of your pages. Commit it.

- **Route paths come from your code, never from a model.** `analyze` parses your route definitions without running the app. It follows routes across files: nested `children`, imported and spread route arrays, React Router `routes.ts` (`route`/`index`/`layout`/`prefix`/`flatRoutes`), `<Route>` trees, nested `<Routes>` under `path="x/*"`, and the Next.js `app/` and `pages/` folders (also under `src/`).
- **Controls come from your code too:** buttons, tabs and menu items in each page and in the components it imports, found by test id, `aria-label` or visible text.
- **A small model does the judgment calls.** It reads each page and writes a description in the words users type. It hides routes nobody asks for (paywalls, loading screens, test pages), and it generates page actions ("change plan", "invite teammate") tied to the controls it found. It uses the LLM key you already have: `OPENAI_API_KEY` or `SPOTTER_LLM_API_KEY`, from your shell or a `.env` file up to the repo root. That's one small request per page.
- **Without a key**, you still get every route and control, and API, resource and dynamic routes are hidden by rule. Descriptions are placeholders until you add a key and re-run.
- **Re-run it whenever routes change.** Anything you edited is kept, and placeholders get replaced.

Prefer your coding agent to do the judgment calls? Install the Claude Code plugin and ask it to "set up spotter.config.json":

```
/plugin install spotter --marketplace ShivanshJ/spotter-spotlight
```

### 2. Try it on your running app

Start your dev server as usual, then in another terminal:

```bash
npx spotter-sdk dev
```

```
Spotter dev proxy
  Open      http://localhost:4400   (your app at http://localhost:5173, with the widget added)
  Config    spotter.config.json (12 pages, reloaded on every question)
  Model     gpt-4o-mini via OPENAI_API_KEY in .env
```

Open `http://localhost:4400`. It's your app, hot reload included, with **✦ Ask Spotter** in the corner. Ask for a page or an action. Each question is logged in the terminal, and edits to `spotter.config.json` apply to the next question. Nothing in your code changes.

`dev` looks for a dev server on ports 5173, 3000, 8080, 5174, 4200 and 8000. Pass `--target http://localhost:<port>` otherwise.

### 3. Ship it

Add an endpoint to your backend and the widget to your frontend. The LLM key stays on your server.

**Add the endpoint.**

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

**Add the widget.**

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

Install `spotter-sdk` as a regular dependency (not `-D`) once the widget and endpoint import it.

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

Python: `LLMConfig(api_key=..., base_url=..., model=...)`. For `analyze` and `dev`, set `SPOTTER_LLM_API_KEY` (or `OPENAI_API_KEY`), `SPOTTER_LLM_BASE_URL` and `SPOTTER_LLM_MODEL`, in your shell or `.env`. `--model` overrides the model for one run.

## Page actions

`analyze` generates page actions when a key is set. Each one is tied to a control it found in your code, so the model can't invent a button that doesn't exist:

```json
{
  "path": "/settings/billing",
  "title": "Billing",
  "description": "Change your plan, update your card and download past invoices.",
  "reachableFrom": ["/settings"],
  "actions": [
    { "name": "change_plan", "description": "Upgrade or downgrade your plan", "selector": "role=button[name=\"Change plan\"]" }
  ]
}
```

"Change my plan" now goes Settings → Billing and highlights the button. A selector is CSS (`[data-testid="change-plan"]`) or `role=<role>[name="<visible text>"]`, which the widget matches by accessible role and name. Every control found on a page is listed under its `selectors`, so you can add or fix actions by hand. Re-runs keep your actions. Delete a route's `actions` to regenerate them.

To hide a route, set `"navigable": false`. To show one that `analyze` hid, set `"navigable": true`. Full format: [docs/graph-format.md](docs/graph-format.md).

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
| `No supported framework detected` | Run `analyze` from your frontend repo root, or pass `--root ./path`. If your routes are plain route arrays or `<Route>` trees, point at them with `--routes <file>`; otherwise write a small `spotter.config.json` by hand ([format](docs/graph-format.md)). |
| `Found 0 routes` or routes missing | Check with `analyze --dry-run`, then name the route files: `--routes src/router.tsx --routes src/admin/routes.tsx@/admin`. |
| A page is hidden that shouldn't be (or the reverse) | Set `"navigable": true` (or `false`) on it in `spotter.config.json`. Re-runs keep it. |
| Descriptions say "Billing page" | No LLM key was found. Set `OPENAI_API_KEY` or `SPOTTER_LLM_API_KEY` and re-run `analyze`. |
| A button has no selector | Its text comes from code (e.g. `t('save')`), so it can't be read statically. Add a `data-testid` or `aria-label`. |
| `dev`: no dev server found | Start your app first, or pass `--target http://localhost:<port>`. |
| Every query is `unhandled` | Usually a bad LLM key, wrong `baseURL`/`model`, or no routes in the config. `spotter-sdk dev` prints the LLM error next to each question. Python logs the cause under the `spotter_sdk` logger; in Node, the analytics event carries `error`. |
| Config not found | The path resolves from the server's working directory. Use an absolute path, or `Path(__file__).parent / ...` in Python. |
| Wrong page chosen | Edit that route's `description` in `spotter.config.json`. It's what the LLM matches against. |
| Widget can't reach the endpoint | Check `proxyUrl`, that JSON body parsing is on (`express.json()`), and CORS if the widget is on another origin. |

## Known limitations

- Steps click links by `href`. If the link isn't on the page, the widget navigates directly.
- Dynamic routes such as `/invoices/:id` are hidden, because Spotter can't fill in a record id yet.
- Controls are found from your source code, so buttons whose text is computed at runtime need a `data-testid` or `aria-label`.
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
spotter-sdk analyze [options]
  --root <dir>              project root (default: cwd)
  --output <path>           config file (default: <root>/spotter.config.json)
  --routes <file[@/mount]>  read routes from these files instead of auto-discovery; repeatable.
                            @/mount prefixes that file's routes, e.g. src/admin/routes.tsx@/admin
  --exclude <prefix>        leave out routes under a path, e.g. /api; repeatable
  --dry-run                 print what was found, write nothing (--json for machine output)
  --no-llm                  don't call an LLM, even if a key is set
  --model <name>            model for descriptions and actions (default: gpt-4o-mini)

spotter-sdk dev [options]
  --target <url>            your running dev server (default: first found on common ports)
  --port <n>                port for the dev proxy (default: 4400)
  --config <path>           config to serve (default: ./spotter.config.json)
  --model <name>            model that routes questions (default: gpt-4o-mini)
```

The config format is documented in [docs/graph-format.md](docs/graph-format.md). It is language-neutral, and shared fixtures in [`/conformance`](conformance) keep the TypeScript and Python SDKs identical.

## Security

- The LLM key stays on your server. The widget only talks to your endpoint.
- At runtime, the LLM sees your route summary and the user's question, nothing else from your app. `analyze` sends each page's source code to the model you configure, once, when you run it. Use `--no-llm` or the coding-agent plugin if your code can't leave your machine.
- Spotter doesn't replace your permission checks, and your endpoint calls an LLM per request, so put it behind your normal auth and rate limiting.
- The widget builds DOM nodes directly (no `innerHTML`).

## Contributing

```bash
npm install && npm run check && npm run build

cd packages/python
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/pytest
```

To try your local build in another project without publishing: `node /path/to/this/repo/dist/cli/cli.js analyze` (or `dev`), and `pip install -e "/path/to/this/repo/packages/python[fastapi]"`. In a pnpm project, use `pnpm add -D /path/to/this/repo`; npm can't install into a pnpm `node_modules`.

## License

ISC
