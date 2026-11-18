# spotter-sdk

Add a natural-language navigation layer to any existing web app. Users type what they want; Spotter navigates the UI for them.

```
"show me my unpaid invoices" → navigates to /billing/invoices?status=unpaid
"change to dark mode"        → walks user to /settings/appearance
```

## How it works

Two separate pieces — one for your backend, one for your frontend:

```
Browser (your frontend)              Your server (Node.js)        LLM
────────────────────────────────────────────────────────────────────────
Widget (spotter-sdk)      →POST→     createSpotterProxy()  →HTTP→  gpt-4o-mini
proxyUrl: '/api/spotter'             reads API key
                                     from server env var
```

1. Run `spotter analyze` — scans your codebase, writes `spotter.config.json` automatically.
2. Mount the proxy middleware on your Node.js server — your LLM key stays server-side.
3. Add the widget script tag — users get a floating chat panel.

## Packages

| Import path | Use case |
|---|---|
| `spotter-sdk` | Browser widget (ESM/IIFE) |
| `spotter-sdk/proxy` | Node.js proxy middleware |

## Quick start

### Step 1: Analyze your codebase

```bash
npx spotter-sdk analyze
```

Detects your framework (Next.js, React Router, Vue Router), extracts routes and selectors, and writes `spotter.config.json`. Set `OPENAI_API_KEY` for LLM-generated descriptions; falls back to path-based descriptions if not set.

```bash
# Optional flags
npx spotter-sdk analyze \
  --root ./my-app \
  --output ./spotter.config.json \
  --base-url https://app.example.com
```

You can also author `spotter.config.json` by hand — see [Config reference](#config-reference).

### Step 2: Mount the proxy

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

### Step 3: Add the widget

```html
<script src="https://unpkg.com/spotter-sdk/dist/index.iife.js"></script>
<script>
  Spotter.init({
    proxyUrl: '/api/spotter',
    sessionToken: () => window.__SESSION_TOKEN__,
    onUnhandled: (query) => {
      // forward to your existing chatbot if you have one
    },
  })
</script>
```

Or with ESM bundlers:

```ts
import { Spotter } from 'spotter-sdk'

Spotter.init({ proxyUrl: '/api/spotter' })
```

## LLM providers

Any OpenAI-compatible endpoint works. Set `baseURL` to switch:

```ts
// OpenAI (default — no baseURL needed)
createSpotterProxy({ config: '...', llm: { apiKey: process.env.OPENAI_API_KEY! } })

// OpenRouter (access Claude, Gemini, Llama, etc.)
createSpotterProxy({
  config: '...',
  llm: {
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3-haiku',
  },
})

// Self-hosted Ollama
createSpotterProxy({
  config: '...',
  llm: {
    apiKey: 'ollama',
    baseURL: 'http://localhost:11434/v1',
    model: 'llama3',
  },
})
```

The CLI reads the same env vars:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key (required for descriptions) |
| `SPOTTER_LLM_BASE_URL` | Override endpoint (e.g. OpenRouter) |
| `SPOTTER_LLM_MODEL` | Override model (default: `gpt-4o-mini`) |

## Analytics

Track what your users are asking for:

```ts
createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY! },
  onAnalytics: (event) => {
    // event.query        — what the user typed
    // event.responseType — 'navigate' | 'answer' | 'unhandled' | 'error'
    // event.url          — page the user was on
    // event.role         — user role if passed to Spotter.init
    console.log(event)
  },
})
```

`unhandled` events are the most valuable signal — they show you what users are looking for that Spotter couldn't find. Use them to improve your config or identify missing features.

## Self-hosting / local dev

```bash
npm install spotter-sdk express dotenv
```

```
# .env  (do not commit)
OPENAI_API_KEY=sk-...
```

```js
// server.mjs
import 'dotenv/config'
import express from 'express'
import { createSpotterProxy } from 'spotter-sdk/proxy'

const app = express()
app.use(express.json())
app.use(express.static('public'))

const spotter = createSpotterProxy({
  config: './spotter.config.json',
  llm: { apiKey: process.env.OPENAI_API_KEY },
})

app.post('/api/spotter', (req, res) => spotter(req, res))
app.listen(3000)
```

```bash
node server.mjs
```

For production, set `OPENAI_API_KEY` as an environment variable in your hosting platform. The key never leaves your server.

## Response types

```ts
type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }   // widget walks the user through the UI
  | { type: 'answer';   content: string }          // direct text answer
  | { type: 'unhandled'; query: string }           // LLM couldn't match anything
  | { type: 'error';    message: string }
```

## Config reference

`spotter.config.json` is generated by `spotter analyze` and committed to git.

```ts
type SpotterConfig = {
  version: '1'
  baseUrl: string
  routes: Route[]
  actions: Action[]
  mcpServers: MCPServer[]
}

type Route = {
  path: string
  description: string        // matched against user queries
  selectors?: Record<string, string>
  role?: string
}

type Action = {
  intent: string
  type: 'api'
  endpoint: string
  auth: 'session'
  role?: string
}

type MCPServer = {
  url: string
  allowedTools?: string[]
}
```

## `Spotter.init` options

```ts
type SpotterInitOptions = {
  proxyUrl: string
  sessionToken?: () => string | undefined
  role?: string
  onUnhandled?: (query: string) => void
  spotterKey?: string
}
```

## Security

- **LLM key never reaches the browser.** The widget only talks to your proxy.
- **Session tokens are the user's own tokens.** Your backend enforces permissions as normal.
- **No `innerHTML`.** The widget builds DOM nodes directly to prevent XSS.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsup → dist/ (browser) + dist/node/ (node) + dist/cli/ (CLI)
npx spotter-sdk analyze --help
```
