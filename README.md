# spotter-sdk

Add a natural-language navigation layer to any existing web app. Users type what they want; Spotter navigates the UI for them or hits the right API endpoint.

```
"show me my unpaid invoices" → navigates to /billing/invoices?status=unpaid
"change to dark mode"        → PATCH /api/preferences { theme: 'dark' }
```

## How it works

Two separate pieces — one for your backend, one for your frontend:

```
Browser (your frontend)              Your server (Node.js)        OpenAI
────────────────────────────────────────────────────────────────────────
Widget (spotter-sdk)      →POST→     createSpotterProxy()  →HTTP→  LLM
proxyUrl: '/api/spotter'             reads OPENAI_API_KEY
                                     from server env var
```

1. You author a `spotter.config.json` that maps your routes, selectors, and API endpoints.
2. You mount the proxy middleware on your **Node.js server** — your LLM key lives in a server-side environment variable and never reaches the browser.
3. You drop the widget script into your **frontend** — users get a floating chat panel that talks only to your server.

The widget sends queries to your proxy. The proxy routes them through an LLM, matches to your config, and returns either navigation steps or an action result.

## Packages

| Import path | Use case |
|---|---|
| `spotter-sdk` | Browser widget (ESM/IIFE) |
| `spotter-sdk/proxy` | Node.js proxy middleware |

## Quick start

### 1. Author `spotter.config.json`

```json
{
  "version": "1",
  "baseUrl": "https://app.example.com",
  "routes": [
    {
      "path": "/settings/appearance",
      "description": "Change theme, language, or display preferences",
      "selectors": {
        "themeToggle": "[data-testid='theme-toggle']"
      }
    },
    {
      "path": "/billing/invoices",
      "description": "View and manage invoices"
    }
  ],
  "actions": [
    {
      "intent": "change theme",
      "type": "api",
      "endpoint": "/api/preferences",
      "auth": "session"
    }
  ],
  "mcpServers": []
}
```

### 2. Mount the proxy (Express example)

```ts
import express from 'express'
import { createSpotterProxy } from 'spotter-sdk/proxy'

const app = express()
app.use(express.json())

const spotterProxy = createSpotterProxy({
  config: './spotter.config.json',   // path or parsed object
  llm: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  },
})

app.post('/api/spotter', (req, res) => spotterProxy(req, res))
```

The proxy accepts `POST` requests with body `{ query, url, sessionToken?, role? }` and returns a `SpotterResponse`.

### 3. Add the widget

```html
<script src="https://unpkg.com/spotter-sdk/dist/index.iife.js"></script>
<script>
  Spotter.init({
    proxyUrl: '/api/spotter',
    sessionToken: () => window.__SESSION_TOKEN__,  // optional
    onUnhandled: (query) => {
      // forward to your existing chatbot if you have one
    },
  })
</script>
```

Or with ESM bundlers:

```ts
import { Spotter } from 'spotter-sdk'

Spotter.init({
  proxyUrl: '/api/spotter',
  sessionToken: () => getSessionToken(),
})
```

## Self-hosting / local dev

You need a Node.js server running alongside your frontend. Minimal example:

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
app.use(express.static('public'))  // your frontend lives here

const spotter = createSpotterProxy({
  config: './spotter.config.json',
  llm: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY },
})

app.post('/api/spotter', (req, res) => spotter(req, res))
app.listen(3000)
```

```bash
node server.mjs
# open http://localhost:3000
```

For production, set `OPENAI_API_KEY` as an environment variable in your hosting platform (Vercel, Railway, Render, Fly.io, etc.). The key never leaves your server.

## Response types

```ts
type SpotterResponse =
  | { type: 'navigate'; steps: NavigateStep[] }   // widget walks the user through the UI
  | { type: 'answer';   content: string }          // direct text answer
  | { type: 'unhandled'; query: string }           // LLM couldn't match anything
  | { type: 'error';    message: string }
```

Navigate steps include `selector`, `description`, and `interactionType` (`click | expand | none`).

## Config reference

```ts
type SpotterConfig = {
  version: '1'
  baseUrl: string           // canonical origin of your app
  routes: Route[]
  actions: Action[]
  mcpServers: MCPServer[]
}

type Route = {
  path: string              // e.g. "/settings/appearance"
  description: string       // used for LLM matching
  selectors?: Record<string, string>  // named CSS selectors for navigation
  role?: string             // restrict to users with this role
}

type Action = {
  intent: string            // e.g. "change theme"
  type: 'api'
  endpoint: string          // relative path, e.g. "/api/preferences"
  auth: 'session'           // always uses the user's session token
  role?: string
}

type MCPServer = {
  url: string               // MCP server URL
  allowedTools?: string[]   // tool allow-list; omit to allow all
}
```

## `Spotter.init` options

```ts
type SpotterInitOptions = {
  proxyUrl: string                        // where your proxy is mounted
  sessionToken?: () => string | undefined // called per-request
  role?: string                           // passed to proxy for role-based routing
  onUnhandled?: (query: string) => void   // called when query type is 'unhandled'
  spotterKey?: string                     // reserved for Spotter Cloud
}
```

## Free vs paid

| Feature | Self-hosted OSS |
|---|---|
| Navigation (walk user through UI) | ✓ |
| Direct API actions | coming (action tier) |
| MCP tool calls | coming (action tier) |

Action execution requires a configured LLM proxy. The OSS proxy stubs action responses today; full action dispatch is on the roadmap.

## Security

- **LLM key never reaches the browser.** The widget only talks to your proxy; your proxy holds the key.
- **Session tokens are the user's own tokens.** Your backend enforces permissions as normal.
- **No `innerHTML`.** The widget builds DOM nodes directly to prevent XSS.

## Development

```bash
npm install
npm test          # 39 tests, vitest
npm run build     # tsup → dist/ (browser) + dist/node/ (node)
```
